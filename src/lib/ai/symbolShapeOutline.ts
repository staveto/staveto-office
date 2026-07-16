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

export type SymbolInkColorGroup = "red" | "orange" | "green";

export function isSymbolInkPixel(
  r: number,
  g: number,
  b: number,
  colorGroup?: SymbolInkColorGroup | null
): boolean {
  if (isBg(r, g, b)) return false;
  const color = classifyPixelColor(r, g, b);
  // Known symbol color → only that color counts (walls/dimensions stay out).
  if (colorGroup) return color === colorGroup;
  if (color) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Dark strokes / black linework on plans
  return max < 140 && max - min < 50;
}

/** One connected run of symbol ink inside an inspected window. */
export type InkComponent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
  points: Pt[];
};

/**
 * Label 4-connected ink components inside a pixel window.
 * Pixels are filtered by isSymbolInkPixel (optionally color-scoped).
 */
export function collectInkComponents(
  imageData: ImageData,
  window: { x0: number; y0: number; x1: number; y1: number },
  pageWidth: number,
  colorGroup?: SymbolInkColorGroup | null
): InkComponent[] {
  const { x0, y0, x1, y1 } = window;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return [];

  const mask = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * pageWidth + x) * 4;
      const r = imageData.data[i] ?? 255;
      const g = imageData.data[i + 1] ?? 255;
      const b = imageData.data[i + 2] ?? 255;
      if (isSymbolInkPixel(r, g, b, colorGroup)) mask[(y - y0) * w + (x - x0)] = 1;
    }
  }

  const visited = new Uint8Array(w * h);
  const components: InkComponent[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || visited[start]) continue;
    const stack = [start];
    visited[start] = 1;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    const points: Pt[] = [];
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const lx = idx % w;
      const ly = (idx / w) | 0;
      if (lx < minX) minX = lx;
      if (lx > maxX) maxX = lx;
      if (ly < minY) minY = ly;
      if (ly > maxY) maxY = ly;
      points.push({ x: lx + x0, y: ly + y0 });
      const neighbors = [
        lx > 0 ? idx - 1 : -1,
        lx < w - 1 ? idx + 1 : -1,
        ly > 0 ? idx - w : -1,
        ly < h - 1 ? idx + w : -1,
      ];
      for (const n of neighbors) {
        if (n < 0 || visited[n] || !mask[n]) continue;
        visited[n] = 1;
        stack.push(n);
      }
    }
    if (points.length < 2) continue;
    components.push({
      minX: minX + x0,
      minY: minY + y0,
      maxX: maxX + x0,
      maxY: maxY + y0,
      pixels: points.length,
      points,
    });
  }
  return components;
}

/** Text labels / dimension lines / wall strokes — never part of a symbol shape. */
export function isNonSymbolInkComponent(c: InkComponent): boolean {
  const w = c.maxX - c.minX + 1;
  const h = c.maxY - c.minY + 1;
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
  // Long thin stroke → dimension/wall line.
  if (aspect > 6 && Math.max(w, h) >= 20) return true;
  // Wide short run of ink → text label ("560", "v-1850mm").
  if (w / Math.max(1, h) >= 2.4 && h <= 18 && w >= 16) return true;
  // Tall narrow run → vertical text.
  if (h / Math.max(1, w) >= 3.5 && w <= 12 && h >= 24) return true;
  return false;
}

function componentEdgeDist(cx: number, cy: number, c: InkComponent): number {
  const dx = Math.max(c.minX - cx, 0, cx - c.maxX);
  const dy = Math.max(c.minY - cy, 0, cy - c.maxY);
  return Math.hypot(dx, dy);
}

function componentsNear(a: InkComponent, b: InkComponent, gap: number): boolean {
  return (
    a.minX - gap <= b.maxX &&
    b.minX - gap <= a.maxX &&
    a.minY - gap <= b.maxY &&
    b.minY - gap <= a.maxY
  );
}

/**
 * Keep only the component(s) that form the symbol at the window center:
 * nearest valid component + touching fragments. Text/lines stay out.
 */
export function selectSymbolComponents(
  components: InkComponent[],
  centerX: number,
  centerY: number,
  options?: { fragmentGapPx?: number }
): InkComponent[] {
  if (components.length === 0) return [];
  const gap = options?.fragmentGapPx ?? 3;
  const valid = components.filter((c) => !isNonSymbolInkComponent(c));
  // Everything looks like text/line (e.g. LED strip symbol) → nearest ink wins.
  const pool = valid.length > 0 ? valid : components;
  const seed = pool
    .slice()
    .sort((a, b) => componentEdgeDist(centerX, centerY, a) - componentEdgeDist(centerX, centerY, b))[0]!;
  const selected = [seed];
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of valid) {
      if (selected.includes(c)) continue;
      if (!selected.some((s) => componentsNear(s, c, gap))) continue;
      selected.push(c);
      grew = true;
    }
  }
  return selected;
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
 * Outline the symbol at the bbox center as a normalized convex-hull polygon.
 * Connected-component analysis keeps text labels / dimension lines / wall
 * strokes out of the shape even when they share the symbol's ink color.
 */
