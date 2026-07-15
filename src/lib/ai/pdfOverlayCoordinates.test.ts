import { describe, expect, it } from "vitest";
import {
  cssToCanvasPixels,
  canvasPixelsToDisplayedNormalized,
  isInsideRenderedPage,
  overlayPointFromClient,
} from "./pdfOverlayCoordinates";

describe("pdfOverlayCoordinates", () => {
  const ctx = {
    cssWidth: 400,
    cssHeight: 300,
    canvasWidth: 800,
    canvasHeight: 600,
    devicePixelRatio: 2,
    zoom: 1.75,
    scrollLeft: 120,
    scrollTop: 40,
  };

  it("maps CSS overlay clicks to canvas device pixels with DPR scaling", () => {
    const canvas = cssToCanvasPixels(100, 150, ctx);
    expect(canvas.x).toBe(200);
    expect(canvas.y).toBe(300);
  });

  it("maps canvas pixels to normalized displayed coordinates", () => {
    const norm = canvasPixelsToDisplayedNormalized(400, 300, ctx);
    expect(norm.x).toBeCloseTo(0.5, 5);
    expect(norm.y).toBeCloseTo(0.5, 5);
  });

  it("uses overlay rect without scroll offset error (client coords)", () => {
    const pt = overlayPointFromClient(260, 190, { left: 100, top: 40 }, ctx);
    expect(pt).not.toBeNull();
    expect(pt!.css.x).toBe(160);
    expect(pt!.css.y).toBe(150);
    expect(pt!.canvas.x).toBe(320);
    expect(pt!.canvas.y).toBe(300);
    expect(isInsideRenderedPage(pt!.displayedNormalized)).toBe(true);
  });

  it("returns null for clicks outside overlay bounds", () => {
    const pt = overlayPointFromClient(50, 50, { left: 100, top: 40 }, ctx);
    expect(pt).toBeNull();
  });
});
