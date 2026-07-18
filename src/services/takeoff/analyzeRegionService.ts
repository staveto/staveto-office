/**
 * Client-side orchestrator for POST-equivalent analyze-region flow.
 *
 * Renders the PDF page at high DPI via pdf.js (same stack as find-similar),
 * crops the selected normalized bbox, runs color/contour detection, persists
 * drawing_regions + symbol_candidates, and returns the API response shape.
 *
 * Phase 1: no Gemini, no quote / takeoff quantity writes.
 */

import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import {
  analyzeRegionRaster,
  bboxPdfToNormalizedRect,
  ensureMinimumAnalyzeRegion,
  normalizedRectToBBoxPdf,
  type RegionAnalyzeDebug,
} from "@/lib/takeoff/regionAnalyzer";
import { attachCandidatePreviewUrls } from "@/lib/takeoff/takeoffImages";
import {
  attachNearbyTextToCandidates,
  filterCandidatesOverlappingOcrText,
} from "@/lib/takeoff/ocrNearbyText";
import {
  dedupeOverlappingCandidates,
  mergeRasterAndTemplateCandidates,
} from "@/lib/takeoff/regionCandidateMerge";
import {
  matchTemplatesAgainstRegion,
  type TemplateShapeRef,
} from "@/lib/takeoff/regionTemplateMatch";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type {
  AnalyzeRegionCandidateDto,
  AnalyzeRegionResponse,
  BBoxPdf,
  BBoxPx,
  PlanQuality,
} from "@/types/pdfTakeoff";
import {
  createDrawingRegion,
  listSymbolTemplatesForProject,
  saveSymbolCandidates,
  updateDrawingRegionStatus,
} from "@/services/takeoff/pdfTakeoffRegionService";
import {
  createCandidatePreviewImage,
  createRegionImage,
  cropRaster,
  loadImageUrlAsRaster,
  renderPageRaster,
} from "@/services/takeoff/takeoffImageService";
import {
  colorInkMask,
  resampleMaskToGrid,
} from "@/services/takeoff/similarSymbolDetectionService";
import { runOcrOnRasterRegion } from "@/services/takeoff/ocrAdapter";

/**
 * Best-effort load of the project's symbolTemplates as component shape refs
 * for matchTemplatesAgainstRegion. Any failure (Firestore, image decode)
 * just yields fewer/no templates — analyze-region always falls back to the
 * raster/color candidates alone.
 */
async function loadTemplateShapeRefs(
  projectId: string,
  profession: string
): Promise<TemplateShapeRef[]> {
  try {
    const templates = await listSymbolTemplatesForProject(projectId, profession);
    const refs = await Promise.all(
      templates.map(async (tmpl): Promise<TemplateShapeRef | null> => {
        if (!tmpl.templateImageUrl) return null;
        if (tmpl.colorLayer !== "green" && tmpl.colorLayer !== "red" && tmpl.colorLayer !== "orange") {
          return null;
        }
        const raster = await loadImageUrlAsRaster(tmpl.templateImageUrl).catch(() => null);
        if (!raster) return null;
        const ink = colorInkMask(raster, tmpl.colorLayer);
        if (!ink || ink.width < 4 || ink.height < 4) return null;
        return {
          templateId: tmpl.id,
          symbolType: tmpl.symbolType,
          colorLayer: tmpl.colorLayer,
          refShape: resampleMaskToGrid(ink.mask, ink.width, ink.height),
          refPxW: ink.width,
          refPxH: ink.height,
        };
      })
    );
    return refs.filter((r): r is TemplateShapeRef => r !== null);
  } catch {
    return [];
  }
}

type AnalyzeRegionCoreParams = {
  projectId: string;
  drawingId: string;
  pageNumber: number;
  profession: string;
  raster: RasterImage;
  pageWidthPt: number;
  pageHeightPt: number;
  /** Crop origin/size in full-page pixels: [x0, y0, x1, y1]. */
  regionBboxPx: BBoxPx;
  /** Same crop, normalized to the full page (0..1) — for bbox_pdf remap. */
  normalizedBbox: NormalizedRect;
  regionIdPrefix: string;
  /** Whole-page tiled scans skip per-candidate OCR (each tile already ran it would be wasteful); default true. */
  runOcr?: boolean;
};

