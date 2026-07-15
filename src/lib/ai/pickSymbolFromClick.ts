/**
 * Smart symbol picker — click a symbol on a rendered PDF page and detect
 * the tight bbox around multi-part colored strokes near the pointer.
 */

import { classifyPixelColor } from "@/lib/ai/visualSymbolCounter";
import type { VisualColorHint } from "@/types/visualSymbols";
import type { EstimatorPositionBBox } from "@/types/estimatorPositions";
import { extractSymbolOutlinePolygon } from "@/lib/ai/symbolShapeOutline";

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
};

export type PickSymbolFromClickResult = {
  found: boolean;
  rawSearchBbox: EstimatorPositionBBox;
  tightSymbolBbox: EstimatorPositionBBox | null;
  center: { x: number; y: number };
  colorHint: VisualColorHint | "dark" | "unknown";
  components: PickSymbolComponent[];
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  reason?: string;
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
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % width;
    const y = (idx / width) | 0;
    pixels++;
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
  };
}

function mergeNearbyBlobs(blobs: Blob[], gap: number): Blob[] {
  let merged = blobs;
  let changed = true;
  while (changed) {
    changed = false;
    const next: Blob[] = [];
    const used = new Array(merged.length).fill(false);
    for (let i = 0; i < merged.length; i++) {
      if (used[i]) continue;
      let acc = merged[i]!;
      for (let j = i + 1; j < merged.length; j++) {
        if (used[j]) continue;
        const b = merged[j]!;
        const sameColor = acc.color === b.color || acc.color === "dark" || b.color === "dark";
        if (sameColor && blobsOverlapOrNear(acc, b, gap)) {
          acc = {
            minX: Math.min(acc.minX, b.minX),
            minY: Math.min(acc.minY, b.minY),
            maxX: Math.max(acc.maxX, b.maxX),
            maxY: Math.max(acc.maxY, b.maxY),
            pixels: acc.pixels + b.pixels,
            color: acc.color !== "dark" ? acc.color : b.color,
          };
          used[j] = true;
          changed = true;
        }
      }
      next.push(acc);
    }
    merged = next;
  }
  return merged;
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

/** Two similar blobs side-by-side → typical double-socket graphic. */
function isHorizontalSocketPair(a: Blob, b: Blob, maxGapPx = 20): boolean {
  if (a.color !== b.color && a.color !== "dark" && b.color !== "dark") return false;
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

function mergeTwoBlobs(a: Blob, b: Blob): Blob {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
    pixels: a.pixels + b.pixels,
    color: a.color !== "dark" ? a.color : b.color,
  };
}

/**
 * Glue double-socket halves into one blob.
 * If a third neighbour sits next to the pair, skip — that is a dense row of separate marks.
 */
function mergeHorizontalSocketPairs(
  blobs: Blob[],
  maxSymbolSizePx: number,
  maxGapPx = 20
): Blob[] {
  if (blobs.length < 2) return blobs;
  const remaining = blobs.slice();
  const out: Blob[] = [];

  while (remaining.length > 0) {
    const a = remaining.shift()!;
    let partnerIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const b = remaining[i]!;
      if (!isHorizontalSocketPair(a, b, maxGapPx)) continue;
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
    } else {
      out.push(a);
    }
  }
  return out;
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

    const mask = new Uint8Array(winW * winH);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * pageWidth + x) * 4;
        const r = imageData.data[idx] ?? 255;
        const g = imageData.data[idx + 1] ?? 255;
        const b = imageData.data[idx + 2] ?? 255;
        const local = (y - y0) * winW + (x - x0);
        mask[local] = maskValueForPixel(r, g, b, preferred, allowDark);
      }
    }

    const visited = new Uint8Array(winW * winH);
    const blobs: Blob[] = [];
    for (let start = 0; start < winW * winH; start++) {
      if (mask[start] === 0 || visited[start]) continue;
      const blob = floodComponent(mask, visited, winW, winH, start, mask[start]!);
      if (blob && blob.pixels >= minComponentPixels) {
        blob.minX += x0;
        blob.maxX += x0;
        blob.minY += y0;
        blob.maxY += y0;
        if (!isLongLineBlob(blob, maxAspectRatio)) {
          const bw = blob.maxX - blob.minX + 1;
          const bh = blob.maxY - blob.minY + 1;
          if (bw <= maxSymbolSizePx && bh <= maxSymbolSizePx) {
            blobs.push(blob);
          }
        }
      }
    }

    if (blobs.length === 0) continue;

    const workBlobs = doSocketPair
      ? mergeHorizontalSocketPairs(blobs, maxSymbolSizePx)
      : blobs;

    const localCx = cx;
    const localCy = cy;
    // Nearest blob under the pointer — do NOT pre-merge neighbours (dense plans).
    const near = workBlobs
      .map((b) => ({ b, d: distToBlobEdge(localCx, localCy, b) }))
      .filter((x) => x.d <= maxSeedDistancePx)
      .sort((a, b) => a.d - b.d || distToBlob(localCx, localCy, a.b) - distToBlob(localCx, localCy, b.b));

    if (near.length === 0) continue;

    const seed = near[0]!.b;
    // Grow only with touching fragments of the same symbol (tiny gap), never other marks.
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
        const touches = cluster.some((c) => blobsOverlapOrNear(c, candidate, partGapPx));
        if (!touches) continue;
        // Peer-sized neighbour = separate mark (two lights side by side), not a fragment.
        if (!doSocketPair) {
          const seedW = seed.maxX - seed.minX + 1;
          const seedH = seed.maxY - seed.minY + 1;
          const candW = candidate.maxX - candidate.minX + 1;
          const candH = candidate.maxY - candidate.minY + 1;
          const seedArea = seedW * seedH;
          const candArea = candW * candH;
          const similarSize =
            candArea >= seedArea * 0.4 && candArea <= seedArea * 2.5;
          if (similarSize) continue;
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
        tightSymbolBbox: null,
        center: { x: clamp01(cx / pageWidth), y: clamp01(cy / pageHeight) },
        colorHint: dominantColor,
        components: blobs,
        confidence: "low",
        needsReview: true,
        reason: "dimension_line",
      };
    }

    const tightSymbolBbox: EstimatorPositionBBox = {
      x: clamp01((minX - 2) / pageWidth),
      y: clamp01((minY - 2) / pageHeight),
      width: clamp01((blobW + 4) / pageWidth),
      height: clamp01((blobH + 4) / pageHeight),
    };

    const confidence: "high" | "medium" | "low" =
      totalPixels >= 12 && preferred.includes(dominantColor as VisualColorHint)
        ? "high"
        : totalPixels >= 6
          ? "medium"
          : "low";

    const outlinePolygon =
      extractSymbolOutlinePolygon(
        imageData,
        { minX, minY, maxX, maxY },
        pageWidth,
        pageHeight
      ) ?? undefined;

    return {
      found: true,
      rawSearchBbox,
      tightSymbolBbox,
      center: {
        x: clamp01((minX + maxX) / 2 / pageWidth),
        y: clamp01((minY + maxY) / 2 / pageHeight),
      },
      colorHint: dominantColor,
      components: cluster,
      confidence,
      needsReview: confidence === "low",
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
    rawSearchBbox: {
      x: clamp01(x0 / pageWidth),
      y: clamp01(y0 / pageHeight),
      width: clamp01((x1 - x0) / pageWidth),
      height: clamp01((y1 - y0) / pageHeight),
    },
    tightSymbolBbox: null,
    center: { x: clamp01(cx / pageWidth), y: clamp01(cy / pageHeight) },
    colorHint: "unknown",
    components: [],
    confidence: "low",
    needsReview: true,
    reason: "no_symbol_pixels",
  };
}

