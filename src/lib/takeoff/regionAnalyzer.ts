/**
 * DrawingRegionAnalyzer / SymbolCandidateDetector (Phase 1).
 *
 * Pure raster pipeline — no Gemini, no quote writes:
 *  1) color masks (green / red / orange)
 *  2) connected components / contours (via detectSymbolsByColor)
 *  3) size / aspect filters
 *  4) map crop-local boxes back to page coordinates
 *
 * PDF coordinate conversion is documented inline where boxes are remapped.
 */

import {
  classifyPixelColor,
  detectSymbolsByColorDetailed,
  type ColorBlobRejection,
  type RasterImage,
} from "@/lib/ai/visualSymbolCounter";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type {
  AnalyzeRegionCandidateDto,
  BBoxPdf,
  BBoxPx,
  DetectedPlanType,
  PlanQuality,
  SymbolColorLayer,
  SymbolCandidateKind,
  SymbolCandidateSource,
} from "@/types/pdfTakeoff";

export type RegionAnalyzeInput = {
  /** RGBA crop of the selected region at high DPI. */
  regionRaster: RasterImage;
  pageNumber: number;
  profession: string;
  /**
   * Region placement on the full page in pixels of the same render scale
   * as regionRaster was cropped from: [x, y, w, h].
   */
  regionBboxPx: BBoxPx;
  pageWidthPx: number;
  pageHeightPx: number;
  /** When set, bbox_pdf is emitted in PDF points; else normalized 0..1. */
  pageWidthPt?: number;
  pageHeightPt?: number;
  regionIdPrefix?: string;
};

/** Why an analysis produced zero candidates (debug only). */
export type AnalyzeEmptyReason =
  | "no_color_pixels"
  | "filtered_all"
  | "too_small"
  | "unknown";

/**
 * Why a detected blob was rejected (or dropped during merge) — debug only,
 * never affects candidates/quantities on its own.
 */
export type CandidateRejectReason =
  | "too_small"
  | "too_large"
  | "line_like"
  | "likely_text"
  | "overlaps_text"
  | "low_confidence"
  | "duplicate"
  | "overlaps_confirmed"
  | "no_template_match"
  | "dimension"
  | "low_density";

/** Dev-only detection debug info — never affects candidates or quantities. */
export type RegionAnalyzeDebug = {
  thresholds: {
    minDimPx: number;
    maxDimPx: number;
    mergeGapPx: number;
    maxAspectRatio: number;
  };
  regionRasterSize: { width: number; height: number };
  /** Sampled color-mask pixel counts inside the analyzed crop. */
  maskPixelCounts: {
    green: number;
    red: number;
    orange: number;
    blue: number;
    sampledPixels: number;
  };
  /** Every raw detection (accepted + rejected) with its classification. */
  detectionsBeforeFilter: Array<{
    id: string;
    colorLayer: SymbolColorLayer;
    source: SymbolCandidateSource;
    bboxLocalPx: BBoxPx;
    /** Page-pixel bbox — same convention as candidate bbox_px + region origin. */
    bboxPx: BBoxPx;
    bboxPdf: BBoxPdf;
    aspect: number;
    kind: SymbolCandidateKind;
    matchScore: number;
    filtersPassed: string[];
    /** Why the detection was dropped (null = kept as candidate). */
    rejectReason: CandidateRejectReason | null;
  }>;
  candidatesAfterFilter: number;
  /** Set only when candidatesAfterFilter === 0. */
  emptyReason: AnalyzeEmptyReason | null;
  /** Auto-expansion of a too-small selection (set by the analyze service). */
  region?: {
    originalRect: NormalizedRect;
    expandedRect: NormalizedRect;
    autoExpanded: boolean;
  };
  /** Template matches found before dedupe/merge (set by the analyze service). */
  templateMatchesBeforeDedupe?: AnalyzeRegionCandidateDto[];
  /** How many template matches were merged into an existing raster candidate. */
  mergedWithRasterCount?: number;
  /** How many raster candidates were dropped as OCR text overlaps (post-hoc, best-effort). */
  overlapsTextRejectedCount?: number;
};

