/**
 * "Skenovať AI (Gemini)" — whole-page vision-based symbol detection for the
 * PDF Takeoff workbench.
 *
 * Reuses the SAME detectPlanSymbols Cloud Function already deployed for the
 * AI Estimator (Gemini vision) — no new package, no new backend. Gemini
 * understands symbol SHAPE + context per position, so it succeeds exactly
 * where the local color-blob pipeline struggles most: tightly clustered or
 * touching identical symbols that get merged into one (and then rejected)
 * by pixel-connectivity detection.
 *
 * This is an explicit, opt-in, paid action — never run automatically.
 * Results are ALWAYS unconfirmed symbolCandidates (source: "gemini",
 * status: "candidate" | "probable"); nothing here ever touches
 * takeoffItems, confirmedSymbols or takeoffEvidence.
 */

import { normalizedRectOverlapRatio } from "@/lib/takeoff/candidateReview";
import { normalizedRectToBBoxPdf } from "@/lib/takeoff/regionAnalyzer";
import { filterCandidatesOverlappingOcrText } from "@/lib/takeoff/ocrNearbyText";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import type { Locale } from "@/i18n/translations";
import {
  detectAllSymbolsOnCanvas,
  type AiDetectedSymbol,
} from "@/services/ai/detectPlanSymbolsService";
import { runOcrOnRasterRegion } from "@/services/takeoff/ocrAdapter";
import {
  createDrawingRegion,
  saveSymbolCandidates,
  updateDrawingRegionStatus,
} from "@/services/takeoff/pdfTakeoffRegionService";
import { renderPageRaster } from "@/services/takeoff/takeoffImageService";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type { AnalyzeRegionCandidateDto, SymbolColorLayer } from "@/types/pdfTakeoff";

/** Gemini "category" → the existing color-layer convention (best-effort, for consistent grouping/overlay color). */
const CATEGORY_TO_COLOR_LAYER: Record<string, SymbolColorLayer> = {
  socket: "green",
  switch: "red",
  lighting: "orange",
  led_strip: "orange",
  distribution_board: "unknown",
  cable: "unknown",
  installation_material: "unknown",
  other: "unknown",
  unknown: "unknown",
};

/** Gemini's own tri-level confidence → the numeric 0..1 scale the rest of the pipeline uses. */
const CONFIDENCE_TO_SCORE: Record<AiDetectedSymbol["confidence"], number> = {
  high: 0.82,
  medium: 0.62,
  low: 0.4,
};

/** Same overlap threshold as the local dedupe pipeline (regionCandidateMerge.ts). */
const AI_DUPLICATE_IOU = 0.3;

/**
 * Real point symbols (socket/switch/light/board) are roughly compact —
 * width ≈ height. Gemini occasionally still mislabels an elongated text row
 * (a legend/schedule line, a room label) as a "symbol"; those boxes are much
 * wider than tall (or vice versa). LED strips/cables are legitimately drawn
 * as long thin lines, so they're exempt from this geometric guard — the OCR
 * text-overlap filter below catches their false positives instead.
 */
const MAX_COMPACT_SYMBOL_ASPECT = 3;
const ELONGATED_CATEGORIES = new Set<AiDetectedSymbol["category"]>(["led_strip", "cable"]);

function isImplausibleTextLikeAspect(detection: AiDetectedSymbol): boolean {
  if (ELONGATED_CATEGORIES.has(detection.category)) return false;
  const { width, height } = detection.bbox;
  if (width <= 0 || height <= 0) return true;
  const aspect = Math.max(width, height) / Math.min(width, height);
  return aspect > MAX_COMPACT_SYMBOL_ASPECT;
}

function toGeminiCandidateDto(params: {
  detection: AiDetectedSymbol;
  pageNumber: number;
  pageWidthPt: number;
  pageHeightPt: number;
  pageWidthPx: number;
  pageHeightPx: number;
  idPrefix: string;
  seq: number;
}): AnalyzeRegionCandidateDto {
  const { detection, pageNumber, pageWidthPt, pageHeightPt, pageWidthPx, pageHeightPx, idPrefix, seq } =
    params;
  const normalized: NormalizedRect = { ...detection.bbox };
  const confidence = CONFIDENCE_TO_SCORE[detection.confidence];
  const colorLayer = CATEGORY_TO_COLOR_LAYER[detection.category] ?? "unknown";
  const label = detection.name?.trim() || detection.category || "symbol";
  return {
    id: `${idPrefix}_${seq}`,
    page_number: pageNumber,
    bbox_pdf: normalizedRectToBBoxPdf(normalized, pageWidthPt, pageHeightPt),
    bbox_px: [
      normalized.x * pageWidthPx,
      normalized.y * pageHeightPx,
      (normalized.x + normalized.width) * pageWidthPx,
      (normalized.y + normalized.height) * pageHeightPx,
    ],
    color_layer: colorLayer,
    kind: "symbol_candidate",
    label_suggestions: [{ label, confidence }],
    nearby_text: null,
    confidence,
    source: "gemini",
    status: confidence >= 0.55 ? "probable" : "candidate",
    preview_image_url: null,
    normalized_position: normalized,
  };
}