type AnalyzeRegionCoreResult = {
  candidates: AnalyzeRegionCandidateDto[];
  planQuality: PlanQuality;
  /** Raw raster-only summary from analyzeRegionRaster (ignored_text_or_dimensions is stable pre-merge/OCR). */
  rasterSummary: {
    green_candidates: number;
    red_candidates: number;
    orange_candidates: number;
    ignored_text_or_dimensions: number;
    needs_review: number;
  };
  debugBase: RegionAnalyzeDebug;
  /** Raw template matches before self-dedupe/merge (debug only, empty when no templates matched). */
  templateMatchesBeforeDedupe: AnalyzeRegionCandidateDto[];
  mergedWithRasterCount: number;
  overlapsTextRejectedCount: number;
};

/**
 * Shared core: crop → raster detection → template match/merge → OCR text
 * filter → preview crops. No Firestore writes — callers decide how/whether
 * to persist (single-region analyze persists immediately; whole-page scan
 * accumulates candidates across tiles before saving once).
 */
async function analyzeRegionCore(params: AnalyzeRegionCoreParams): Promise<AnalyzeRegionCoreResult> {
  const {
    projectId,
    drawingId,
    pageNumber,
    profession,
    raster,
    pageWidthPt,
    pageHeightPt,
    regionBboxPx,
    normalizedBbox,
    regionIdPrefix,
    runOcr = true,
  } = params;

  const regionRaster = cropRaster(raster, regionBboxPx);
  const analyzed = analyzeRegionRaster({
    regionRaster,
    pageNumber,
    profession,
    regionBboxPx: [
      regionBboxPx[0],
      regionBboxPx[1],
      regionBboxPx[2] - regionBboxPx[0],
      regionBboxPx[3] - regionBboxPx[1],
    ],
    pageWidthPx: raster.width,
    pageHeightPx: raster.height,
    pageWidthPt,
    pageHeightPt,
    regionIdPrefix,
  });

  let candidates: AnalyzeRegionCandidateDto[] = analyzed.candidates.map((c) => ({
    ...c,
    bbox_pdf: normalizedRectToBBoxPdf(c.normalized_position, pageWidthPt, pageHeightPt),
  }));

  // Analyze Region v2 A1 — reuse the existing "find similar" component
  // matcher against project symbolTemplates. Best-effort: template
  // loading/matching never blocks or fails the raster-based result.
  let templateMatchesBeforeDedupe: AnalyzeRegionCandidateDto[] = [];
  let mergedWithRasterCount = 0;
  try {
    const templateRefs = await loadTemplateShapeRefs(projectId, profession);
    if (templateRefs.length > 0) {
      const regionOriginPx: BBoxPx = [
        regionBboxPx[0],
        regionBboxPx[1],
        regionBboxPx[2] - regionBboxPx[0],
        regionBboxPx[3] - regionBboxPx[1],
      ];
      const templateCandidates = matchTemplatesAgainstRegion({
        regionRaster,
        templates: templateRefs,
        regionBboxPx: regionOriginPx,
        pageWidthPx: raster.width,
        pageHeightPx: raster.height,
        pageNumber,
        pageWidthPt,
        pageHeightPt,
      });
      templateMatchesBeforeDedupe = templateCandidates;
      const merge = mergeRasterAndTemplateCandidates({
        rasterCandidates: candidates,
        templateCandidates,
      });
      candidates = merge.candidates;
      mergedWithRasterCount = merge.mergedWithRasterCount;
    }
  } catch (err) {
    console.warn("[analyzeRegionService] template matching failed", err);
  }

  // Phase 3B — best-effort nearby OCR text (context only, never touches
  // status/labels/quantities). The analyzed region is already a small
  // neighborhood, so we OCR it directly instead of the full page.
  let overlapsTextRejectedCount = 0;
  if (runOcr && candidates.length > 0) {
    const ocr = await runOcrOnRasterRegion({
      pageRaster: raster,
      regionOnPage: normalizedBbox,
    }).catch(() => null);
    candidates = attachNearbyTextToCandidates(candidates, ocr);
    const textFiltered = filterCandidatesOverlappingOcrText(candidates, ocr);
    candidates = textFiltered.candidates;
    overlapsTextRejectedCount = textFiltered.rejectedIds.length;
  }

  // Phase 2.5 — best-effort preview crops. Failures keep previewImageUrl
  // null; candidates are always usable either way.
  const previewUrls = new Map<string, string | null>(
    await Promise.all(
      candidates.map(
        async (c): Promise<[string, string | null]> => [
          c.id,
          await createCandidatePreviewImage({
            projectId,
            drawingId,
            candidateId: c.id,
            pageRaster: raster,
            normalizedPosition: c.normalized_position,
          }),
        ]
      )
    )
  );
  candidates = attachCandidatePreviewUrls(candidates, previewUrls);

  return {
    candidates,
    planQuality: {
      detectedPlanType: analyzed.planQuality.detectedPlanType,
      hasTextLayer: analyzed.planQuality.hasTextLayer,
      hasVectorObjects: analyzed.planQuality.hasVectorObjects,
      ocrRequired: analyzed.planQuality.ocrRequired,
    },
    rasterSummary: analyzed.summary,
    debugBase: analyzed.debug,
    templateMatchesBeforeDedupe,
    mergedWithRasterCount,
    overlapsTextRejectedCount,
  };
}