/**
 * Sampled per-color pixel counts of the crop — debug only. Green/red/orange
 * reuse the detector's own classifier so counts match what detection "sees";
 * blue is estimated separately (dimensions) for the "why empty" explanation.
 */
export function countMaskPixels(image: RasterImage): RegionAnalyzeDebug["maskPixelCounts"] {
  const { width, height, data } = image;
  const total = width * height;
  const counts = { green: 0, red: 0, orange: 0, blue: 0, sampledPixels: 0 };
  if (total <= 0) return counts;
  const step = Math.max(1, Math.floor(total / 120_000));
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    const r = data[o] ?? 255;
    const g = data[o + 1] ?? 255;
    const b = data[o + 2] ?? 255;
    counts.sampledPixels++;
    const hint = classifyPixelColor(r, g, b);
    if (hint === "green") counts.green++;
    else if (hint === "red") counts.red++;
    else if (hint === "orange") counts.orange++;
    else {
      // Blue: saturated with a blue-ish hue (the detector ignores it).
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max >= 70 && max > min && (max - min) / max >= 0.3 && b === max) {
        counts.blue++;
      }
    }
  }
  return counts;
}

/** Explains a zero-candidate result for the debug panel (exported for tests). */
export function deriveEmptyReason(params: {
  candidateCount: number;
  detectionCount: number;
  maskPixelCounts: RegionAnalyzeDebug["maskPixelCounts"];
}): AnalyzeEmptyReason | null {
  if (params.candidateCount > 0) return null;
  const colored =
    params.maskPixelCounts.green +
    params.maskPixelCounts.red +
    params.maskPixelCounts.orange;
  if (colored < 10) return "no_color_pixels";
  if (params.detectionCount > 0) return "filtered_all";
  // Colored ink exists but no component passed the size threshold.
  if (colored >= 10) return "too_small";
  return "unknown";
}

export type RegionAnalyzeResult = {
  planQuality: PlanQuality;
  candidates: AnalyzeRegionCandidateDto[];
  summary: {
    green_candidates: number;
    red_candidates: number;
    orange_candidates: number;
    ignored_text_or_dimensions: number;
    needs_review: number;
  };
  debug: RegionAnalyzeDebug;
};