/** True when `candidate` overlaps an already-known (non-rejected) item on the same page. */
function overlapsExisting(
  candidate: AnalyzeRegionCandidateDto,
  existing: Array<Pick<AnalyzeRegionCandidateDto, "page_number" | "status" | "normalized_position">>
): boolean {
  return existing.some(
    (e) =>
      e.status !== "rejected" &&
      (e.page_number ?? 0) === (candidate.page_number ?? 0) &&
      normalizedRectOverlapRatio(e.normalized_position, candidate.normalized_position) >=
        AI_DUPLICATE_IOU
  );
}

export type AiScanUnavailableReason = "pdf_render_failed" | "ai_call_failed" | "not_signed_in";

export type ScanWholePageWithAiParams = {
  projectId: string;
  drawingId: string;
  fileUrl: string;
  pageNumber: number;
  profession?: string;
  createdBy?: string;
  targetPageWidthPx?: number;
  language?: Locale;
  /** Already-known candidates/confirmed symbols on this page — used only to skip duplicates, never mutated. */
  existingCandidates?: Array<
    Pick<AnalyzeRegionCandidateDto, "page_number" | "status" | "normalized_position">
  >;
};

export type ScanWholePageWithAiResponse = {
  region_id: string;
  /** New, non-duplicate candidates saved to Firestore. */
  candidates: AnalyzeRegionCandidateDto[];
  detections_found: number;
  duplicates_skipped: number;
  /** Gemini boxes dropped as text/number/legend rows, not real symbols. */
  text_like_filtered: number;
};

/**
 * Real `ImageData` in the browser (required by detectAllSymbolsOnCanvas's
 * internal canvas.putImageData call); a duck-typed fallback in non-browser
 * test environments, where detectAllSymbolsOnCanvas is always mocked so the
 * exact prototype never matters — only that width/height/data flow through.
 */
function rasterToImageData(raster: RasterImage): ImageData {
  const data = new Uint8ClampedArray(raster.data);
  if (typeof ImageData !== "undefined") {
    return new ImageData(data, raster.width, raster.height);
  }
  return { data, width: raster.width, height: raster.height, colorSpace: "srgb" } as ImageData;
}

export class AiScanUnavailableError extends Error {
  reason: AiScanUnavailableReason;
  constructor(reason: AiScanUnavailableReason) {
    super(reason);
    this.name = "AiScanUnavailableError";
    this.reason = reason;
  }
}

/**
 * "Skenovať AI (Gemini)" — render the whole page, ask Gemini vision for
 * every installation symbol it can see, map the results into the existing
 * symbolCandidate model and persist ONLY the ones that aren't already a
 * known candidate/confirmed symbol at (roughly) the same spot.
 */
export async function scanWholeDrawingPageWithAi(
  params: ScanWholePageWithAiParams
): Promise<ScanWholePageWithAiResponse> {
  const {
    projectId,
    drawingId,
    fileUrl,
    pageNumber,
    profession = "electrical",
    createdBy,
    targetPageWidthPx = 2200,
    language = "sk",
    existingCandidates = [],
  } = params;

  const rendered = await renderPageRaster(fileUrl, pageNumber, targetPageWidthPx);
  if (!rendered) {
    throw new AiScanUnavailableError("pdf_render_failed");
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
    const imageData = rasterToImageData(raster);
    const detections = await detectAllSymbolsOnCanvas({ imageData, language });

    // Geometric guard first (cheap, no OCR needed): drop boxes whose shape
    // already gives away that they're a text row/legend line, not an icon.
    const geometricallyPlausible = detections.filter((d) => !isImplausibleTextLikeAspect(d));
    let textLikeFiltered = detections.length - geometricallyPlausible.length;

    const mapped = geometricallyPlausible.map((detection, idx) =>
      toGeminiCandidateDto({
        detection,
        pageNumber,
        pageWidthPt,
        pageHeightPt,
        pageWidthPx: raster.width,
        pageHeightPx: raster.height,
        idPrefix: `cand_${region.id}_ai`,
        seq: idx,
      })
    );

    // OCR guard (best-effort — never blocks the scan if it fails): drop any
    // remaining box that sits mostly inside real recognized text, exactly
    // the case reported by users ("it also found the legend as numbers").
    const ocr = await runOcrOnRasterRegion({
      pageRaster: raster,
      regionOnPage: fullPageRect,
    }).catch(() => null);
    const { candidates: textFiltered, rejectedIds } = filterCandidatesOverlappingOcrText(mapped, ocr);
    textLikeFiltered += rejectedIds.length;

    const newCandidates: AnalyzeRegionCandidateDto[] = [];
    let duplicatesSkipped = 0;
    for (const candidate of textFiltered) {
      if (overlapsExisting(candidate, existingCandidates) || overlapsExisting(candidate, newCandidates)) {
        duplicatesSkipped++;
        continue;
      }
      newCandidates.push(candidate);
    }

    if (newCandidates.length > 0) {
      await saveSymbolCandidates(projectId, region.id, drawingId, pageNumber, newCandidates);
    }
    await updateDrawingRegionStatus(projectId, region.id, "analyzed");

    return {
      region_id: region.id,
      candidates: newCandidates,
      detections_found: detections.length,
      duplicates_skipped: duplicatesSkipped,
      text_like_filtered: textLikeFiltered,
    };
  } catch (err) {
    await updateDrawingRegionStatus(projectId, region.id, "failed").catch(() => undefined);
    if (err instanceof AiScanUnavailableError) throw err;
    throw new AiScanUnavailableError("ai_call_failed");
  }
}
