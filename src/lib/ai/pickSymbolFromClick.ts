/**
 * Smart symbol picker — click a symbol on a rendered PDF page and detect
 * the tight bbox around multi-part colored strokes near the pointer.
 */

import { classifyPixelColor } from "@/lib/ai/visualSymbolCounter";
import type { VisualColorHint } from "@/types/visualSymbols";
import type { EstimatorPositionBBox } from "@/types/estimatorPositions";
import { outlinePolygonFromInkPoints } from "@/lib/ai/symbolShapeOutline";

export type PickSymbolCategoryHint =
  | "socket"
  | "switch"
  | "light"
  | "led"
  | "cable"
  | "unknown";

export type PickSymbolFromClickInput = {
  imageData: ImageData;
  /** Click position in canvas device pixels (matches imageData dimensions). */
  clickCanvasPx: { x: number; y: number };
  pageWidth: number;
  pageHeight: number;
  categoryHint?: PickSymbolCategoryHint;
  normalizedPoint?: string;
  options?: {
    minSearchRadiusPx?: number;
    maxSearchRadiusPx?: number;
    mergeGapPx?: number;
    maxAspectRatio?: number;
    minComponentPixels?: number;
    maxSymbolSizePx?: number;
    /** Max distance (device px) from click to the blob edge — keeps the pick under the pointer. */
    maxSeedDistancePx?: number;
    /**
     * Merge a horizontal pair of same-color blobs into one mark (double socket).
     * Skipped when a third neighbour sits next to the pair (dense row).
     */
    mergeHorizontalSocketPair?: boolean;
  };
};

/** Category-aware pick defaults — sockets glue double units; lights avoid green sockets. */
export function pickOptionsForContext(
  categoryHint?: PickSymbolCategoryHint,
  normalizedPoint?: string
): NonNullable<PickSymbolFromClickInput["options"]> {
  const point = (normalizedPoint ?? "").toLowerCase();
  const isDouble =
    point.includes("double_socket") || point.includes("dvojzasuv");
  const isSocket =
    categoryHint === "socket" ||
    point.includes("socket") ||
    point.includes("zasuv");

  if (isDouble) {
    return {
      maxSearchRadiusPx: 52,
      maxSeedDistancePx: 18,
      maxSymbolSizePx: 96,
      mergeGapPx: 16,
      mergeHorizontalSocketPair: true,
    };
  }
  if (isSocket) {
    return {
      maxSearchRadiusPx: 44,
      maxSeedDistancePx: 16,
      maxSymbolSizePx: 84,
      mergeGapPx: 8,
      mergeHorizontalSocketPair: true,
    };
  }
  // Lights / LED / unknown: never swallow a neighbouring identical mark.
  return {
    maxSearchRadiusPx: 32,
    maxSeedDistancePx: 12,
    maxSymbolSizePx: 36,
    mergeGapPx: 1,
    mergeHorizontalSocketPair: false,
  };
}

export type PickSymbolComponent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
  color: VisualColorHint | "dark";
  /** Exact ink pixel coords (page space) — source of the outline polygon. */
  points?: Array<{ x: number; y: number }>;
};

export type RejectedSymbolComponent = {
  bbox: EstimatorPositionBBox;
  reason: string;
  colorGroup: VisualColorHint | "dark" | "unknown";
};

export type PickSymbolFromClickResult = {
  found: boolean;
  /** Debug-only search window — never use as evidence/display bbox. */
  rawSearchBbox: EstimatorPositionBBox;
  /** Union of accepted symbol-mask pixels (before pad). */
  symbolMaskBbox: EstimatorPositionBBox | null;
  /** Display/evidence bbox wrapping only symbol ink. */
  tightSymbolBbox: EstimatorPositionBBox | null;
  center: { x: number; y: number };
  colorHint: VisualColorHint | "dark" | "unknown";
  components: PickSymbolComponent[];
  rejectedComponents: RejectedSymbolComponent[];
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  reason?: string;
  /** When a stacked/side-by-side socket pair was detected. */
  suggestedNormalizedPoint?: "double_socket_point";
  /** Normalized outline of symbol ink (displayed page space). */
  outlinePolygon?: Array<{ x: number; y: number }>;
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number(v.toFixed(5))));
}

function isBackgroundPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 245 && min > 230) return true;
  const sat = max > 0 ? (max - min) / max : 0;
  if (max > 200 && sat < 0.12) return true;
  return false;
}

function isDarkSymbolPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max < 90 && max > 25 && max - min < 40;
}

export function categoryToColorPreference(
  categoryHint?: PickSymbolCategoryHint,
  normalizedPoint?: string
): VisualColorHint[] {
  const point = (normalizedPoint ?? "").toLowerCase();
  if (
    categoryHint === "socket" ||
    point.includes("socket") ||
    point.includes("zasuv")
  ) {
    return ["green"];
  }
  if (
    categoryHint === "switch" ||
    point.includes("switch") ||
    point.includes("vypinac") ||
    point.includes("vypínač")
  ) {
    return ["red"];
  }
  if (
    categoryHint === "light" ||
    categoryHint === "led" ||
    point.includes("light") ||
    point.includes("svet") ||
    point.includes("led")
  ) {
    // Lights are orange/magenta on plans — never snap to green sockets.
    return ["orange"];
  }
  if (categoryHint === "cable") return ["red", "green", "orange"];
  return ["green", "red", "orange"];
}