const COLOR_LABELS: Record<"green" | "red" | "orange", { label: string; type: string }> = {
  green: { label: "zásuvka", type: "socket" },
  red: { label: "vypínač", type: "switch" },
  orange: { label: "svetlo / LED", type: "light" },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Minimum analyze-region size as a fraction of the page (each axis). */
export const MIN_ANALYZE_REGION_SIZE = 0.05;

/**
 * Auto-expand a too-small analyze region around its center so a tight box
 * (or a plain click) around one symbol still analyzes a useful neighborhood.
 * The result is clamped inside the page; the center is preserved when the
 * expansion does not hit a page edge.
 */
export function ensureMinimumAnalyzeRegion(
  rect: NormalizedRect,
  minSize = MIN_ANALYZE_REGION_SIZE
): { rect: NormalizedRect; autoExpanded: boolean } {
  const width = Math.max(rect.width, 0);
  const height = Math.max(rect.height, 0);
  if (width >= minSize && height >= minSize) {
    return { rect, autoExpanded: false };
  }
  const cx = rect.x + width / 2;
  const cy = rect.y + height / 2;
  const w = Math.min(1, Math.max(width, minSize));
  const h = Math.min(1, Math.max(height, minSize));
  // Keep the box inside the page — shift instead of shrinking.
  const x = Math.min(Math.max(cx - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(cy - h / 2, 0), 1 - h);
  return { rect: { x, y, width: w, height: h }, autoExpanded: true };
}

export type AnalyzeNoticeKind = "expanded" | "empty" | "expanded_empty";

/**
 * Which inline notice the UI must show after an analysis. Never returns
 * "nothing" for an empty result — the user always gets visible feedback.
 */
export function deriveAnalyzeNotice(input: {
  candidateCount: number;
  autoExpanded: boolean;
}): AnalyzeNoticeKind | null {
  if (input.candidateCount === 0) {
    return input.autoExpanded ? "expanded_empty" : "empty";
  }
  return input.autoExpanded ? "expanded" : null;
}

/** Normalized rect → [x1,y1,x2,y2] in the same unit space. */
export function normalizedRectToBBoxPdf(
  rect: NormalizedRect,
  pageWidth: number,
  pageHeight: number
): BBoxPdf {
  return [
    rect.x * pageWidth,
    rect.y * pageHeight,
    (rect.x + rect.width) * pageWidth,
    (rect.y + rect.height) * pageHeight,
  ];
}

/** [x1,y1,x2,y2] → normalized 0..1 rect (handles any corner order). */
export function bboxPdfToNormalizedRect(
  bbox: BBoxPdf,
  pageWidth: number,
  pageHeight: number
): NormalizedRect {
  if (pageWidth <= 0 || pageHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const x1 = Math.min(bbox[0], bbox[2]) / pageWidth;
  const y1 = Math.min(bbox[1], bbox[3]) / pageHeight;
  const x2 = Math.max(bbox[0], bbox[2]) / pageWidth;
  const y2 = Math.max(bbox[1], bbox[3]) / pageHeight;
  return {
    x: clamp01(x1),
    y: clamp01(y1),
    width: clamp01(x2) - clamp01(x1),
    height: clamp01(y2) - clamp01(y1),
  };
}

/**
 * Heuristic plan quality from a region raster (Phase 1 — no PDF object walk yet).
 * Saturated ink ⇒ likely hybrid/vector-ish; mostly gray photo noise ⇒ raster.
 */
export function assessPlanQualityFromRaster(image: RasterImage): PlanQuality {
  const { width, height, data } = image;
  const total = width * height;
  if (total <= 0) {
    return {
      detectedPlanType: "unknown",
      hasTextLayer: false,
      hasVectorObjects: false,
      ocrRequired: true,
      quantityReliability: "low",
    };
  }

  let saturated = 0;
  let darkInk = 0;
  let nearWhite = 0;
  const step = Math.max(1, Math.floor(total / 40_000));
  let samples = 0;
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    const r = data[o] ?? 255;
    const g = data[o + 1] ?? 255;
    const b = data[o + 2] ?? 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max > 0 ? (max - min) / max : 0;
    if (sat >= 0.3 && max >= 70) saturated++;
    if (max < 70) darkInk++;
    if (min > 230) nearWhite++;
    samples++;
  }

  const satRatio = saturated / samples;
  const darkRatio = darkInk / samples;
  const whiteRatio = nearWhite / samples;

  let detectedPlanType: DetectedPlanType = "unknown";
  if (whiteRatio > 0.55 && (satRatio > 0.002 || darkRatio > 0.02)) {
    detectedPlanType = satRatio > 0.01 ? "hybrid" : "vector";
  } else if (whiteRatio < 0.35) {
    detectedPlanType = "raster";
  } else {
    detectedPlanType = "hybrid";
  }

  const hasVectorObjects = detectedPlanType === "vector" || detectedPlanType === "hybrid";
  // Phase 1: no text-layer probe — assume OCR may be needed for raster/hybrid.
  const hasTextLayer = detectedPlanType === "vector";
  const ocrRequired = !hasTextLayer;

  return {
    detectedPlanType,
    hasTextLayer,
    hasVectorObjects,
    ocrRequired,
    quantityReliability: "low",
  };
}

/** Minimum number of separate same-color ink groups to call a blob "text". */
const TEXT_CLUSTER_MIN_SUB_BLOBS = 3;
/** Long orange blobs are candidate LED strips instead of being discarded. */
const LED_STRIP_MIN_ASPECT = 3;
/**
 * A merged blob whose SHORT dimension exceeds minDim by more than this
 * factor is too thick to be a drawn LED-strip line — it's almost always a
 * wall-hatch band (several parallel hatch strokes merged into one bbox by
 * color/gap proximity), which happens to also be orange-hued and elongated.
 */
const LED_STRIP_MAX_THICKNESS_FACTOR = 2.5;
/**
 * Real symbols are filled/outlined shapes with dense ink; a wall corner or
 * hatch band merged into one bbox by color proximity is much sparser.
 */
const MIN_SYMBOL_DENSITY = 0.12;

/**
 * Count disjoint same-color ink groups inside a page-pixel bbox using a
 * ZERO-gap flood fill (unlike the main detector, nothing here gets merged).
 * A single symbol's strokes are almost always one connected group once
 * anti-aliasing is included; a run of letters/digits is several small,
 * clearly separated groups — that difference is the text heuristic.
 */
function countColorSubBlobs(
  raster: RasterImage,
  bboxLocalPx: { x: number; y: number; width: number; height: number },
  color: SymbolColorLayer
): number {
  const ox = Math.max(0, Math.floor(bboxLocalPx.x));
  const oy = Math.max(0, Math.floor(bboxLocalPx.y));
  const w = Math.max(1, Math.min(raster.width - ox, Math.ceil(bboxLocalPx.width)));
  const h = Math.max(1, Math.min(raster.height - oy, Math.ceil(bboxLocalPx.height)));
  if (w * h > 40_000) return 1; // huge crops: skip the heuristic, keep symbol_candidate

  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = ((oy + y) * raster.width + (ox + x)) * 4;
      const c = classifyPixelColor(
        raster.data[o] ?? 255,
        raster.data[o + 1] ?? 255,
        raster.data[o + 2] ?? 255
      );
      if (c === color) mask[y * w + x] = 1;
    }
  }

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  let groups = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || visited[start]) continue;
    let pixels = 0;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      pixels++;
      const sx = idx % w;
      const sy = (idx / w) | 0;
      if (sx > 0 && mask[idx - 1] && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        stack.push(idx - 1);
      }
      if (sx < w - 1 && mask[idx + 1] && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        stack.push(idx + 1);
      }
      if (sy > 0 && mask[idx - w] && !visited[idx - w]) {
        visited[idx - w] = 1;
        stack.push(idx - w);
      }
      if (sy < h - 1 && mask[idx + w] && !visited[idx + w]) {
        visited[idx + w] = 1;
        stack.push(idx + w);
      }
    }
    if (pixels >= 2) groups++;
  }
  return groups;
}

