/**
 * Extract a compact outline / tinted mask of symbol pixels inside a bbox.
 * Used to highlight the real symbol ink on the PDF (not an AABB frame).
 */

import { classifyPixelColor } from "@/lib/ai/visualSymbolCounter";
import type { EstimatorPositionBBox } from "@/types/estimatorPositions";

export type Pt = { x: number; y: number };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number(v.toFixed(5))));
}

function isBg(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max > 245 && min > 230) return true;
  const sat = max > 0 ? (max - min) / max : 0;
  return max > 200 && sat < 0.12;
}

export function isSymbolInkPixel(r: number, g: number, b: number): boolean {
  if (isBg(r, g, b)) return false;
  if (classifyPixelColor(r, g, b)) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Dark strokes / black linework on plans
  return max < 140 && max - min < 50;
}

/** Monotone-chain convex hull. Input in pixel coords; returns hull in same space. */
export function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 2) return points.slice();
  const pts = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Sample symbol pixels in a pixel bbox and return a normalized outline polygon
 * (convex hull of the ink). Empty when no symbol pixels found.
 */
export function extractSymbolOutlinePolygon(
  imageData: ImageData,
  pixelBbox: { minX: number; minY: number; maxX: number; maxY: number },
  pageWidth: number,
  pageHeight: number,
  options?: { sampleStep?: number; padPx?: number }
): Pt[] | null {
  if (pageWidth <= 0 || pageHeight <= 0) return null;
  const step = options?.sampleStep ?? 2;
  const pad = options?.padPx ?? 2;
  const x0 = Math.max(0, Math.floor(pixelBbox.minX) - pad);
  const y0 = Math.max(0, Math.floor(pixelBbox.minY) - pad);
  const x1 = Math.min(pageWidth - 1, Math.ceil(pixelBbox.maxX) + pad);
  const y1 = Math.min(pageHeight - 1, Math.ceil(pixelBbox.maxY) + pad);

  const samples: Pt[] = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const i = (y * pageWidth + x) * 4;
      const r = imageData.data[i] ?? 255;
      const g = imageData.data[i + 1] ?? 255;
      const b = imageData.data[i + 2] ?? 255;
      if (isSymbolInkPixel(r, g, b)) samples.push({ x, y });
    }
  }
  if (samples.length < 3) return null;

  const hull = convexHull(samples);
  if (hull.length < 3) return null;

  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  const expand = 3;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: clamp01((p.x + (dx / len) * expand) / pageWidth),
      y: clamp01((p.y + (dy / len) * expand) / pageHeight),
    };
  });
}

/** Pixel bbox from a normalized page bbox. */
export function pixelBboxFromNormalized(
  bbox: EstimatorPositionBBox,
  pageWidth: number,
  pageHeight: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: bbox.x * pageWidth,
    minY: bbox.y * pageHeight,
    maxX: (bbox.x + bbox.width) * pageWidth,
    maxY: (bbox.y + bbox.height) * pageHeight,
  };
}

export type TintedSymbolMask = {
  /** Device-pixel origin on the page canvas. */
  canvasX: number;
  canvasY: number;
  width: number;
  height: number;
  /** PNG data URL — transparent bg, tinted ink only. */
  dataUrl: string;
  inkPixels: number;
};

/**
 * Copy symbol ink from the page ImageData and recolor it.
 * Transparent everywhere else — this IS the symbol shape, not a frame.
 */
export function buildTintedSymbolMask(
  imageData: ImageData,
  pixelBbox: { minX: number; minY: number; maxX: number; maxY: number },
  pageWidth: number,
  pageHeight: number,
  tint: { r: number; g: number; b: number },
  options?: { padPx?: number; alpha?: number }
): TintedSymbolMask | null {
  if (typeof document === "undefined") return null;
  const pad = options?.padPx ?? 3;
  const alpha = options?.alpha ?? 220;
  const x0 = Math.max(0, Math.floor(pixelBbox.minX) - pad);
  const y0 = Math.max(0, Math.floor(pixelBbox.minY) - pad);
  const x1 = Math.min(pageWidth, Math.ceil(pixelBbox.maxX) + pad);
  const y1 = Math.min(pageHeight, Math.ceil(pixelBbox.maxY) + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return null;

  const out = new Uint8ClampedArray(w * h * 4);
  let inkPixels = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const si = (y * pageWidth + x) * 4;
      const di = ((y - y0) * w + (x - x0)) * 4;
      const r = imageData.data[si] ?? 255;
      const g = imageData.data[si + 1] ?? 255;
      const b = imageData.data[si + 2] ?? 255;
      if (!isSymbolInkPixel(r, g, b)) {
        out[di + 3] = 0;
        continue;
      }
      inkPixels++;
      out[di] = tint.r;
      out[di + 1] = tint.g;
      out[di + 2] = tint.b;
      out[di + 3] = alpha;
    }
  }
  if (inkPixels < 4) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // ImageData may not exist in all test envs — construct via putImageData when available.
  const img =
    typeof ImageData !== "undefined"
      ? new ImageData(out, w, h)
      : ({ data: out, width: w, height: h } as ImageData);
  ctx.putImageData(img, 0, 0);
  return {
    canvasX: x0,
    canvasY: y0,
    width: w,
    height: h,
    dataUrl: canvas.toDataURL("image/png"),
    inkPixels,
  };
}

/** Parse #RRGGBB into RGB. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
