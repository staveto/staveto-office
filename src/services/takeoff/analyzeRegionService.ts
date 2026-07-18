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
import { mergeRasterAndTemplateCandidates } from "@/lib/takeoff/regionCandidateMerge";
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
 * Analyze a user-drawn region and persist candidates (review-only).
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
      regionIdPrefix: `cand_${region.id}`,
    });

    // Ensure bbox_pdf on candidates uses PDF points (re-map from normalized).
    let candidates: AnalyzeRegionCandidateDto[] = analyzed.candidates.map((c) => ({
      ...c,
      bbox_pdf: normalizedRectToBBoxPdf(
        c.normalized_position,
        pageWidthPt,
        pageHeightPt
      ),
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
          regionRaster: cropRaster(raster, regionBboxPx),
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
    // status/labels/quantities). The user-drawn region is already a small
    // neighborhood, so we OCR it directly instead of the full page.
    let overlapsTextRejectedCount = 0;
    if (candidates.length > 0) {
      const ocr = await runOcrOnRasterRegion({
        pageRaster: raster,
        regionOnPage: normalizedBbox,
      }).catch(() => null);
      candidates = attachNearbyTextToCandidates(candidates, ocr);
      // Colored text runs that slipped past the raster shape filters —
      // an extra, best-effort noise filter. Never touches confirmed/manual/
      // template_match/mixed candidates (see filterCandidatesOverlappingOcrText).
      const textFiltered = filterCandidatesOverlappingOcrText(candidates, ocr);
      candidates = textFiltered.candidates;
      overlapsTextRejectedCount = textFiltered.rejectedIds.length;
    }

    // Phase 2.5 — best-effort preview crops. Failures keep previewImageUrl
    // null; candidates are always saved either way.
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
        detected_plan_type: analyzed.planQuality.detectedPlanType,
        has_text_layer: analyzed.planQuality.hasTextLayer,
        has_vector_objects: analyzed.planQuality.hasVectorObjects,
        ocr_required: analyzed.planQuality.ocrRequired,
      },
      summary: {
        ...analyzed.summary,
        green_candidates: candidates.filter((c) => c.color_layer === "green").length,
        red_candidates: candidates.filter((c) => c.color_layer === "red").length,
        orange_candidates: candidates.filter((c) => c.color_layer === "orange").length,
        needs_review: candidates.length,
      },
      candidates,
      debug: {
        ...analyzed.debug,
        candidatesAfterFilter: candidates.length,
        region: {
          originalRect: drawnBbox,
          expandedRect: normalizedBbox,
          autoExpanded: expansion.autoExpanded,
        },
        templateMatchesBeforeDedupe:
          templateMatchesBeforeDedupe.length > 0 ? templateMatchesBeforeDedupe : undefined,
        mergedWithRasterCount: mergedWithRasterCount > 0 ? mergedWithRasterCount : undefined,
        overlapsTextRejectedCount:
          overlapsTextRejectedCount > 0 ? overlapsTextRejectedCount : undefined,
      },
      region_image_url: regionImageUrl,
      region_expanded: expansion.autoExpanded,
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