export function estimatorCategoryToPickHint(category: string): PickSymbolCategoryHint {
  switch (category) {
    case "socket":
    case "double_socket":
      return "socket";
    case "switch":
      return "switch";
    case "lighting":
    case "light":
      return "light";
    case "led_strip":
    case "led":
      return "led";
    case "cable":
      return "cable";
    default:
      return "unknown";
  }
}

function maskValueForPixel(
  r: number,
  g: number,
  b: number,
  preferred: VisualColorHint[],
  allowDark: boolean
): number {
  if (isBackgroundPixel(r, g, b)) return 0;
  const color = classifyPixelColor(r, g, b);
  if (color && preferred.includes(color)) {
    if (color === "red") return 1;
    if (color === "orange") return 2;
    if (color === "green") return 3;
  }
  if (allowDark && !color && isDarkSymbolPixel(r, g, b)) return 4;
  if (!color && preferred.length >= 3) {
    const c2 = classifyPixelColor(r, g, b);
    if (c2 === "red") return 1;
    if (c2 === "orange") return 2;
    if (c2 === "green") return 3;
  }
  return 0;
}

const MASK_TO_COLOR: Record<number, VisualColorHint | "dark"> = {
  1: "red",
  2: "orange",
  3: "green",
  4: "dark",
};

type Blob = PickSymbolComponent;

function blobsOverlapOrNear(a: Blob, b: Blob, gap: number): boolean {
  return (
    a.minX - gap <= b.maxX &&
    b.minX - gap <= a.maxX &&
    a.minY - gap <= b.maxY &&
    b.minY - gap <= a.maxY
  );
}

/**
 * Real bbox intersection (≥30 % of the smaller part) — parts of ONE symbol
 * overlap (cross inside circle); neighbouring separate marks only sit near.
 */
function blobsStrictlyOverlap(a: Blob, b: Blob): boolean {
  const iw = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + 1;
  const ih = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + 1;
  if (iw <= 1 || ih <= 1) return false;
  const inter = iw * ih;
  const aArea = (a.maxX - a.minX + 1) * (a.maxY - a.minY + 1);
  const bArea = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
  return inter >= Math.min(aArea, bArea) * 0.3;
}

function floodComponent(
  mask: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  start: number,
  colorId: number
): Blob | null {
  const stack = [start];
  visited[start] = 1;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let pixels = 0;
  const points: Array<{ x: number; y: number }> = [];
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx / width) | 0;
    pixels++;
    points.push({ x, y });
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const neighbors = [
      x > 0 ? idx - 1 : -1,
      x < width - 1 ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y < height - 1 ? idx + width : -1,
    ];
    for (const n of neighbors) {
      if (n < 0 || visited[n] || mask[n] !== colorId) continue;
      visited[n] = 1;
      stack.push(n);
    }
  }
  if (pixels < 2) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    pixels,
    color: MASK_TO_COLOR[colorId] ?? "dark",
    points,
  };
}

function distToBlob(cx: number, cy: number, b: Blob): number {
  const bx = (b.minX + b.maxX) / 2;
  const by = (b.minY + b.maxY) / 2;
  return Math.hypot(cx - bx, cy - by);
}

/** Distance from a point to the blob's bounding box edge (0 when inside). */
function distToBlobEdge(cx: number, cy: number, b: Blob): number {
  const dx = Math.max(b.minX - cx, 0, cx - b.maxX);
  const dy = Math.max(b.minY - cy, 0, cy - b.maxY);
  return Math.hypot(dx, dy);
}

function blobToBbox(b: Blob, pageWidth: number, pageHeight: number, pad = 2): EstimatorPositionBBox {
  return {
    x: clamp01((b.minX - pad) / pageWidth),
    y: clamp01((b.minY - pad) / pageHeight),
    width: clamp01((b.maxX - b.minX + 1 + pad * 2) / pageWidth),
    height: clamp01((b.maxY - b.minY + 1 + pad * 2) / pageHeight),
  };
}

function isLongLineBlob(b: Blob, maxAspectRatio: number): boolean {
  const w = b.maxX - b.minX + 1;
  const h = b.maxY - b.minY + 1;
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
  // Thin long strokes (dimension lines) — reject even mid-length segments in a search window.
  return aspect > maxAspectRatio && Math.max(w, h) >= 24;
}

type ComponentVerdict = {
  blob: Blob;
  rejectReason: string | null;
  colorGroup: VisualColorHint | "dark" | "unknown";
  bboxW: number;
  bboxH: number;
  aspectRatio: number;
  distanceFromClick: number;
  pixelDensity: number;
  lineLikeness: number;
  textLikeness: number;
  isWallLike: boolean;
  isDimensionLike: boolean;
  isTextLike: boolean;
  isLineLike: boolean;
};

/**
 * Score one connected component inside the search window.
 * Rejects walls, dimensions, text labels, long lines, and oversized blobs.
 */