/** Many small same-color ink groups aligned in a row/column ⇒ likely text. */
function isLikelyTextCluster(
  raster: RasterImage,
  bboxLocalPx: { x: number; y: number; width: number; height: number },
  color: SymbolColorLayer
): boolean {
  if (color !== "green" && color !== "red" && color !== "orange") return false;
  return countColorSubBlobs(raster, bboxLocalPx, color) >= TEXT_CLUSTER_MIN_SUB_BLOBS;
}

/** bbox_px (page pixels) + bbox_pdf for a crop-local box — used by both candidates and debug rows. */
function toPageBoxes(params: {
  localX: number;
  localY: number;
  localW: number;
  localH: number;
  regionOriginPx: [number, number];
  pageWidthPx: number;
  pageHeightPx: number;
  pageWidthPt?: number;
  pageHeightPt?: number;
}): { pagePx: BBoxPx; normalized: NormalizedRect; bboxPdf: BBoxPdf } {
  const { localX, localY, localW, localH, regionOriginPx, pageWidthPx, pageHeightPx, pageWidthPt, pageHeightPt } =
    params;
  const [rx, ry] = regionOriginPx;
  const pagePx: BBoxPx = [rx + localX, ry + localY, rx + localX + localW, ry + localY + localH];
  const normalized: NormalizedRect = {
    x: clamp01(pagePx[0] / pageWidthPx),
    y: clamp01(pagePx[1] / pageHeightPx),
    width: clamp01(pagePx[2] / pageWidthPx) - clamp01(pagePx[0] / pageWidthPx),
    height: clamp01(pagePx[3] / pageHeightPx) - clamp01(pagePx[1] / pageHeightPx),
  };
  const usePdfPoints =
    typeof pageWidthPt === "number" && pageWidthPt > 0 && typeof pageHeightPt === "number" && pageHeightPt > 0;
  const bboxPdf: BBoxPdf = usePdfPoints
    ? normalizedRectToBBoxPdf(normalized, pageWidthPt!, pageHeightPt!)
    : [normalized.x, normalized.y, normalized.x + normalized.width, normalized.y + normalized.height];
  return { pagePx, normalized, bboxPdf };
}