export type NearbySymbolCandidate = {
  id: string;
  bbox: EstimatorPositionBBox;
  center: { x: number; y: number };
  colorHint: VisualColorHint | "dark" | "unknown";
  pixelBbox: { minX: number; minY: number; maxX: number; maxY: number };
  distancePx: number;
};

/**
 * List separate symbol candidates near a click — for dense-plan loupe.
 * Neighbouring marks stay separate; only tiny same-symbol strokes are glued.
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
  const partGapPx = opts.mergeGapPx ?? 4;
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
      mask[(y - y0) * winW + (x - x0)] = maskValueForPixel(
        imageData.data[idx] ?? 255,
        imageData.data[idx + 1] ?? 255,
        imageData.data[idx + 2] ?? 255,
        preferred,
        allowDark
      );
    }
  }

  const visited = new Uint8Array(winW * winH);
  const blobs: Blob[] = [];
  for (let start = 0; start < winW * winH; start++) {
    if (mask[start] === 0 || visited[start]) continue;
    const blob = floodComponent(mask, visited, winW, winH, start, mask[start]!);
    if (!blob || blob.pixels < minComponentPixels) continue;
    blob.minX += x0;
    blob.maxX += x0;
    blob.minY += y0;
    blob.maxY += y0;
    if (isLongLineBlob(blob, maxAspectRatio)) continue;
    const bw = blob.maxX - blob.minX + 1;
    const bh = blob.maxY - blob.minY + 1;
    if (bw > maxSymbolSizePx || bh > maxSymbolSizePx) continue;
    blobs.push(blob);
  }

  const workBlobs = doSocketPair
    ? mergeHorizontalSocketPairs(blobs, maxSymbolSizePx)
    : blobs;

  const used = new Set<Blob>();
  const ordered = workBlobs
    .slice()
    .sort((a, b) => distToBlobEdge(cx, cy, a) - distToBlobEdge(cx, cy, b));

  const candidates: NearbySymbolCandidate[] = [];
  let n = 0;
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
        if (!cluster.some((c) => blobsOverlapOrNear(c, candidate, partGapPx))) continue;
        if (!doSocketPair) {
          const seedW = seed.maxX - seed.minX + 1;
          const seedH = seed.maxY - seed.minY + 1;
          const candW = candidate.maxX - candidate.minX + 1;
          const candH = candidate.maxY - candidate.minY + 1;
          const seedArea = seedW * seedH;
          const candArea = candW * candH;
          if (candArea >= seedArea * 0.4 && candArea <= seedArea * 2.5) continue;
        }
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
    });
  }

  return candidates.sort((a, b) => a.distancePx - b.distancePx);
}

export function isDenseSymbolClick(input: PickSymbolFromClickInput): boolean {
  return listNearbySymbolCandidates(input).length >= 2;
}
