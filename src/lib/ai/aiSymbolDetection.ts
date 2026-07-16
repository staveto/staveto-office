/**
 * AI symbol detection — pure coordinate helpers.
 *
 * The detectPlanSymbols Cloud Function returns boxes normalized to the image
 * we sent (a click crop or a page tile). These helpers build the crops/tiles
 * and map returned boxes back into full-canvas normalized coordinates.
 *
 * Pure functions — no canvas/DOM access here (see detectPlanSymbolsService).
 */

import type { EstimatorPositionBBox } from "@/types/estimatorPositions";

export type PixelRect = { x: number; y: number; width: number; height: number };

export type AiDetectedSymbol = {
  /** Normalized 0..1 bbox in full-canvas (displayed) space. */
  bbox: EstimatorPositionBBox;
  name: string;
  category: string;
  confidence: "high" | "medium" | "low";
};

/** Crop window around a click, clamped to the canvas (square when possible). */
export function clickCropRect(
  clickCanvasPx: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  targetPx = 480
): PixelRect {
  const half = Math.round(
    Math.min(targetPx, Math.min(canvasWidth, canvasHeight)) / 2
  );
  const size = half * 2;
  const x = Math.round(
    Math.max(0, Math.min(canvasWidth - size, clickCanvasPx.x - half))
  );
  const y = Math.round(
    Math.max(0, Math.min(canvasHeight - size, clickCanvasPx.y - half))
  );
  return {
    x,
    y,
    width: Math.min(size, canvasWidth),
    height: Math.min(size, canvasHeight),
  };
}

/** Click position normalized 0..1 within a crop rect. */
export function clickWithinCrop(
  clickCanvasPx: { x: number; y: number },
  crop: PixelRect
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(1, (clickCanvasPx.x - crop.x) / Math.max(1, crop.width))),
    y: Math.max(0, Math.min(1, (clickCanvasPx.y - crop.y) / Math.max(1, crop.height))),
  };
}

/** Box normalized to a crop → box normalized to the full canvas. */
export function mapCropBboxToCanvas(
  bboxInCrop: EstimatorPositionBBox,
  crop: PixelRect,
  canvasWidth: number,
  canvasHeight: number
): EstimatorPositionBBox {
  const px = crop.x + bboxInCrop.x * crop.width;
  const py = crop.y + bboxInCrop.y * crop.height;
  const pw = bboxInCrop.width * crop.width;
  const ph = bboxInCrop.height * crop.height;
  return {
    x: Math.max(0, Math.min(1, px / canvasWidth)),
    y: Math.max(0, Math.min(1, py / canvasHeight)),
    width: Math.max(0, Math.min(1, pw / canvasWidth)),
    height: Math.max(0, Math.min(1, ph / canvasHeight)),
  };
}

/**
 * Tile a large page for full-page detection. Small pages → single tile.
 * Tiles overlap so symbols on seams are seen fully by at least one tile.
 */
export function pageTileRects(
  canvasWidth: number,
  canvasHeight: number,
  maxTilePx = 2400,
  overlapFrac = 0.08
): PixelRect[] {
  const cols = Math.max(1, Math.ceil(canvasWidth / maxTilePx));
  const rows = Math.max(1, Math.ceil(canvasHeight / maxTilePx));
  if (cols === 1 && rows === 1) {
    return [{ x: 0, y: 0, width: canvasWidth, height: canvasHeight }];
  }
  const tiles: PixelRect[] = [];
  const baseW = canvasWidth / cols;
  const baseH = canvasHeight / rows;
  const padX = Math.round(baseW * overlapFrac);
  const padY = Math.round(baseH * overlapFrac);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.max(0, Math.round(c * baseW) - padX);
      const y = Math.max(0, Math.round(r * baseH) - padY);
      const right = Math.min(canvasWidth, Math.round((c + 1) * baseW) + padX);
      const bottom = Math.min(canvasHeight, Math.round((r + 1) * baseH) + padY);
      tiles.push({ x, y, width: right - x, height: bottom - y });
    }
  }
  return tiles;
}

export function bboxIoU(a: EstimatorPositionBBox, b: EstimatorPositionBBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

const CONFIDENCE_RANK = { high: 2, medium: 1, low: 0 } as const;

/**
 * Merge detections from overlapping tiles: keep the most confident box when
 * two boxes overlap strongly or one's center lies inside the other.
 */
export function dedupeDetections(
  detections: AiDetectedSymbol[],
  iouThreshold = 0.45
): AiDetectedSymbol[] {
  const sorted = [...detections].sort(
    (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
  );
  const kept: AiDetectedSymbol[] = [];
  for (const det of sorted) {
    const cx = det.bbox.x + det.bbox.width / 2;
    const cy = det.bbox.y + det.bbox.height / 2;
    const duplicate = kept.some((k) => {
      if (bboxIoU(k.bbox, det.bbox) >= iouThreshold) return true;
      const kcx = k.bbox.x + k.bbox.width / 2;
      const kcy = k.bbox.y + k.bbox.height / 2;
      const centerInK =
        cx >= k.bbox.x && cx <= k.bbox.x + k.bbox.width &&
        cy >= k.bbox.y && cy <= k.bbox.y + k.bbox.height;
      const kCenterInDet =
        kcx >= det.bbox.x && kcx <= det.bbox.x + det.bbox.width &&
        kcy >= det.bbox.y && kcy <= det.bbox.y + det.bbox.height;
      return centerInK || kCenterInDet;
    });
    if (!duplicate) kept.push(det);
  }
  return kept;
}

/**
 * Drop AI proposals that already have a mark: strong box overlap OR the
 * existing mark's center falls inside the proposal (existing tight marks are
 * often much smaller than the AI box).
 */
export function filterAlreadyMarked(
  detections: AiDetectedSymbol[],
  existing: EstimatorPositionBBox[],
  iouThreshold = 0.25
): AiDetectedSymbol[] {
  return detections.filter((det) => {
    return !existing.some((e) => {
      if (bboxIoU(det.bbox, e) >= iouThreshold) return true;
      const ecx = e.x + e.width / 2;
      const ecy = e.y + e.height / 2;
      return (
        ecx >= det.bbox.x && ecx <= det.bbox.x + det.bbox.width &&
        ecy >= det.bbox.y && ecy <= det.bbox.y + det.bbox.height
      );
    });
  });
}

/** Sanity limits: a real drawing symbol is small relative to the page. */
export function isPlausibleSymbolBox(
  bbox: EstimatorPositionBBox,
  maxPageFrac = 0.08
): boolean {
  if (bbox.width <= 0 || bbox.height <= 0) return false;
  if (bbox.width > maxPageFrac || bbox.height > maxPageFrac) return false;
  const aspect =
    Math.max(bbox.width, bbox.height) / Math.max(1e-6, Math.min(bbox.width, bbox.height));
  return aspect <= 8;
}
