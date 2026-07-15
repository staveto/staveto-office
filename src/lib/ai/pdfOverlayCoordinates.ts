/**
 * Coordinate mapping between screen/CSS overlay space and PDF canvas pixels.
 * Canvas internal resolution uses devicePixelRatio; overlay clicks are in CSS px.
 */

import type { EstimatorPositionBBox } from "@/types/estimatorPositions";

export type OverlayCoordinateContext = {
  /** CSS layout size of the overlay (matches canvas style width/height). */
  cssWidth: number;
  cssHeight: number;
  /** Canvas backing-store size (device pixels). */
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

export type OverlayPoint = {
  /** Position relative to overlay element top-left (CSS px). */
  css: { x: number; y: number };
  /** Matching canvas ImageData coordinates (device px). */
  canvas: { x: number; y: number };
  /** Normalized 0..1 in displayed (rotated) page space. */
  displayedNormalized: { x: number; y: number };
};

/** CSS overlay coordinates → canvas device pixels. */
export function cssToCanvasPixels(
  cssX: number,
  cssY: number,
  context: Pick<OverlayCoordinateContext, "cssWidth" | "cssHeight" | "canvasWidth" | "canvasHeight">
): { x: number; y: number } {
  if (context.cssWidth <= 0 || context.cssHeight <= 0) return { x: 0, y: 0 };
  const scaleX = context.canvasWidth / context.cssWidth;
  const scaleY = context.canvasHeight / context.cssHeight;
  return {
    x: cssX * scaleX,
    y: cssY * scaleY,
  };
}

/** Canvas device pixels → normalized displayed page coords (0..1). */
export function canvasPixelsToDisplayedNormalized(
  canvasX: number,
  canvasY: number,
  context: Pick<OverlayCoordinateContext, "canvasWidth" | "canvasHeight">
): { x: number; y: number } {
  if (context.canvasWidth <= 0 || context.canvasHeight <= 0) return { x: 0, y: 0 };
  return {
    x: canvasX / context.canvasWidth,
    y: canvasY / context.canvasHeight,
  };
}

/** Map client pointer position to overlay CSS + canvas pixel coords. */
export function overlayPointFromClient(
  clientX: number,
  clientY: number,
  overlayRect: { left: number; top: number },
  context: OverlayCoordinateContext
): OverlayPoint | null {
  const cssX = clientX - overlayRect.left;
  const cssY = clientY - overlayRect.top;
  if (
    cssX < 0 ||
    cssY < 0 ||
    cssX > context.cssWidth ||
    cssY > context.cssHeight
  ) {
    return null;
  }
  const canvas = cssToCanvasPixels(cssX, cssY, context);
  const displayedNormalized = canvasPixelsToDisplayedNormalized(
    canvas.x,
    canvas.y,
    context
  );
  return { css: { x: cssX, y: cssY }, canvas, displayedNormalized };
}

/** Whether normalized point lies on the rendered page (not outside canvas). */
export function isInsideRenderedPage(normalized: { x: number; y: number }): boolean {
  return (
    normalized.x >= 0 &&
    normalized.y >= 0 &&
    normalized.x <= 1 &&
    normalized.y <= 1
  );
}

/** Build a small normalized search bbox around a canvas click (for debug/evidence). */
export function searchBboxAroundCanvasClick(
  canvasX: number,
  canvasY: number,
  radiusCssPx: number,
  context: OverlayCoordinateContext
): EstimatorPositionBBox {
  const scale = context.canvasWidth / Math.max(1, context.cssWidth);
  const r = radiusCssPx * scale;
  const x0 = Math.max(0, canvasX - r);
  const y0 = Math.max(0, canvasY - r);
  const x1 = Math.min(context.canvasWidth, canvasX + r);
  const y1 = Math.min(context.canvasHeight, canvasY + r);
  return {
    x: x0 / context.canvasWidth,
    y: y0 / context.canvasHeight,
    width: (x1 - x0) / context.canvasWidth,
    height: (y1 - y0) / context.canvasHeight,
  };
}