export type AnalyzeRegionParams = {
  projectId: string;
  drawingId: string;
  fileUrl: string;
  pageNumber: number;
  /** Normalized (0..1) region on the page — from the takeoff viewer drag. */
  normalizedBbox: NormalizedRect;
  profession?: string;
  createdBy?: string;
  /** Target render width in px (~300–450 DPI equivalent for A3-ish pages). */
  targetPageWidthPx?: number;
};

/** Response + dev-only diagnostics (never persisted, never affects data). */
export type AnalyzeRegionClientResponse = AnalyzeRegionResponse & {
  debug?: RegionAnalyzeDebug;
  region_image_url?: string | null;
  /** True when the drawn rect was too small and a wider neighborhood was analyzed. */
  region_expanded?: boolean;
};

/**
 * Analyze a user-drawn (or viewport-visible) region and persist candidates
 * (review-only — never confirms, never touches takeoffItems/evidence).
 */
export async function analyzeDrawingRegion(
  params: AnalyzeRegionParams
): Promise<AnalyzeRegionClientResponse> {
  const {
    projectId,
    drawingId,
    fileUrl,
    pageNumber,
    normalizedBbox: drawnBbox,
    profession = "electrical",
    createdBy,
    targetPageWidthPx = 2200,
  } = params;

  // A tight box around one symbol (or a plain click) is auto-expanded to a
  // useful neighborhood — the analysis then covers the symbol's surroundings.
  const expansion = ensureMinimumAnalyzeRegion(drawnBbox);
  const normalizedBbox = expansion.rect;

  const rendered = await renderPageRaster(fileUrl, pageNumber, targetPageWidthPx);
  if (!rendered) {
    throw new Error("PDF_RENDER_FAILED");
  }

  const { raster, pageWidthPt, pageHeightPt } = rendered;

  // Convert normalized overlay rect → page pixels at this render scale.
  const regionBboxPx: BBoxPx = [
    normalizedBbox.x * raster.width,
    normalizedBbox.y * raster.height,
    (normalizedBbox.x + normalizedBbox.width) * raster.width,
    (normalizedBbox.y + normalizedBbox.height) * raster.height,
  ];

  // Prefer PDF-point bbox when page size in points is known.
  const bboxPdf: BBoxPdf = normalizedRectToBBoxPdf(
    normalizedBbox,
    pageWidthPt,
    pageHeightPt
  );

  const region = await createDrawingRegion({
    projectId,
    drawingId,
    pageNumber,
    bboxPdf,
    normalizedBbox,
    profession,
    createdBy,
    status: "pending",
  });

  try {
    const core = await analyzeRegionCore({
      projectId,
      drawingId,
      pageNumber,
      profession,
      raster,
      pageWidthPt,
      pageHeightPt,
      regionBboxPx,
      normalizedBbox,
      regionIdPrefix: `cand_${region.id}`,
    });
    const candidates = core.candidates;

    const regionImageUrl = await createRegionImage({
      projectId,
      drawingId,
      regionId: region.id,
      pageRaster: raster,
      normalizedBbox,
    });

    await saveSymbolCandidates(
      projectId,
      region.id,
      drawingId,
      pageNumber,
      candidates
    );
    await updateDrawingRegionStatus(projectId, region.id, "analyzed", {
      regionImageUrl,
    });

    return {
      region_id: region.id,
      plan_quality: {
        detected_plan_type: core.planQuality.detectedPlanType,
        has_text_layer: core.planQuality.hasTextLayer,
        has_vector_objects: core.planQuality.hasVectorObjects,
        ocr_required: core.planQuality.ocrRequired,
      },
      summary: {
        ...core.rasterSummary,
        green_candidates: candidates.filter((c) => c.color_layer === "green").length,
        red_candidates: candidates.filter((c) => c.color_layer === "red").length,
        orange_candidates: candidates.filter((c) => c.color_layer === "orange").length,
        needs_review: candidates.length,
      },
      candidates,
      debug: {
        ...core.debugBase,
        candidatesAfterFilter: candidates.length,
        region: {
          originalRect: drawnBbox,
          expandedRect: normalizedBbox,
          autoExpanded: expansion.autoExpanded,
        },
        templateMatchesBeforeDedupe:
          core.templateMatchesBeforeDedupe.length > 0 ? core.templateMatchesBeforeDedupe : undefined,
        mergedWithRasterCount: core.mergedWithRasterCount > 0 ? core.mergedWithRasterCount : undefined,
        overlapsTextRejectedCount:
          core.overlapsTextRejectedCount > 0 ? core.overlapsTextRejectedCount : undefined,
      },
      region_image_url: regionImageUrl,
      region_expanded: expansion.autoExpanded,
    };
  } catch (err) {
    await updateDrawingRegionStatus(projectId, region.id, "failed").catch(() => undefined);
    throw err;
  }
}