/**
 * Detect multiple symbol candidates inside a rendered region crop.
 * Does not call Gemini and does not write quantities.
 */
export function analyzeRegionRaster(input: RegionAnalyzeInput): RegionAnalyzeResult {
  const {
    regionRaster,
    pageNumber,
    regionBboxPx,
    pageWidthPx,
    pageHeightPx,
    pageWidthPt,
    pageHeightPt,
    regionIdPrefix = "cand",
  } = input;

  const planQuality = assessPlanQualityFromRaster(regionRaster);

  // Size filters scale with crop resolution (~300–600 DPI intended).
  const minDim = Math.max(4, Math.round(Math.min(regionRaster.width, regionRaster.height) * 0.008));
  const maxDim = Math.max(
    minDim + 4,
    Math.round(Math.min(regionRaster.width, regionRaster.height) * 0.35)
  );
  const mergeGapPx = Math.max(4, Math.round(minDim * 0.8));
  const maxAspectRatio = 5.5;

  const { accepted, rejected } = detectSymbolsByColorDetailed(regionRaster, {
    page: pageNumber,
    minSymbolSizePx: minDim,
    maxSymbolSizePx: maxDim,
    mergeGapPx,
    maxAspectRatio,
    // Stricter than the shared default (0.03) — a wall corner/hatch band
    // merged by color proximity is sparse ink inside a big-ish bbox, while
    // a real symbol (filled dot, outlined circle+cross/slash) is dense.
    // Scoped to this pipeline only; Find Similar keeps the looser default.
    minDensity: MIN_SYMBOL_DENSITY,
  });

  const [rx, ry] = regionBboxPx;
  const regionOriginPx: [number, number] = [rx, ry];

  // PDF / page coordinate conversion:
  // detection.bbox is in crop-local pixels → add region origin → page pixels
  // → divide by page size → normalized → optionally scale to PDF points.
  const candidates: AnalyzeRegionCandidateDto[] = [];
  const debugDetections: RegionAnalyzeDebug["detectionsBeforeFilter"] = [];
  let ignored = 0;
  let seq = 0;

  for (const det of accepted) {
    // detectSymbolsByColor encodes color in id: visual_{color}_{page}_{seq}
    const colorLayer = guessColorFromId(det.id);
    const localX = det.bbox.x;
    const localY = det.bbox.y;
    const localW = det.bbox.width;
    const localH = det.bbox.height;
    const aspect = Math.max(localW, localH) / Math.max(1, Math.min(localW, localH));
    const { pagePx, normalized, bboxPdf } = toPageBoxes({
      localX,
      localY,
      localW,
      localH,
      regionOriginPx,
      pageWidthPx,
      pageHeightPx,
      pageWidthPt,
      pageHeightPt,
    });

    let kind: SymbolCandidateKind = "symbol_candidate";
    let rejectReason: CandidateRejectReason | null = null;
    let filtersPassed = ["size", "aspect", "density"];
    if (colorLayer === "blue" || colorLayer === "gray") {
      kind = "dimension";
      rejectReason = "dimension";
    } else if (isLikelyTextCluster(regionRaster, det.bbox, colorLayer)) {
      kind = "text";
      rejectReason = "likely_text";
    } else {
      filtersPassed = [...filtersPassed, "text_cluster"];
    }

    debugDetections.push({
      id: det.id,
      colorLayer,
      source: "opencv",
      bboxLocalPx: [
        Math.round(localX),
        Math.round(localY),
        Math.round(localX + localW),
        Math.round(localY + localH),
      ],
      bboxPx: [Math.round(pagePx[0]), Math.round(pagePx[1]), Math.round(pagePx[2]), Math.round(pagePx[3])],
      bboxPdf,
      aspect: Number(aspect.toFixed(2)),
      kind,
      matchScore: Number(det.matchScore.toFixed(3)),
      filtersPassed,
      rejectReason,
    });

    if (kind !== "symbol_candidate") {
      ignored++;
      continue;
    }

    const meta = COLOR_LABELS[colorLayer as "green" | "red" | "orange"] ?? {
      label: "symbol",
      type: "unknown",
    };
    const confidence = Math.min(0.92, Math.max(0.35, det.matchScore));

    candidates.push({
      id: `${regionIdPrefix}_${colorLayer}_${pageNumber}_${seq++}`,
      page_number: pageNumber,
      bbox_pdf: bboxPdf,
      bbox_px: [
        Math.round(localX),
        Math.round(localY),
        Math.round(localX + localW),
        Math.round(localY + localH),
      ],
      color_layer: colorLayer,
      kind,
      label_suggestions: [
        { label: meta.label, confidence: Number(confidence.toFixed(3)) },
        ...(det.possibleMeaning && det.possibleMeaning !== meta.label
          ? [{ label: det.possibleMeaning, confidence: Number((confidence * 0.7).toFixed(3)) }]
          : []),
      ],
      nearby_text: null, // OCR in Phase 3
      confidence: Number(confidence.toFixed(3)),
      source: "opencv",
      status: confidence >= 0.55 ? "probable" : "candidate",
      preview_image_url: null,
      normalized_position: normalized,
    });
  }

  // Long orange blobs are usually LED strips, not noise — recover them from
  // the detector's line_like rejection instead of discarding them (unless
  // they turn out to be an orange text run: still likely_text). Blobs
  // handled here (promoted OR explicitly re-rejected as too thick/text) are
  // tracked so the generic "remaining rejections" pass below never silently
  // drops a debug row for one of them.
  const ledHandled = new Set<ColorBlobRejection>();
  for (const blob of rejected) {
    if (blob.color !== "orange" || blob.reason !== "line_like") continue;
    if (blob.aspect < LED_STRIP_MIN_ASPECT) continue;
    // Too thick to be a drawn line stroke — almost always a wall-hatch band
    // merged into one bbox, not a genuine LED strip. Leave it as a plain
    // "line_like" debug row below instead of promoting a false candidate.
    const shortDim = Math.min(blob.bboxLocalPx.width, blob.bboxLocalPx.height);
    if (shortDim > minDim * LED_STRIP_MAX_THICKNESS_FACTOR) continue;
    ledHandled.add(blob);
    if (isLikelyTextCluster(regionRaster, blob.bboxLocalPx, "orange")) {
      debugDetections.push({
        id: `led_text_${pageNumber}_${seq++}`,
        colorLayer: "orange",
        source: "opencv",
        bboxLocalPx: [
          Math.round(blob.bboxLocalPx.x),
          Math.round(blob.bboxLocalPx.y),
          Math.round(blob.bboxLocalPx.x + blob.bboxLocalPx.width),
          Math.round(blob.bboxLocalPx.y + blob.bboxLocalPx.height),
        ],
        bboxPx: [0, 0, 0, 0],
        bboxPdf: [0, 0, 0, 0],
        aspect: Number(blob.aspect.toFixed(2)),
        kind: "text",
        matchScore: 0,
        filtersPassed: [],
        rejectReason: "likely_text",
      });
      continue;
    }

    const localX = blob.bboxLocalPx.x;
    const localY = blob.bboxLocalPx.y;
    const localW = blob.bboxLocalPx.width;
    const localH = blob.bboxLocalPx.height;
    const { pagePx, normalized, bboxPdf } = toPageBoxes({
      localX,
      localY,
      localW,
      localH,
      regionOriginPx,
      pageWidthPx,
      pageHeightPx,
      pageWidthPt,
      pageHeightPt,
    });
    const density = Math.min(0.6, blob.pixels / Math.max(1, localW * localH));
    const confidence = Number(Math.min(0.65, Math.max(0.35, 0.3 + density)).toFixed(3));

    debugDetections.push({
      id: `led_${pageNumber}_${seq}`,
      colorLayer: "orange",
      source: "opencv",
      bboxLocalPx: [
        Math.round(localX),
        Math.round(localY),
        Math.round(localX + localW),
        Math.round(localY + localH),
      ],
      bboxPx: [Math.round(pagePx[0]), Math.round(pagePx[1]), Math.round(pagePx[2]), Math.round(pagePx[3])],
      bboxPdf,
      aspect: Number(blob.aspect.toFixed(2)),
      kind: "symbol_candidate",
      matchScore: confidence,
      filtersPassed: ["size", "color_led_strip"],
      rejectReason: null,
    });

    candidates.push({
      id: `${regionIdPrefix}_orange_${pageNumber}_${seq++}`,
      page_number: pageNumber,
      bbox_pdf: bboxPdf,
      bbox_px: [
        Math.round(localX),
        Math.round(localY),
        Math.round(localX + localW),
        Math.round(localY + localH),
      ],
      color_layer: "orange",
      kind: "symbol_candidate",
      label_suggestions: [{ label: "LED pás", confidence }],
      nearby_text: null,
      confidence,
      source: "opencv",
      status: confidence >= 0.55 ? "probable" : "candidate",
      preview_image_url: null,
      normalized_position: normalized,
    });
  }

  // Remaining rejections (too_small/too_large/non-orange line_like/low_density)
  // are debug-only — they never become candidates.
  for (const blob of rejected) {
    if (ledHandled.has(blob)) continue; // already recorded above (promoted or marked likely_text)
    const { pagePx, bboxPdf } = toPageBoxes({
      localX: blob.bboxLocalPx.x,
      localY: blob.bboxLocalPx.y,
      localW: blob.bboxLocalPx.width,
      localH: blob.bboxLocalPx.height,
      regionOriginPx,
      pageWidthPx,
      pageHeightPx,
      pageWidthPt,
      pageHeightPt,
    });
    debugDetections.push({
      id: `rej_${blob.color}_${pageNumber}_${seq++}`,
      colorLayer: blob.color as SymbolColorLayer,
      source: "opencv",
      bboxLocalPx: [
        Math.round(blob.bboxLocalPx.x),
        Math.round(blob.bboxLocalPx.y),
        Math.round(blob.bboxLocalPx.x + blob.bboxLocalPx.width),
        Math.round(blob.bboxLocalPx.y + blob.bboxLocalPx.height),
      ],
      bboxPx: [Math.round(pagePx[0]), Math.round(pagePx[1]), Math.round(pagePx[2]), Math.round(pagePx[3])],
      bboxPdf,
      aspect: Number(blob.aspect.toFixed(2)),
      kind: "ignored",
      matchScore: 0,
      filtersPassed: [],
      rejectReason: blob.reason,
    });
  }

  const summary = {
    green_candidates: candidates.filter((c) => c.color_layer === "green").length,
    red_candidates: candidates.filter((c) => c.color_layer === "red").length,
    orange_candidates: candidates.filter((c) => c.color_layer === "orange").length,
    ignored_text_or_dimensions: ignored + rejected.length,
    needs_review: candidates.length,
  };

  const maskPixelCounts = countMaskPixels(regionRaster);
  const debug: RegionAnalyzeDebug = {
    thresholds: {
      minDimPx: minDim,
      maxDimPx: maxDim,
      mergeGapPx,
      maxAspectRatio,
    },
    regionRasterSize: { width: regionRaster.width, height: regionRaster.height },
    maskPixelCounts,
    detectionsBeforeFilter: debugDetections,
    candidatesAfterFilter: candidates.length,
    emptyReason: deriveEmptyReason({
      candidateCount: candidates.length,
      // Same semantics as before the detailed-detector refactor: only blobs
      // that passed the detector's OWN size/aspect/density filters count
      // towards "filtered_all" — the too-small/too-large debug rows below
      // must not change the no_color_pixels/too_small distinction.
      detectionCount: accepted.length,
      maskPixelCounts,
    }),
  };

  return { planQuality, candidates, summary, debug };
}

function guessColorFromId(id: string): SymbolColorLayer {
  if (id.includes("_green_")) return "green";
  if (id.includes("_red_")) return "red";
  if (id.includes("_orange_")) return "orange";
  return "unknown";
}