function analyzeComponent(
  blob: Blob,
  cx: number,
  cy: number,
  maxAspectRatio: number,
  maxSymbolSizePx: number,
  preferred: VisualColorHint[],
  allowDark: boolean
): ComponentVerdict {
  const bboxW = blob.maxX - blob.minX + 1;
  const bboxH = blob.maxY - blob.minY + 1;
  const area = Math.max(1, bboxW * bboxH);
  const pixelDensity = blob.pixels / area;
  const aspectRatio = Math.max(bboxW, bboxH) / Math.max(1, Math.min(bboxW, bboxH));
  const distanceFromClick = distToBlobEdge(cx, cy, blob);
  const horizAspect = bboxW / Math.max(1, bboxH);
  const vertAspect = bboxH / Math.max(1, bboxW);

  // Green/orange plan labels are wide short runs of ink — not compact symbols.
  const textLikeness =
    blob.color !== "dark" && horizAspect >= 2.2 && bboxH <= 18
      ? Math.min(1, 0.55 + (horizAspect - 2.2) * 0.15 + (pixelDensity < 0.5 ? 0.2 : 0))
      : blob.color !== "dark" && horizAspect >= 3.2 && bboxW >= 28 && bboxH <= 22
        ? 0.85
        : blob.color !== "dark" && vertAspect >= 3.5 && bboxW <= 12 && bboxH >= 28
          ? 0.7
          : 0;
  const isTextLike = textLikeness >= 0.45;

  const isLineLike =
    !isTextLike &&
    (isLongLineBlob(blob, maxAspectRatio) ||
      (aspectRatio > 5 && Math.max(bboxW, bboxH) >= 18));
  const lineLikeness = isLineLike
    ? Math.min(1, aspectRatio / 10)
    : aspectRatio > 3.5
      ? 0.45
      : 0;

  const isWallLike =
    blob.color === "dark" &&
    (aspectRatio > 3.2 ||
      (Math.max(bboxW, bboxH) > 32 && pixelDensity < 0.25) ||
      (bboxW > maxSymbolSizePx * 0.9 && pixelDensity < 0.35));

  // Blue dimensions are not masked; dark thin strokes act as dimension stand-ins.
  const isDimensionLike =
    (isLineLike && blob.color === "dark") ||
    (blob.color === "dark" && aspectRatio > 4.5 && Math.max(bboxW, bboxH) >= 20);

  let rejectReason: string | null = null;
  // Colored labels first; dark elongated strokes as lines/walls.
  if (isTextLike) rejectReason = "text_like";
  else if (isLineLike) rejectReason = "long_line";
  else if (isWallLike) rejectReason = "wall_like";
  else if (isDimensionLike) rejectReason = "dimension_like";
  else if (bboxW > maxSymbolSizePx || bboxH > maxSymbolSizePx) rejectReason = "too_large";
  else if (blob.color === "dark" && !allowDark) rejectReason = "wrong_color";
  else if (
    blob.color !== "dark" &&
    preferred.length > 0 &&
    preferred.length < 3 &&
    !preferred.includes(blob.color as VisualColorHint)
  ) {
    rejectReason = "wrong_color";
  } else if (pixelDensity < 0.07 && area > 100) {
    rejectReason = "sparse_noise";
  }

  return {
    blob,
    rejectReason,
    colorGroup: blob.color,
    bboxW,
    bboxH,
    aspectRatio,
    distanceFromClick,
    pixelDensity,
    lineLikeness,
    textLikeness,
    isWallLike,
    isDimensionLike,
    isTextLike,
    isLineLike,
  };
}

function similarStrokeSize(a: Blob, b: Blob): boolean {
  const aMin = Math.min(a.maxX - a.minX + 1, a.maxY - a.minY + 1);
  const bMin = Math.min(b.maxX - b.minX + 1, b.maxY - b.minY + 1);
  const sideRatio = Math.max(aMin, bMin) / Math.max(1, Math.min(aMin, bMin));
  const pixRatio =
    Math.max(a.pixels, b.pixels) / Math.max(1, Math.min(a.pixels, b.pixels));
  return sideRatio <= 2.4 && pixRatio <= 3.2;
}

/** Two similar blobs side-by-side → typical double-socket graphic. */
function isHorizontalSocketPair(a: Blob, b: Blob, maxGapPx = 20): boolean {
  if (a.color !== b.color && a.color !== "dark" && b.color !== "dark") return false;
  if (!similarStrokeSize(a, b)) return false;
  const aw = a.maxX - a.minX + 1;
  const ah = a.maxY - a.minY + 1;
  const bw = b.maxX - b.minX + 1;
  const bh = b.maxY - b.minY + 1;
  if (Math.abs(aw - bw) > Math.max(aw, bw) * 0.55) return false;
  if (Math.abs(ah - bh) > Math.max(ah, bh) * 0.55) return false;
  const acy = (a.minY + a.maxY) / 2;
  const bcy = (b.minY + b.maxY) / 2;
  if (Math.abs(acy - bcy) > Math.max(ah, bh) * 0.65) return false;
  const gap = a.maxX < b.minX ? b.minX - a.maxX : b.maxX < a.minX ? a.minX - b.maxX : -1;
  if (gap < 1 || gap > maxGapPx) return false;
  return true;
}

