/**
 * Visual symbol counter for electrical drawings (feature-flagged, additive).
 *
 * Gemini understands drawings but is not a reliable counter of small repeated
 * graphical symbols (switches especially — pure graphics, no OCR text). This
 * module adds a focused pixel-level detection layer:
 *
 *  - color/shape detection: colored symbol blobs (red = switches/control,
 *    orange = lights, green = sockets) found via connected components,
 *  - template matching: normalized cross-correlation against legend crops or
 *    user-confirmed symbol templates,
 *  - non-maximum suppression to deduplicate overlapping hits,
 *  - merge with OCR/text occurrences without double-counting.
 *
 * All detections are heuristic: they carry bbox + matchScore + confidence and
 * are NEVER used as fixed quote lines until a human confirms them.
 * No protected IEC/STN symbol images are embedded — internal samples are
 * color-hint rules only.
 */

import type { AiSymbolOccurrence } from "@/types/aiEstimator";
import type {
  VisualBBox,
  VisualColorHint,
  VisualConfidence,
  VisualNormalizedPoint,
  VisualSymbolDetection,
  VisualSymbolTemplate,
} from "@/types/visualSymbols";
import type { InternalTakeoffRow } from "./electricalQuoteTypes";
import {
  normalizeSourceEvidence,
  type EstimatorSourceEvidence,
} from "./estimatorExtractionQuality";

export type {
  VisualBBox,
  VisualColorHint,
  VisualConfidence,
  VisualNormalizedPoint,
  VisualSymbolDetection,
  VisualSymbolTemplate,
} from "@/types/visualSymbols";

/** RGBA raster (4 bytes per pixel), e.g. from canvas ImageData. */
export type RasterImage = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

// ---------------------------------------------------------------------------
// Seed templates (internal samples — color-hint rules, no symbol artwork)
// ---------------------------------------------------------------------------

/**
 * Manually seeded internal samples used until real legend-crop extraction is
 * complete. Project-legend / user-confirmed templates always take priority
 * (see pickTemplateForColor).
 */
export function getSeedVisualTemplates(): VisualSymbolTemplate[] {
  return [
    {
      id: "internal_red_switch",
      source: "internal_sample",
      trade: "electrical",
      normalizedPoint: "switch_point",
      label: "Vypínač / ovládací prvok (červená značka)",
      sourcePage: 1,
      colorHint: "red",
      confidence: "low",
    },
    {
      id: "internal_orange_light",
      source: "internal_sample",
      trade: "electrical",
      normalizedPoint: "light_output",
      label: "Svetelný vývod (oranžová značka)",
      sourcePage: 1,
      colorHint: "orange",
      confidence: "low",
    },
    {
      id: "internal_green_socket",
      source: "internal_sample",
      trade: "electrical",
      normalizedPoint: "socket_point",
      label: "Zásuvka / el. poznámka (zelená značka)",
      sourcePage: 1,
      colorHint: "green",
      confidence: "low",
    },
  ];
}

const TEMPLATE_SOURCE_PRIORITY: Record<VisualSymbolTemplate["source"], number> = {
  project_legend: 0,
  user_confirmed: 1,
  company_custom: 2,
  internal_sample: 3,
};

/** Project legend wins over user-confirmed, company custom, internal samples. */
export function pickTemplateForColor(
  templates: VisualSymbolTemplate[],
  colorHint: VisualColorHint
): VisualSymbolTemplate | undefined {
  return templates
    .filter((t) => t.colorHint === colorHint)
    .sort(
      (a, b) => TEMPLATE_SOURCE_PRIORITY[a.source] - TEMPLATE_SOURCE_PRIORITY[b.source]
    )[0];
}

// ---------------------------------------------------------------------------
// Color classification
// ---------------------------------------------------------------------------

/** Classify a colored (saturated, non-text) pixel; null for background/black text. */
export function classifyPixelColor(r: number, g: number, b: number): VisualColorHint | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 70) return null; // too dark — black text / lines
  const sat = (max - min) / max;
  if (sat < 0.3) return null; // gray — dimensions, hatching, text

  let hue: number;
  if (max === min) return null;
  if (max === r) hue = (60 * (g - b)) / (max - min);
  else if (max === g) hue = 120 + (60 * (b - r)) / (max - min);
  else hue = 240 + (60 * (r - g)) / (max - min);
  if (hue < 0) hue += 360;

  if (hue >= 340 || hue <= 14) return "red";
  if (hue > 14 && hue <= 50) return "orange";
  if (hue >= 80 && hue <= 175) return "green";
  return null;
}

