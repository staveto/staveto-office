/**
 * Tighten a user-drawn selection rectangle to the actual symbol pixels inside.
 * The raw selection is kept for evidence/crop; the tight bbox drives display markers.
 */

import { classifyPixelColor } from "@/lib/ai/visualSymbolCounter";
import {
  collectInkComponents,
  isNonSymbolInkComponent,
} from "@/lib/ai/symbolShapeOutline";
import type { EstimatorPositionBBox } from "@/types/estimatorPositions";

export type TightenSymbolBboxOptions = {
  /** Full page canvas width in pixels. */
  pageWidth: number;
  /** Full page canvas height in pixels. */
  pageHeight: number;
  /** Max symbol dimension as fraction of selection (reject long lines). */
  maxAspectRatio?: number;
  /** Min symbol pixels to consider reliable. */
  minSymbolPixels?: number;
  /** Known symbol ink color — tighten only to this color's pixels. */
  colorGroup?: "red" | "orange" | "green" | null;
  /**
   * No colorGroup: pick the dominant colored group inside the selection and
   * tighten to it (walls/dimension ink never widens the box). Default true.
   */
  preferDominantColor?: boolean;
};

export type TightenSymbolBboxResult = {
  /** Tight bbox in normalized page coords (0..1), or null if unreliable. */
  tightBbox: EstimatorPositionBBox | null;
  reliable: boolean;
  outsidePlan: boolean;
  needsReview: boolean;
  center: { x: number; y: number };
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

function bboxToPixels(
  bbox: EstimatorPositionBBox,
  pageWidth: number,
  pageHeight: number
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, Math.floor(bbox.x * pageWidth)),
    y0: Math.max(0, Math.floor(bbox.y * pageHeight)),
    x1: Math.min(pageWidth, Math.ceil((bbox.x + bbox.width) * pageWidth)),
    y1: Math.min(pageHeight, Math.ceil((bbox.y + bbox.height) * pageHeight)),
  };
}

/**
 * Analyze pixels inside rawSelectionBbox and return a tighter symbol bbox.
 */
export function tightenSymbolBboxFromCrop(
  imageData: ImageData,
  rawBbox: EstimatorPositionBBox,
  options: TightenSymbolBboxOptions
): TightenSymbolBboxResult {
  const { pageWidth, pageHeight } = options;
  const maxAspectRatio = options.maxAspectRatio ?? 5;
  const minSymbolPixels = options.minSymbolPixels ?? 4;
  const preferDominant = options.preferDominantColor ?? true;

  const rawCx = rawBbox.x + rawBbox.width / 2;
  const rawCy = rawBbox.y + rawBbox.height / 2;
  const fallbackCenter = { x: clamp01(rawCx), y: clamp01(rawCy) };

  const { x0, y0, x1, y1 } = bboxToPixels(rawBbox, pageWidth, pageHeight);
  const selW = Math.max(1, x1 - x0);
  const selH = Math.max(1, y1 - y0);

  const centerPxX = rawCx * pageWidth;
  const centerPxY = rawCy * pageHeight;

  // Pass 1 — decide which ink counts. Explicit colorGroup wins; otherwise the
  // dominant colored group (symbols are colored, walls are dark, dims grey/blue).
  let targetGroup: "red" | "orange" | "green" | null = options.colorGroup ?? null;
  if (!targetGroup && preferDominant) {
    const counts: Record<"red" | "orange" | "green", number> = {
      red: 0,
      orange: 0,
      green: 0,
    };
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * pageWidth + x) * 4;
        const c = classifyPixelColor(
          imageData.data[idx] ?? 255,
          imageData.data[idx + 1] ?? 255,
          imageData.data[idx + 2] ?? 255
        );
        if (c === "red" || c === "orange" || c === "green") counts[c]++;
      }
    }
    const best = (Object.entries(counts) as Array<["red" | "orange" | "green", number]>).sort(
      (a, b) => b[1] - a[1]
    )[0]!;
    if (best[1] >= minSymbolPixels) targetGroup = best[0];
  }

  let bgPixels = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * pageWidth + x) * 4;
      if (
        isBackgroundPixel(
          imageData.data[idx] ?? 255,
          imageData.data[idx + 1] ?? 255,
          imageData.data[idx + 2] ?? 255
        )
      ) {
        bgPixels++;
      }
    }
  }

  // Connected components: text labels / dimension lines / wall strokes inside
  // the selection never count as the symbol — even in the symbol's own color.
  const components = collectInkComponents(
    imageData,
    { x0, y0, x1: x1 - 1, y1: y1 - 1 },
    pageWidth,
    targetGroup
  );
  const symbolComponents = components.filter((c) => !isNonSymbolInkComponent(c));

  let symbolPixels = 0;
  let minX = pageWidth;
  let minY = pageHeight;
  let maxX = 0;
  let maxY = 0;
  for (const c of symbolComponents) {
    symbolPixels += c.pixels;
    if (c.minX < minX) minX = c.minX;
    if (c.maxX > maxX) maxX = c.maxX;
    if (c.minY < minY) minY = c.minY;
    if (c.maxY > maxY) maxY = c.maxY;
  }

  const total = selW * selH;
  const bgRatio = total > 0 ? bgPixels / total : 1;

  if (symbolPixels === 0 && bgRatio > 0.85) {
    return {
      tightBbox: null,
      reliable: false,
      outsidePlan: false,
      needsReview: true,
      center: fallbackCenter,
    };
  }

  if (symbolPixels < minSymbolPixels) {
    return {
      tightBbox: null,
      reliable: false,
      outsidePlan: false,
      needsReview: true,
      center: fallbackCenter,
    };
  }

  const blobW = maxX - minX + 1;
  const blobH = maxY - minY + 1;
  const aspect = Math.max(blobW, blobH) / Math.max(1, Math.min(blobW, blobH));

  if (aspect > maxAspectRatio || blobW > selW * 0.95 || blobH > selH * 0.95) {
    return {
      tightBbox: null,
      reliable: false,
      outsidePlan: false,
      needsReview: true,
      center: fallbackCenter,
    };
  }

  const blobCx = (minX + maxX) / 2;
  const blobCy = (minY + maxY) / 2;
  const distFromCenter = Math.hypot(blobCx - centerPxX, blobCy - centerPxY);
  const maxDist = Math.max(selW, selH) * 0.6;
  if (distFromCenter > maxDist) {
    return {
      tightBbox: null,
      reliable: false,
      outsidePlan: false,
      needsReview: true,
      center: fallbackCenter,
    };
  }

  const pad = 1;
  const tightBbox: EstimatorPositionBBox = {
    x: clamp01((minX - pad) / pageWidth),
    y: clamp01((minY - pad) / pageHeight),
    width: clamp01((blobW + pad * 2) / pageWidth),
    height: clamp01((blobH + pad * 2) / pageHeight),
  };

  return {
    tightBbox,
    reliable: true,
    outsidePlan: false,
    needsReview: false,
    center: {
      x: clamp01(blobCx / pageWidth),
      y: clamp01(blobCy / pageHeight),
    },
  };
}