/** Two similar blobs stacked → “zásuvka pod sebou”. */
function isVerticalSocketPair(a: Blob, b: Blob, maxGapPx = 20): boolean {
  if (a.color !== b.color && a.color !== "dark" && b.color !== "dark") return false;
  if (!similarStrokeSize(a, b)) return false;
  const aw = a.maxX - a.minX + 1;
  const ah = a.maxY - a.minY + 1;
  const bw = b.maxX - b.minX + 1;
  const bh = b.maxY - b.minY + 1;
  if (Math.abs(aw - bw) > Math.max(aw, bw) * 0.55) return false;
  if (Math.abs(ah - bh) > Math.max(ah, bh) * 0.55) return false;
  const acx = (a.minX + a.maxX) / 2;
  const bcx = (b.minX + b.maxX) / 2;
  if (Math.abs(acx - bcx) > Math.max(aw, bw) * 0.65) return false;
  const gap = a.maxY < b.minY ? b.minY - a.maxY : b.maxY < a.minY ? a.minY - b.maxY : -1;
  if (gap < 1 || gap > maxGapPx) return false;
  return true;
}

function mergeTwoBlobs(a: Blob, b: Blob): Blob {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    pixels: a.pixels + b.pixels,
    color: a.color !== "dark" ? a.color : b.color,
    points: a.points && b.points ? [...a.points, ...b.points] : a.points ?? b.points,
  };
}

type SocketPairMergeResult = {
  blobs: Blob[];
  paired: boolean;
};

/**
 * Glue double-socket halves (side-by-side or stacked) into one blob.
 * If a third neighbour sits next to the pair, skip — that is a dense row of separate marks.
 */
function mergeSocketPairs(
  blobs: Blob[],
  maxSymbolSizePx: number,
  maxGapPx = 20
): SocketPairMergeResult {
  if (blobs.length < 2) return { blobs, paired: false };
  const remaining = blobs.slice();
  const out: Blob[] = [];
  let paired = false;

  while (remaining.length > 0) {
    const a = remaining.shift()!;
    let partnerIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const b = remaining[i]!;
      if (!isHorizontalSocketPair(a, b, maxGapPx) && !isVerticalSocketPair(a, b, maxGapPx)) {
        continue;
      }
      const merged = mergeTwoBlobs(a, b);
      const mw = merged.maxX - merged.minX + 1;
      const mh = merged.maxY - merged.minY + 1;
      if (mw > maxSymbolSizePx || mh > maxSymbolSizePx) continue;
      const neighbours = [
        ...out,
        ...remaining.filter((_, j) => j !== i),
      ];
      // Same spacing as pair gap → dense row of separate marks, not a double socket.
      const crowded = neighbours.some((o) => blobsOverlapOrNear(merged, o, maxGapPx));
      if (crowded) continue;
      partnerIdx = i;
      break;
    }
    if (partnerIdx >= 0) {
      const b = remaining.splice(partnerIdx, 1)[0]!;
      out.push(mergeTwoBlobs(a, b));
      paired = true;
    } else {
      out.push(a);
    }
  }
  return { blobs: out, paired };
}

function isSocketPairContext(
  categoryHint?: PickSymbolCategoryHint,
  normalizedPoint?: string,
  optionsMerge?: boolean
): boolean {
  if (optionsMerge) return true;
  const point = (normalizedPoint ?? "").toLowerCase();
  return (
    categoryHint === "socket" ||
    point.includes("socket") ||
    point.includes("zasuv")
  );
}

/**
 * Detect symbol bbox around a canvas click using multi-component color analysis.
 */