// ---------------------------------------------------------------------------
// Color/shape detection (connected components on color masks)
// ---------------------------------------------------------------------------

export type ColorDetectionOptions = {
  page?: number;
  /** Min/max symbol dimension in pixels at the rendered resolution. */
  minSymbolSizePx?: number;
  maxSymbolSizePx?: number;
  /** Blobs closer than this (px) are merged into one symbol. */
  mergeGapPx?: number;
  /** Skip very elongated blobs (cable routes, LED lines, dimension lines). */
  maxAspectRatio?: number;
  /** Templates used to label detections; defaults to internal samples. */
  templates?: VisualSymbolTemplate[];
};

type Blob = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
  color: VisualColorHint;
};

function blobsOverlapOrNear(a: Blob, b: Blob, gap: number): boolean {
  return (
    a.color === b.color &&
    a.minX - gap <= b.maxX &&
    b.minX - gap <= a.maxX &&
    a.minY - gap <= b.maxY &&
    b.minY - gap <= a.maxY
  );
}

/** A merged same-color blob that failed a filter, with the reason (debug only). */
export type ColorBlobRejection = {
  bboxLocalPx: { x: number; y: number; width: number; height: number };
  color: VisualColorHint;
  pixels: number;
  aspect: number;
  reason: "too_small" | "too_large" | "line_like" | "low_density";
};

export type ColorDetectionDetailedResult = {
  accepted: VisualSymbolDetection[];
  rejected: ColorBlobRejection[];
};

/**
 * Detect small repeated colored symbols via connected components.
 * Returns accepted detections AND every rejected blob with its reason —
 * used by the region analyzer's debug panel. `detectSymbolsByColor` below
 * delegates here and returns only `.accepted`, so its public behavior is
 * unchanged for all existing callers.
 */
export function detectSymbolsByColorDetailed(
  image: RasterImage,
  options: ColorDetectionOptions = {}
): ColorDetectionDetailedResult {
  const {
    page = 1,
    minSymbolSizePx = 5,
    maxSymbolSizePx = 90,
    mergeGapPx = 8,
    maxAspectRatio = 6,
    templates = getSeedVisualTemplates(),
  } = options;
  const { width, height, data } = image;

  // 1) Per-pixel color mask: 0 none, 1 red, 2 orange, 3 green.
  const COLOR_IDS: VisualColorHint[] = ["unknown", "red", "orange", "green"];
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const c = classifyPixelColor(data[o], data[o + 1], data[o + 2]);
    if (c === "red") mask[i] = 1;
    else if (c === "orange") mask[i] = 2;
    else if (c === "green") mask[i] = 3;
  }

  // 2) Connected components (4-neighborhood, iterative flood fill).
  const visited = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (mask[start] === 0 || visited[start]) continue;
    const colorId = mask[start];
    let minX = width, minY = height, maxX = 0, maxY = 0, pixels = 0;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx / width) | 0;
      pixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[idx - 1] === colorId && !visited[idx - 1]) {
        visited[idx - 1] = 1;
        stack.push(idx - 1);
      }
      if (x < width - 1 && mask[idx + 1] === colorId && !visited[idx + 1]) {
        visited[idx + 1] = 1;
        stack.push(idx + 1);
      }
      if (y > 0 && mask[idx - width] === colorId && !visited[idx - width]) {
        visited[idx - width] = 1;
        stack.push(idx - width);
      }
      if (y < height - 1 && mask[idx + width] === colorId && !visited[idx + width]) {
        visited[idx + width] = 1;
        stack.push(idx + width);
      }
    }
    if (pixels >= 3) {
      blobs.push({ minX, minY, maxX, maxY, pixels, color: COLOR_IDS[colorId] });
    }
  }

  // 3) Merge nearby same-color blobs (multi-part symbols: circle + strokes).
  let merged = blobs;
  let changed = true;
  while (changed) {
    changed = false;
    const next: Blob[] = [];
    const used = new Array(merged.length).fill(false);
    for (let i = 0; i < merged.length; i++) {
      if (used[i]) continue;
      let acc = merged[i];
      for (let j = i + 1; j < merged.length; j++) {
        if (used[j]) continue;
        if (blobsOverlapOrNear(acc, merged[j], mergeGapPx)) {
          const b = merged[j];
          acc = {
            minX: Math.min(acc.minX, b.minX),
            minY: Math.min(acc.minY, b.minY),
            maxX: Math.max(acc.maxX, b.maxX),
            maxY: Math.max(acc.maxY, b.maxY),
            pixels: acc.pixels + b.pixels,
            color: acc.color,
          };
          used[j] = true;
          changed = true;
        }
      }
      used[i] = true;
      next.push(acc);
    }
    merged = next;
  }

  // 4) Size/shape filter + detection rows.
  const detections: VisualSymbolDetection[] = [];
  const rejected: ColorBlobRejection[] = [];
  let seq = 0;
  for (const b of merged) {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    const dim = Math.max(w, h);
    const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
    const bboxLocalPx = { x: b.minX, y: b.minY, width: w, height: h };

    if (dim < minSymbolSizePx) {
      rejected.push({ bboxLocalPx, color: b.color, pixels: b.pixels, aspect, reason: "too_small" });
      continue;
    }
    if (dim > maxSymbolSizePx) {
      rejected.push({ bboxLocalPx, color: b.color, pixels: b.pixels, aspect, reason: "too_large" });
      continue;
    }
    if (aspect > maxAspectRatio) {
      // cable / LED line / dimension line
      rejected.push({ bboxLocalPx, color: b.color, pixels: b.pixels, aspect, reason: "line_like" });
      continue;
    }

    const density = b.pixels / (w * h);
    if (density < 0.03) {
      // scattered noise
      rejected.push({ bboxLocalPx, color: b.color, pixels: b.pixels, aspect, reason: "low_density" });
      continue;
    }

    const template = pickTemplateForColor(templates, b.color);
    const matchScore = Math.min(1, 0.35 + Math.min(density * 1.6, 0.45) + (template ? 0.1 : 0));
    // Color-only detection is never high confidence — a human must confirm.
    const confidence: VisualConfidence = matchScore >= 0.6 ? "medium" : "low";
    detections.push({
      id: `visual_${b.color}_${page}_${seq++}`,
      templateId: template?.id,
      normalizedPoint: template?.normalizedPoint ?? "unknown",
      page,
      bbox: { x: b.minX, y: b.minY, width: w, height: h },
      matchScore: Number(matchScore.toFixed(3)),
      source: "color_shape_detection",
      confidence,
      needsReview: true,
      reviewReason:
        template?.normalizedPoint
          ? `Rozpoznané iba vizuálne (farba: ${b.color}) — vyžaduje potvrdenie.`
          : `Neznáma farebná značka (${b.color}) — vyžaduje kontrolu.`,
      cropId: `crop_${page}_${b.minX}_${b.minY}`,
      possibleMeaning: template?.label,
    });
  }
  return { accepted: detections, rejected };
}