export function extractSymbolOutlinePolygon(
  imageData: ImageData,
  pixelBbox: { minX: number; minY: number; maxX: number; maxY: number },
  pageWidth: number,
  pageHeight: number,
  options?: { sampleStep?: number; padPx?: number; colorGroup?: SymbolInkColorGroup | null }
): Pt[] | null {
  if (pageWidth <= 0 || pageHeight <= 0) return null;
  const pad = options?.padPx ?? 2;
  const win = {
    x0: Math.max(0, Math.floor(pixelBbox.minX) - pad),
    y0: Math.max(0, Math.floor(pixelBbox.minY) - pad),
    x1: Math.min(pageWidth - 1, Math.ceil(pixelBbox.maxX) + pad),
    y1: Math.min(pageHeight - 1, Math.ceil(pixelBbox.maxY) + pad),
  };
  const centerX = (pixelBbox.minX + pixelBbox.maxX) / 2;
  const centerY = (pixelBbox.minY + pixelBbox.maxY) / 2;

  const pickSamples = (group?: SymbolInkColorGroup | null): Pt[] => {
    const components = collectInkComponents(imageData, win, pageWidth, group);
    if (components.length === 0) return [];
    const selected = selectSymbolComponents(components, centerX, centerY);
    return selected.flatMap((c) => c.points);
  };

  // Color-filtered first (symbol's own ink); fallback to any ink if too sparse.
  let samples = options?.colorGroup ? pickSamples(options.colorGroup) : pickSamples(null);
  if (samples.length < 3 && options?.colorGroup) samples = pickSamples(null);
  if (samples.length < 3) return null;

  return outlinePolygonFromInkPoints(samples, pageWidth, pageHeight);
}

/**
 * Normalized convex-hull outline from exact ink pixel points
 * (slightly expanded so the stroke stays inside the shape).
 */
export function outlinePolygonFromInkPoints(
  points: Pt[],
  pageWidth: number,
  pageHeight: number
): Pt[] | null {
  if (points.length < 3 || pageWidth <= 0 || pageHeight <= 0) return null;
  const hull = convexHull(points);
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
  /** Raw tinted pixels for sync canvas draw (no Image decode wait). */
  imageData: ImageData;
  inkPixels: number;
};

/**
 * Copy symbol ink from the page ImageData and recolor it.
 * Transparent everywhere else — this IS the symbol shape, not a frame.
 * Component analysis keeps neighbouring text/dimension ink out of the tint.
 */
export function buildTintedSymbolMask(
  imageData: ImageData,
  pixelBbox: { minX: number; minY: number; maxX: number; maxY: number },
  pageWidth: number,
  pageHeight: number,
  tint: { r: number; g: number; b: number },
  options?: { padPx?: number; alpha?: number; colorGroup?: SymbolInkColorGroup | null }
): TintedSymbolMask | null {
  if (typeof document === "undefined") return null;
  const pad = options?.padPx ?? 3;
  const alpha = options?.alpha ?? 220;
  const colorGroup = options?.colorGroup ?? null;
  const x0 = Math.max(0, Math.floor(pixelBbox.minX) - pad);
  const y0 = Math.max(0, Math.floor(pixelBbox.minY) - pad);
  const x1 = Math.min(pageWidth, Math.ceil(pixelBbox.maxX) + pad);
  const y1 = Math.min(pageHeight, Math.ceil(pixelBbox.maxY) + pad);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return null;

  const win = { x0, y0, x1: x1 - 1, y1: y1 - 1 };
  const centerX = (pixelBbox.minX + pixelBbox.maxX) / 2;
  const centerY = (pixelBbox.minY + pixelBbox.maxY) / 2;
  let components = collectInkComponents(imageData, win, pageWidth, colorGroup);
  if (components.length === 0 && colorGroup) {
    components = collectInkComponents(imageData, win, pageWidth, null);
  }
  if (components.length === 0) return null;
  const selected = selectSymbolComponents(components, centerX, centerY);

  const out = new Uint8ClampedArray(w * h * 4);
  let inkPixels = 0;
  for (const c of selected) {
    for (const p of c.points) {
      const di = ((p.y - y0) * w + (p.x - x0)) * 4;
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
    imageData: img,
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