/** Normalized (0..1) tiles covering the whole page with a fractional overlap. */
export function buildPageScanTiles(
  cols: number,
  rows: number,
  overlap: number
): NormalizedRect[] {
  const tiles: NormalizedRect[] = [];
  const tileW = 1 / cols;
  const tileH = 1 / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = Math.max(0, col * tileW - overlap * tileW);
      const y0 = Math.max(0, row * tileH - overlap * tileH);
      const x1 = Math.min(1, (col + 1) * tileW + overlap * tileW);
      const y1 = Math.min(1, (row + 1) * tileH + overlap * tileH);
      tiles.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
  }
  return tiles;
}

export type ScanWholePageParams = {
  projectId: string;
  drawingId: string;
  fileUrl: string;
  pageNumber: number;
  profession?: string;
  createdBy?: string;
  targetPageWidthPx?: number;
  /** Defaults to a 3×2 grid with 12% overlap — small enough to catch symbols split across a tile edge. */
  tileGrid?: { cols: number; rows: number; overlap?: number };
};

export type ScanWholePageResponse = {
  region_id: string;
  plan_quality: AnalyzeRegionResponse["plan_quality"];
  summary: AnalyzeRegionResponse["summary"] & {
    tiles_scanned: number;
    duplicates_removed: number;
  };
  candidates: AnalyzeRegionCandidateDto[];
  debug?: RegionAnalyzeDebug;
};

/**
 * "Skenovať celú stranu" — tile the whole page with overlap, run the same
 * analyze-region v2 pipeline per tile, merge/dedupe across tile overlaps,
 * and save the result as symbolCandidates ONCE (one drawingRegion doc for
 * the whole page). Never creates confirmedSymbols/takeoffItems/evidence.
 */