/**
 * Detect small repeated colored symbols via connected components.
 * Returns raw detections (before NMS/merging with OCR occurrences).
 */
export function detectSymbolsByColor(
  image: RasterImage,
  options: ColorDetectionOptions = {}
): VisualSymbolDetection[] {
  return detectSymbolsByColorDetailed(image, options).accepted;
}

// ---------------------------------------------------------------------------
// Template matching (normalized cross-correlation, grayscale)
// ---------------------------------------------------------------------------

export type TemplateMatchOptions = {
  page?: number;
  /** NCC score threshold (0..1). */
  threshold?: number;
  /** Sliding-window stride in pixels. */
  stride?: number;
};

function toGray(image: RasterImage): Float32Array {
  const { width, height, data } = image;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  return gray;
}

/**
 * Match a template raster (e.g. legend crop) across the page image using
 * normalized cross-correlation. Suitable for small templates; heavier pages
 * should be pre-tiled by the caller.
 */
export function matchVisualTemplate(
  image: RasterImage,
  template: RasterImage,
  templateMeta: VisualSymbolTemplate,
  options: TemplateMatchOptions = {}
): VisualSymbolDetection[] {
  const { page = 1, threshold = 0.75, stride = 2 } = options;
  if (template.width > image.width || template.height > image.height) return [];

  const img = toGray(image);
  const tpl = toGray(template);
  const tw = template.width;
  const th = template.height;
  const n = tw * th;

  let tplMean = 0;
  for (let i = 0; i < n; i++) tplMean += tpl[i];
  tplMean /= n;
  let tplVar = 0;
  for (let i = 0; i < n; i++) tplVar += (tpl[i] - tplMean) ** 2;
  const tplStd = Math.sqrt(tplVar);
  if (tplStd === 0) return []; // flat template can match anything

  const hits: VisualSymbolDetection[] = [];
  let seq = 0;
  for (let y = 0; y + th <= image.height; y += stride) {
    for (let x = 0; x + tw <= image.width; x += stride) {
      let winSum = 0;
      for (let ty = 0; ty < th; ty++) {
        const rowOff = (y + ty) * image.width + x;
        for (let tx = 0; tx < tw; tx++) winSum += img[rowOff + tx];
      }
      const winMean = winSum / n;
      let cov = 0;
      let winVar = 0;
      for (let ty = 0; ty < th; ty++) {
        const rowOff = (y + ty) * image.width + x;
        const tplOff = ty * tw;
        for (let tx = 0; tx < tw; tx++) {
          const dw = img[rowOff + tx] - winMean;
          cov += dw * (tpl[tplOff + tx] - tplMean);
          winVar += dw * dw;
        }
      }
      const winStd = Math.sqrt(winVar);
      if (winStd === 0) continue;
      const score = cov / (winStd * tplStd);
      if (score >= threshold) {
        const confidence: VisualConfidence =
          score >= 0.92 ? "high" : score >= 0.82 ? "medium" : "low";
        hits.push({
          id: `visual_tpl_${templateMeta.id}_${page}_${seq++}`,
          templateId: templateMeta.id,
          normalizedPoint: templateMeta.normalizedPoint,
          page,
          bbox: { x, y, width: tw, height: th },
          matchScore: Number(score.toFixed(3)),
          source: "visual_template_match",
          confidence,
          needsReview: confidence !== "high",
          reviewReason:
            confidence !== "high"
              ? "Zhoda so šablónou nie je istá — skontrolujte výrez."
              : undefined,
          cropId: `crop_${page}_${x}_${y}`,
          possibleMeaning: templateMeta.label,
        });
      }
    }
  }
  return nonMaxSuppression(hits, 0.3);
}