export function pickSymbolFromClick(input: PickSymbolFromClickInput): PickSymbolFromClickResult {
  const {
    imageData,
    clickCanvasPx,
    pageWidth,
    pageHeight,
    categoryHint,
    normalizedPoint,
  } = input;
  const opts = input.options ?? {};
  const minR = opts.minSearchRadiusPx ?? 20;
  const maxR = opts.maxSearchRadiusPx ?? 48;
  /** Only glue strokes of the *same* symbol (cross + circle). Dense plans use ~8–20px gaps between symbols. */
  const partGapPx = opts.mergeGapPx ?? 4;
  const maxAspectRatio = opts.maxAspectRatio ?? 8;
  const minComponentPixels = opts.minComponentPixels ?? 3;
  /** One electrical symbol is small — never swallow neighbours. */
  const maxSymbolSizePx = opts.maxSymbolSizePx ?? 56;
  const maxSeedDistancePx = opts.maxSeedDistancePx ?? 18;
  const doSocketPair =
    opts.mergeHorizontalSocketPair ??
    isSocketPairContext(categoryHint, normalizedPoint, false);

  const preferred = categoryToColorPreference(categoryHint, normalizedPoint);
  const allowDark = categoryHint === "unknown" || categoryHint === "cable" || !categoryHint;

  const cx = Math.round(clickCanvasPx.x);
  const cy = Math.round(clickCanvasPx.y);

  const radii = [minR, Math.round((minR + maxR) / 2), maxR];
  let lastRawSearchBbox: EstimatorPositionBBox | null = null;
  let lastRejected: RejectedSymbolComponent[] = [];

  for (const radius of radii) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(pageWidth, Math.ceil(cx + radius));
    const y1 = Math.min(pageHeight, Math.ceil(cy + radius));
    const winW = x1 - x0;
    const winH = y1 - y0;

    const rawSearchBbox: EstimatorPositionBBox = {
      x: clamp01(x0 / pageWidth),
      y: clamp01(y0 / pageHeight),
      width: clamp01(winW / pageWidth),
      height: clamp01(winH / pageHeight),
    };
    lastRawSearchBbox = rawSearchBbox;

    const mask = new Uint8Array(winW * winH);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * pageWidth + x) * 4;
        const r = imageData.data[idx] ?? 255;
        const g = imageData.data[idx + 1] ?? 255;
        const b = imageData.data[idx + 2] ?? 255;
        const local = (y - y0) * winW + (x - x0);
        // Dark strokes always form components — a symbol may mix colored and
        // dark ink (cross + circle); analyzeComponent still rejects stray dark.
        mask[local] = maskValueForPixel(r, g, b, preferred, true);
      }
    }

    const visited = new Uint8Array(winW * winH);
    const rawBlobs: Blob[] = [];
    for (let start = 0; start < winW * winH; start++) {
      if (mask[start] === 0 || visited[start]) continue;
      const blob = floodComponent(mask, visited, winW, winH, start, mask[start]!);
      if (blob && blob.pixels >= minComponentPixels) {
        blob.minX += x0;
        blob.maxX += x0;
        blob.minY += y0;
        blob.maxY += y0;
        blob.points = blob.points?.map((p) => ({ x: p.x + x0, y: p.y + y0 }));
        rawBlobs.push(blob);
      }
    }

    const rejectedEntries: Array<{
      blob: Blob;
      reason: string;
      colorGroup: VisualColorHint | "dark" | "unknown";
    }> = [];
    const acceptedBlobs: Blob[] = [];
    for (const blob of rawBlobs) {
      const verdict = analyzeComponent(
        blob,
        cx,
        cy,
        maxAspectRatio,
        maxSymbolSizePx,
        preferred,
        allowDark
      );
      if (verdict.rejectReason) {
        rejectedEntries.push({
          blob,
          reason: verdict.rejectReason,
          colorGroup: verdict.colorGroup,
        });
        continue;
      }
      acceptedBlobs.push(blob);
    }
    const toRejectedComponents = (
      exclude?: ReadonlySet<Blob>
    ): RejectedSymbolComponent[] =>
      rejectedEntries
        .filter((e) => !exclude?.has(e.blob))
        .map((e) => ({
          bbox: blobToBbox(e.blob, pageWidth, pageHeight, 0),
          reason: e.reason,
          colorGroup: e.colorGroup,
        }));
    const rejectedComponents = toRejectedComponents();
    lastRejected = rejectedComponents;

    if (acceptedBlobs.length === 0) continue;

    // Socket pairs only from already-valid symbol components (never text/wall).
    const pairMerge = doSocketPair
      ? mergeSocketPairs(acceptedBlobs, maxSymbolSizePx)
      : { blobs: acceptedBlobs, paired: false };
    const workBlobs = pairMerge.blobs;

    // Nearest valid blob under the pointer — do NOT pre-merge neighbours (dense plans).
    const near = workBlobs
      .map((b) => ({ b, d: distToBlobEdge(cx, cy, b) }))
      .filter((x) => x.d <= maxSeedDistancePx)
      .sort((a, b) => a.d - b.d || distToBlob(cx, cy, a.b) - distToBlob(cx, cy, b.b));

    if (near.length === 0) continue;

    const seed = near[0]!.b;
    // Grow only with tiny same-symbol fragments — never peer marks / text / walls.
    const fragmentGapPx = Math.min(partGapPx, 3);
    const cluster = [seed];
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of workBlobs) {
        if (cluster.includes(candidate)) continue;
        const sameColor =
          candidate.color === seed.color ||
          candidate.color === "dark" ||
          seed.color === "dark";
        if (!sameColor) continue;
        if (!similarStrokeSize(seed, candidate) && candidate.pixels > seed.pixels * 0.35) {
          continue;
        }
        const touches = cluster.some((c) =>
          blobsOverlapOrNear(c, candidate, fragmentGapPx)
        );
        if (!touches) continue;
        // Peer-sized neighbour = separate mark, not a fragment (pairs already
        // merged) — unless the bboxes truly overlap (cross inside circle).
        const seedW = seed.maxX - seed.minX + 1;
        const seedH = seed.maxY - seed.minY + 1;
        const candW = candidate.maxX - candidate.minX + 1;
        const candH = candidate.maxY - candidate.minY + 1;
        const seedArea = seedW * seedH;
        const candArea = candW * candH;
        const similarSize =
          candArea >= seedArea * 0.4 && candArea <= seedArea * 2.5;
        if (
          similarSize &&
          !cluster.some((c) => blobsStrictlyOverlap(c, candidate))
        ) {
          continue;
        }
        const nextMinX = Math.min(...cluster.map((c) => c.minX), candidate.minX);
        const nextMinY = Math.min(...cluster.map((c) => c.minY), candidate.minY);
        const nextMaxX = Math.max(...cluster.map((c) => c.maxX), candidate.maxX);
        const nextMaxY = Math.max(...cluster.map((c) => c.maxY), candidate.maxY);
        const nw = nextMaxX - nextMinX + 1;
        const nh = nextMaxY - nextMinY + 1;
        if (nw > maxSymbolSizePx || nh > maxSymbolSizePx) continue;
        cluster.push(candidate);
        grew = true;
      }
    }

    // Complete the symbol with parts rejected ONLY for color (e.g. dark circle
    // around a colored cross). They must truly overlap — walls/text stay out.
    const absorbedBlobs = new Set<Blob>();
    let absorbed = true;
    while (absorbed) {
      absorbed = false;
      for (const entry of rejectedEntries) {
        if (entry.reason !== "wrong_color") continue;
        if (absorbedBlobs.has(entry.blob)) continue;
        if (!cluster.some((c) => blobsStrictlyOverlap(c, entry.blob))) continue;
        const nMinX = Math.min(...cluster.map((c) => c.minX), entry.blob.minX);
        const nMinY = Math.min(...cluster.map((c) => c.minY), entry.blob.minY);
        const nMaxX = Math.max(...cluster.map((c) => c.maxX), entry.blob.maxX);
        const nMaxY = Math.max(...cluster.map((c) => c.maxY), entry.blob.maxY);
        if (
          nMaxX - nMinX + 1 > maxSymbolSizePx ||
          nMaxY - nMinY + 1 > maxSymbolSizePx
        ) {
          continue;
        }
        cluster.push(entry.blob);
        absorbedBlobs.add(entry.blob);
        absorbed = true;
      }
    }
    const finalRejected =
      absorbedBlobs.size > 0 ? toRejectedComponents(absorbedBlobs) : rejectedComponents;

    let minX = pageWidth;
    let minY = pageHeight;
    let maxX = 0;
    let maxY = 0;
    let totalPixels = 0;
    let dominantColor: VisualColorHint | "dark" | "unknown" = seed.color;
    for (const c of cluster) {
      minX = Math.min(minX, c.minX);
      minY = Math.min(minY, c.minY);
      maxX = Math.max(maxX, c.maxX);
      maxY = Math.max(maxY, c.maxY);
      totalPixels += c.pixels;
      if (c.color !== "dark") dominantColor = c.color;
    }

    const blobW = maxX - minX + 1;
    const blobH = maxY - minY + 1;
    if (
      isLongLineBlob(
        { minX, minY, maxX, maxY, pixels: totalPixels, color: dominantColor },
        maxAspectRatio
      )
    ) {
      return {
        found: false,
        rawSearchBbox,
        symbolMaskBbox: null,
        tightSymbolBbox: null,
        center: { x: clamp01(cx / pageWidth), y: clamp01(cy / pageHeight) },
        colorHint: dominantColor,
        components: [],
        rejectedComponents,
        confidence: "low",
        needsReview: true,
        reason: "dimension_line",
      };
    }

    // Mask bbox = exact symbol pixels; tight = small pad for display/hit target.
    const symbolMaskBbox: EstimatorPositionBBox = {
      x: clamp01(minX / pageWidth),
      y: clamp01(minY / pageHeight),
      width: clamp01(blobW / pageWidth),
      height: clamp01(blobH / pageHeight),
    };
    const tightSymbolBbox: EstimatorPositionBBox = {
      x: clamp01((minX - 2) / pageWidth),
      y: clamp01((minY - 2) / pageHeight),
      width: clamp01((blobW + 4) / pageWidth),
      height: clamp01((blobH + 4) / pageHeight),
    };

    const colorOk =
      dominantColor !== "unknown" &&
      (dominantColor === "dark"
        ? allowDark
        : preferred.includes(dominantColor as VisualColorHint));
    const confidence: "high" | "medium" | "low" =
      totalPixels >= 12 && colorOk
        ? "high"
        : totalPixels >= 6 && colorOk
          ? "medium"
          : "low";

    const isDoublePair =
      pairMerge.paired &&
      (dominantColor === "green" || categoryHint === "socket");
    // Low/medium pick → draft only; unknown colorHint → confirm; double socket → confirm.
    const needsReview =
      confidence === "low" ||
      isDoublePair ||
      categoryHint === "unknown" ||
      !categoryHint ||
      !colorOk;

    // Outline strictly from the accepted cluster's own pixels — never from a
    // bbox re-scan that could pull in same-color text/dimension ink nearby.
    const clusterPoints = cluster.flatMap((c) => c.points ?? []);
    const outlinePolygon =
      outlinePolygonFromInkPoints(clusterPoints, pageWidth, pageHeight) ?? undefined;

    return {
      found: true,
      rawSearchBbox,
      symbolMaskBbox,
      tightSymbolBbox,
      center: {
        x: clamp01((minX + maxX) / 2 / pageWidth),
        y: clamp01((minY + maxY) / 2 / pageHeight),
      },
      colorHint: dominantColor,
      components: cluster,
      rejectedComponents: finalRejected,
      confidence,
      needsReview,
      reason: isDoublePair ? "composite_double_socket" : "symbol_mask",
      suggestedNormalizedPoint: isDoublePair ? "double_socket_point" : undefined,
      outlinePolygon,
    };
  }

  const fallbackR = minR;
  const x0 = Math.max(0, Math.floor(cx - fallbackR));
  const y0 = Math.max(0, Math.floor(cy - fallbackR));
  const x1 = Math.min(pageWidth, Math.ceil(cx + fallbackR));
  const y1 = Math.min(pageHeight, Math.ceil(cy + fallbackR));

  return {
    found: false,
    rawSearchBbox: lastRawSearchBbox ?? {
      x: clamp01(x0 / pageWidth),
      y: clamp01(y0 / pageHeight),
      width: clamp01((x1 - x0) / pageWidth),
      height: clamp01((y1 - y0) / pageHeight),
    },
    symbolMaskBbox: null,
    tightSymbolBbox: null,
    center: { x: clamp01(cx / pageWidth), y: clamp01(cy / pageHeight) },
    colorHint: "unknown",
    components: [],
    rejectedComponents: lastRejected,
    confidence: "low",
    needsReview: true,
    reason: lastRejected.length > 0 ? "no_clean_symbol" : "no_symbol_pixels",
  };
}