export async function scanWholeDrawingPage(
  params: ScanWholePageParams
): Promise<ScanWholePageResponse> {
  const {
    projectId,
    drawingId,
    fileUrl,
    pageNumber,
    profession = "electrical",
    createdBy,
    targetPageWidthPx = 2200,
    tileGrid,
  } = params;
  const cols = tileGrid?.cols ?? 3;
  const rows = tileGrid?.rows ?? 2;
  const overlap = tileGrid?.overlap ?? 0.12;

  const rendered = await renderPageRaster(fileUrl, pageNumber, targetPageWidthPx);
  if (!rendered) {
    throw new Error("PDF_RENDER_FAILED");
  }
  const { raster, pageWidthPt, pageHeightPt } = rendered;
  const fullPageRect: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

  const region = await createDrawingRegion({
    projectId,
    drawingId,
    pageNumber,
    bboxPdf: normalizedRectToBBoxPdf(fullPageRect, pageWidthPt, pageHeightPt),
    normalizedBbox: fullPageRect,
    profession,
    createdBy,
    status: "pending",
  });

  try {
    const tiles = buildPageScanTiles(cols, rows, overlap);
    const allCandidates: AnalyzeRegionCandidateDto[] = [];
    let lastDebugBase: RegionAnalyzeDebug | null = null;
    let planQuality: PlanQuality = {
      detectedPlanType: "unknown",
      hasTextLayer: false,
      hasVectorObjects: false,
      ocrRequired: true,
    };

    for (let i = 0; i < tiles.length; i++) {
      const tileRect = tiles[i]!;
      const regionBboxPx: BBoxPx = [
        tileRect.x * raster.width,
        tileRect.y * raster.height,
        (tileRect.x + tileRect.width) * raster.width,
        (tileRect.y + tileRect.height) * raster.height,
      ];
      const core = await analyzeRegionCore({
        projectId,
        drawingId,
        pageNumber,
        profession,
        raster,
        pageWidthPt,
        pageHeightPt,
        regionBboxPx,
        normalizedBbox: tileRect,
        regionIdPrefix: `cand_${region.id}_t${i}`,
      });
      allCandidates.push(...core.candidates);
      lastDebugBase = core.debugBase;
      planQuality = core.planQuality;
    }

    const deduped = dedupeOverlappingCandidates(allCandidates);
    const finalCandidates = deduped.candidates;

    await saveSymbolCandidates(projectId, region.id, drawingId, pageNumber, finalCandidates);
    await updateDrawingRegionStatus(projectId, region.id, "analyzed");

    return {
      region_id: region.id,
      plan_quality: {
        detected_plan_type: planQuality.detectedPlanType,
        has_text_layer: planQuality.hasTextLayer,
        has_vector_objects: planQuality.hasVectorObjects,
        ocr_required: planQuality.ocrRequired,
      },
      summary: {
        green_candidates: finalCandidates.filter((c) => c.color_layer === "green").length,
        red_candidates: finalCandidates.filter((c) => c.color_layer === "red").length,
        orange_candidates: finalCandidates.filter((c) => c.color_layer === "orange").length,
        ignored_text_or_dimensions: 0,
        needs_review: finalCandidates.length,
        tiles_scanned: tiles.length,
        duplicates_removed: deduped.dedupedCount,
      },
      candidates: finalCandidates,
      debug: lastDebugBase
        ? {
            ...lastDebugBase,
            candidatesAfterFilter: finalCandidates.length,
            region: {
              originalRect: fullPageRect,
              expandedRect: fullPageRect,
              autoExpanded: false,
            },
          }
        : undefined,
    };
  } catch (err) {
    await updateDrawingRegionStatus(projectId, region.id, "failed").catch(() => undefined);
    throw err;
  }
}

/** Helper for API callers that already have a crop raster (tests / server). */
export function analyzeRegionFromRaster(input: {
  regionRaster: RasterImage;
  pageNumber: number;
  profession: string;
  regionBboxPx: BBoxPx;
  pageWidthPx: number;
  pageHeightPx: number;
  pageWidthPt?: number;
  pageHeightPt?: number;
  regionId: string;
}): AnalyzeRegionResponse {
  const analyzed = analyzeRegionRaster({
    ...input,
    regionIdPrefix: `cand_${input.regionId}`,
  });
  return {
    region_id: input.regionId,
    plan_quality: {
      detected_plan_type: analyzed.planQuality.detectedPlanType,
      has_text_layer: analyzed.planQuality.hasTextLayer,
      has_vector_objects: analyzed.planQuality.hasVectorObjects,
      ocr_required: analyzed.planQuality.ocrRequired,
    },
    summary: analyzed.summary,
    candidates: analyzed.candidates,
  };
}

export { bboxPdfToNormalizedRect, normalizedRectToBBoxPdf };