// ---------------------------------------------------------------------------
// Non-maximum suppression / dedup
// ---------------------------------------------------------------------------

export function bboxIoU(a: VisualBBox, b: VisualBBox): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  return inter / (a.width * a.height + b.width * b.height - inter);
}

/** Keep the highest-score detection among overlapping ones (same page). */
export function nonMaxSuppression(
  detections: VisualSymbolDetection[],
  iouThreshold = 0.3
): VisualSymbolDetection[] {
  const sorted = [...detections].sort((a, b) => b.matchScore - a.matchScore);
  const kept: VisualSymbolDetection[] = [];
  for (const d of sorted) {
    const overlaps = kept.some(
      (k) => k.page === d.page && bboxIoU(k.bbox, d.bbox) >= iouThreshold
    );
    if (!overlaps) kept.push(d);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Room assignment
// ---------------------------------------------------------------------------

export type RoomBounds = { roomName: string; page: number; bbox: VisualBBox };

/** Assign detections to rooms by bbox-center containment, when bounds exist. */
export function assignDetectionsToRooms(
  detections: VisualSymbolDetection[],
  roomBounds: RoomBounds[]
): VisualSymbolDetection[] {
  if (roomBounds.length === 0) return detections;
  return detections.map((d) => {
    const cx = d.bbox.x + d.bbox.width / 2;
    const cy = d.bbox.y + d.bbox.height / 2;
    const room = roomBounds.find(
      (r) =>
        r.page === d.page &&
        cx >= r.bbox.x &&
        cx <= r.bbox.x + r.bbox.width &&
        cy >= r.bbox.y &&
        cy <= r.bbox.y + r.bbox.height
    );
    return room ? { ...d, roomName: room.roomName } : d;
  });
}

// ---------------------------------------------------------------------------
// Merge with OCR/text occurrences (no double-counting)
// ---------------------------------------------------------------------------

export type VisualMergeResult = {
  detections: VisualSymbolDetection[];
  droppedAsDuplicateOfText: number;
  conflictsMarkedForReview: number;
};

/**
 * OCR/text occurrences win over visual detections. A visual detection that
 * overlaps a text occurrence bbox is dropped (already counted); if the types
 * disagree, the detection is kept but marked needsReview as a conflict.
 */
export function mergeVisualDetectionsWithOccurrences(
  detections: VisualSymbolDetection[],
  occurrences: Pick<AiSymbolOccurrence, "id" | "page" | "bbox" | "normalizedType">[],
  iouThreshold = 0.3
): VisualMergeResult {
  const deduped = nonMaxSuppression(detections, iouThreshold);
  const result: VisualSymbolDetection[] = [];
  let dropped = 0;
  let conflicts = 0;

  const OCC_TYPE_TO_POINT: Record<string, VisualNormalizedPoint> = {
    socket: "socket_point",
    double_socket: "double_socket_point",
    switch: "switch_point",
    light: "light_output",
    light_output: "light_output",
    led_strip: "led_strip_point",
  };

  for (const d of deduped) {
    const overlapping = occurrences.find(
      (o) =>
        o.bbox &&
        o.bbox.page === d.page &&
        bboxIoU(
          { x: o.bbox.x, y: o.bbox.y, width: o.bbox.width, height: o.bbox.height },
          d.bbox
        ) >= iouThreshold
    );
    if (!overlapping) {
      result.push(d);
      continue;
    }
    const occPoint = OCC_TYPE_TO_POINT[overlapping.normalizedType ?? ""] ?? "unknown";
    if (occPoint === d.normalizedPoint || d.normalizedPoint === "unknown") {
      dropped++; // same symbol already counted from text — do not double-count
    } else {
      conflicts++;
      result.push({
        ...d,
        needsReview: true,
        confidence: "low",
        reviewReason: `Vizuálna detekcia (${d.normalizedPoint}) je v rozpore s textom vo výkrese (${overlapping.normalizedType}).`,
      });
    }
  }
  return {
    detections: result,
    droppedAsDuplicateOfText: dropped,
    conflictsMarkedForReview: conflicts,
  };
}

// ---------------------------------------------------------------------------
// Takeoff + evidence (visual-only rows never become fixed quote lines)
// ---------------------------------------------------------------------------

/**
 * Turn visual detections into internal-takeoff review rows.
 * Unconfirmed detections get NO quantity — they can never be priced as fixed
 * lines. Confirmed ids (human action) get counted quantities.
 */
export function visualDetectionsToTakeoffRows(
  detections: VisualSymbolDetection[],
  options: { confirmedIds?: Set<string> } = {}
): InternalTakeoffRow[] {
  const confirmed = options.confirmedIds ?? new Set<string>();
  const CATEGORY: Record<VisualNormalizedPoint, InternalTakeoffRow["category"]> = {
    switch_point: "switch",
    socket_point: "socket",
    double_socket_point: "socket",
    light_output: "lighting",
    led_strip_point: "led_strip",
    unknown: "other",
  };
  const TITLE: Record<VisualNormalizedPoint, string> = {
    switch_point: "Vypínač (vizuálna detekcia)",
    socket_point: "Zásuvka (vizuálna detekcia)",
    double_socket_point: "Dvojzásuvka (vizuálna detekcia)",
    light_output: "Svetelný vývod (vizuálna detekcia)",
    led_strip_point: "LED prvok (vizuálna detekcia)",
    unknown: "Neznáma značka (vizuálna detekcia)",
  };

  type Bucket = { point: VisualNormalizedPoint; roomName?: string; page: number; all: number; confirmedCount: number };
  const buckets = new Map<string, Bucket>();
  for (const d of detections) {
    const key = `${d.normalizedPoint}|${d.roomName ?? ""}|${d.page}`;
    const bucket = buckets.get(key) ?? {
      point: d.normalizedPoint,
      roomName: d.roomName,
      page: d.page,
      all: 0,
      confirmedCount: 0,
    };
    bucket.all++;
    if (confirmed.has(d.id) && d.confidence === "high") bucket.confirmedCount++;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((b, i) => {
    const isConfirmed = b.confirmedCount > 0 && b.confirmedCount === b.all;
    return {
      id: `visual_takeoff_${i}`,
      roomName: b.roomName,
      title: TITLE[b.point],
      category: CATEGORY[b.point],
      // Unconfirmed visual rows carry no quantity → cannot form fixed lines.
      quantity: isConfirmed ? b.confirmedCount : undefined,
      unit: "ks",
      sourcePage: b.page,
      source: "visual_detection",
      confidence: isConfirmed ? "high" : "low",
      needsReview: !isConfirmed,
      reviewReason: isConfirmed
        ? undefined
        : `Vizuálne nájdených ${b.all} ks — počet treba potvrdiť vo výrezoch.`,
      included: true,
    };
  });
}

/** Evidence row for a visual detection (page + bbox + confidence, no undefined). */
export function visualDetectionEvidence(
  detection: VisualSymbolDetection,
  fileName: string
): EstimatorSourceEvidence {
  return normalizeSourceEvidence(
    {
      fileName,
      page: detection.page,
      sourceText: detection.possibleMeaning ?? null,
      sourceType: "ai_inferred",
      confidence: detection.confidence,
      needsReview: detection.needsReview,
      bbox: {
        page: detection.page,
        x: detection.bbox.x,
        y: detection.bbox.y,
        width: detection.bbox.width,
        height: detection.bbox.height,
      },
    },
    fileName
  );
}