export type NearbySymbolCandidate = {
  id: string;
  bbox: EstimatorPositionBBox;
  center: { x: number; y: number };
  colorHint: VisualColorHint | "dark" | "unknown";
  pixelBbox: { minX: number; minY: number; maxX: number; maxY: number };
  distancePx: number;
  /** Normalized outline of this candidate's own ink (displayed page space). */
  outlinePolygon?: Array<{ x: number; y: number }>;
  /** Exact ink pixels (device px) — merged outlines when assembling a symbol. */
  inkPoints?: Array<{ x: number; y: number }>;
  /**
   * Not a stand-alone match (e.g. dark stroke for a colored category) —
   * offered only as a building block when assembling the full symbol.
   */
  partOnly?: boolean;
};

/**
 * List separate symbol candidates near a click — for dense-plan loupe.
 * Only symbol-like components (not text/wall/dimension/lines).
 */
export function listNearbySymbolCandidates(
  input: PickSymbolFromClickInput
): NearbySymbolCandidate[] {
  const {
    imageData,
    clickCanvasPx,
    pageWidth,
    pageHeight,
    categoryHint,
    normalizedPoint,
  } = input;
  const opts = input.options ?? {};
  const radius = opts.maxSearchRadiusPx ?? 56;
  const maxAspectRatio = opts.maxAspectRatio ?? 8;
  const minComponentPixels = opts.minComponentPixels ?? 3;
  const maxSymbolSizePx = opts.maxSymbolSizePx ?? 56;
  const doSocketPair =
    opts.mergeHorizontalSocketPair ??
    isSocketPairContext(categoryHint, normalizedPoint, false);

  const preferred = categoryToColorPreference(categoryHint, normalizedPoint);
  const allowDark =
    categoryHint === "unknown" || categoryHint === "cable" || !categoryHint;
  const cx = Math.round(clickCanvasPx.x);
  const cy = Math.round(clickCanvasPx.y);

  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(pageWidth, Math.ceil(cx + radius));
  const y1 = Math.min(pageHeight, Math.ceil(cy + radius));
  const winW = x1 - x0;
  const winH = y1 - y0;
  if (winW <= 0 || winH <= 0) return [];

  const mask = new Uint8Array(winW * winH);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * pageWidth + x) * 4;
      // Dark ink always forms components — usable as symbol building blocks.
      mask[(y - y0) * winW + (x - x0)] = maskValueForPixel(
        imageData.data[idx] ?? 255,
        imageData.data[idx + 1] ?? 255,
        imageData.data[idx + 2] ?? 255,
        preferred,
        true
      );
    }
  }

  const visited = new Uint8Array(winW * winH);
  const acceptedBlobs: Blob[] = [];
  /** Rejected ONLY for color — offered as parts when assembling a symbol. */
  const partBlobs: Blob[] = [];
  for (let start = 0; start < winW * winH; start++) {
    if (mask[start] === 0 || visited[start]) continue;
    const blob = floodComponent(mask, visited, winW, winH, start, mask[start]!);
    if (!blob || blob.pixels < minComponentPixels) continue;
    blob.minX += x0;
    blob.maxX += x0;
    blob.minY += y0;
    blob.maxY += y0;
    blob.points = blob.points?.map((p) => ({ x: p.x + x0, y: p.y + y0 }));
    const verdict = analyzeComponent(
      blob,
      cx,
      cy,
      maxAspectRatio,
      maxSymbolSizePx,
      preferred,
      allowDark
    );
    if (verdict.rejectReason === "wrong_color") {
      partBlobs.push(blob);
      continue;
    }
    if (verdict.rejectReason) continue;
    acceptedBlobs.push(blob);
  }

  // Loupe lists separate marks; only glue true double-socket pairs when requested.
  const workBlobs = doSocketPair
    ? mergeSocketPairs(acceptedBlobs, maxSymbolSizePx).blobs
    : acceptedBlobs;

  const used = new Set<Blob>();
  const ordered = workBlobs
    .slice()
    .sort((a, b) => distToBlobEdge(cx, cy, a) - distToBlobEdge(cx, cy, b));

  const candidates: NearbySymbolCandidate[] = [];
  let n = 0;
  const fragmentGapPx = 2;
  for (const seed of ordered) {
    if (used.has(seed)) continue;
    const cluster = [seed];
    used.add(seed);
    let grew = true;
    while (grew) {
      grew = false;
      for (const candidate of workBlobs) {
        if (used.has(candidate)) continue;
        const sameColor =
          candidate.color === seed.color ||
          candidate.color === "dark" ||
          seed.color === "dark";
        if (!sameColor) continue;
        if (!cluster.some((c) => blobsOverlapOrNear(c, candidate, fragmentGapPx))) {
          continue;
        }
        const seedW = seed.maxX - seed.minX + 1;
        const seedH = seed.maxY - seed.minY + 1;
        const candW = candidate.maxX - candidate.minX + 1;
        const candH = candidate.maxY - candidate.minY + 1;
        const seedArea = seedW * seedH;
        const candArea = candW * candH;
        // Peer-sized = separate loupe option (user picks which parts belong).
        if (candArea >= seedArea * 0.4 && candArea <= seedArea * 2.5) continue;
        const nextMinX = Math.min(...cluster.map((c) => c.minX), candidate.minX);
        const nextMinY = Math.min(...cluster.map((c) => c.minY), candidate.minY);
        const nextMaxX = Math.max(...cluster.map((c) => c.maxX), candidate.maxX);
        const nextMaxY = Math.max(...cluster.map((c) => c.maxY), candidate.maxY);
        if (
          nextMaxX - nextMinX + 1 > maxSymbolSizePx ||
          nextMaxY - nextMinY + 1 > maxSymbolSizePx
        ) {
          continue;
        }
        cluster.push(candidate);
        used.add(candidate);
        grew = true;
      }
    }

    let minX = pageWidth;
    let minY = pageHeight;
    let maxX = 0;
    let maxY = 0;
    let color: VisualColorHint | "dark" | "unknown" = seed.color;
    for (const c of cluster) {
      minX = Math.min(minX, c.minX);
      minY = Math.min(minY, c.minY);
      maxX = Math.max(maxX, c.maxX);
      maxY = Math.max(maxY, c.maxY);
      if (c.color !== "dark") color = c.color;
    }
    const clusterPoints = cluster.flatMap((c) => c.points ?? []);
    candidates.push({
      id: `cand_${n++}`,
      bbox: {
        x: clamp01((minX - 1) / pageWidth),
        y: clamp01((minY - 1) / pageHeight),
        width: clamp01((maxX - minX + 3) / pageWidth),
        height: clamp01((maxY - minY + 3) / pageHeight),
      },
      center: {
        x: clamp01((minX + maxX) / 2 / pageWidth),
        y: clamp01((minY + maxY) / 2 / pageHeight),
      },
      colorHint: color,
      pixelBbox: { minX, minY, maxX, maxY },
      distancePx: distToBlobEdge(cx, cy, {
        minX,
        minY,
        maxX,
        maxY,
        pixels: 0,
        color: seed.color,
      }),
      outlinePolygon:
        outlinePolygonFromInkPoints(clusterPoints, pageWidth, pageHeight) ?? undefined,
      inkPoints: clusterPoints,
    });
  }

  // Wrong-color compact strokes = building blocks for manual symbol assembly.
  for (const blob of partBlobs) {
    candidates.push({
      id: `part_${n++}`,
      bbox: blobToBbox(blob, pageWidth, pageHeight, 1),
      center: {
        x: clamp01((blob.minX + blob.maxX) / 2 / pageWidth),
        y: clamp01((blob.minY + blob.maxY) / 2 / pageHeight),
      },
      colorHint: blob.color,
      pixelBbox: {
        minX: blob.minX,
        minY: blob.minY,
        maxX: blob.maxX,
        maxY: blob.maxY,
      },
      distancePx: distToBlobEdge(cx, cy, blob),
      outlinePolygon:
        outlinePolygonFromInkPoints(blob.points ?? [], pageWidth, pageHeight) ??
        undefined,
      inkPoints: blob.points,
      partOnly: true,
    });
  }

  // Full matches first (nearest first), assembly parts after.
  return candidates.sort((a, b) => {
    if (Boolean(a.partOnly) !== Boolean(b.partOnly)) return a.partOnly ? 1 : -1;
    return a.distancePx - b.distancePx;
  });
}

/** Dense = two or more full candidate marks near the click (parts don't count). */
export function isDenseSymbolClick(input: PickSymbolFromClickInput): boolean {
  return (
    listNearbySymbolCandidates(input).filter((c) => !c.partOnly).length >= 2
  );
}
