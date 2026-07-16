import { describe, expect, it } from "vitest";
import {
  colorInkMask,
  cropRaster,
  dominantSymbolColor,
  downscaleRaster,
  matchPageByComponents,
  prepareComponentReference,
  resampleMaskToGrid,
  tolerantShapeScore,
} from "./similarSymbolDetectionService";
import { matchVisualTemplate, type RasterImage } from "@/lib/ai/visualSymbolCounter";
import type { VisualSymbolTemplate } from "@/types/visualSymbols";

/** Build a white raster with black squares drawn at the given positions. */
function makeRaster(
  width: number,
  height: number,
  squares: Array<{ x: number; y: number; size: number }>
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const s of squares) {
    for (let y = s.y; y < s.y + s.size; y++) {
      for (let x = s.x; x < s.x + s.size; x++) {
        if (x >= width || y >= height) continue;
        const o = (y * width + x) * 4;
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
      }
    }
  }
  return { width, height, data };
}

describe("similar symbol detection helpers", () => {
  it("crops a raster region", () => {
    const raster = makeRaster(40, 40, [{ x: 10, y: 10, size: 4 }]);
    const crop = cropRaster(raster, { x: 8, y: 8, width: 8, height: 8 });
    expect(crop.width).toBe(8);
    expect(crop.height).toBe(8);
    // black pixel from the square is inside the crop at (2,2)
    const o = (2 * 8 + 2) * 4;
    expect(crop.data[o]).toBe(0);
  });

  it("downscales by an integer factor", () => {
    const raster = makeRaster(40, 20, []);
    const half = downscaleRaster(raster, 2);
    expect(half.width).toBe(20);
    expect(half.height).toBe(10);
  });

  it("finds repeated symbols via template matching (reference crop → other hits)", () => {
    // Page with three identical squares.
    const page = makeRaster(120, 60, [
      { x: 10, y: 20, size: 8 },
      { x: 60, y: 20, size: 8 },
      { x: 95, y: 30, size: 8 },
    ]);
    // Reference template cropped around the first square (with margin).
    const template = cropRaster(page, { x: 7, y: 17, width: 14, height: 14 });
    const meta: VisualSymbolTemplate = {
      id: "ref",
      source: "user_confirmed",
      trade: "electrical",
      normalizedPoint: "unknown",
      sourcePage: 1,
      confidence: "medium",
    };
    const hits = matchVisualTemplate(page, template, meta, {
      page: 1,
      threshold: 0.8,
      stride: 1,
    });
    // Finds all three squares (incl. the reference itself, filtered by caller).
    expect(hits.length).toBeGreaterThanOrEqual(3);
    for (const h of hits) {
      expect(h.bbox.width).toBeGreaterThan(0);
      expect(h.matchScore).toBeGreaterThanOrEqual(0.8);
      expect(h.source).toBe("visual_template_match");
    }
  });
});

// ---------------------------------------------------------------------------
// Component-based matching (exact same symbol)
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];
const RED: Rgb = [200, 30, 30];
const GREEN: Rgb = [30, 160, 60];

/** White raster; draw() paints colored pixels. */
function makeColorRaster(
  width: number,
  height: number,
  draw: (set: (x: number, y: number, c: Rgb) => void) => void
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  draw((x, y, c) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    data[o] = c[0];
    data[o + 1] = c[1];
    data[o + 2] = c[2];
  });
  return { width, height, data };
}

/** Half-circle "socket" stroke: arc + stem, ~12x12 px. */
function drawSocket(set: (x: number, y: number, c: Rgb) => void, ox: number, oy: number, c: Rgb) {
  for (let a = 0; a <= 180; a += 6) {
    const rad = (a * Math.PI) / 180;
    const x = ox + 6 + Math.round(6 * Math.cos(rad));
    const y = oy + 6 - Math.round(6 * Math.sin(rad));
    set(x, y, c);
    set(x, y + 1, c);
  }
  for (let y = oy + 6; y < oy + 12; y++) {
    set(ox + 6, y, c);
    set(ox + 7, y, c);
  }
}

/** Filled square blob — clearly a different shape than the socket. */
function drawSquare(set: (x: number, y: number, c: Rgb) => void, ox: number, oy: number, c: Rgb) {
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) set(ox + x, oy + y, c);
  }
}

describe("component-based similar matching", () => {
  it("detects the dominant symbol color of a crop", () => {
    const img = makeColorRaster(20, 20, (set) => drawSquare(set, 4, 4, RED));
    expect(dominantSymbolColor(img)).toBe("red");
    const blank = makeColorRaster(20, 20, () => undefined);
    expect(dominantSymbolColor(blank)).toBeNull();
  });

  it("extracts a tight color ink mask", () => {
    const img = makeColorRaster(30, 30, (set) => drawSquare(set, 10, 8, GREEN));
    const ink = colorInkMask(img, "green");
    expect(ink).not.toBeNull();
    expect(ink!.width).toBe(12);
    expect(ink!.height).toBe(12);
  });

  it("scores identical shapes near 1 and different shapes low", () => {
    const socketImg = makeColorRaster(16, 16, (set) => drawSocket(set, 2, 2, RED));
    const squareImg = makeColorRaster(16, 16, (set) => drawSquare(set, 2, 2, RED));
    const socketInk = colorInkMask(socketImg, "red")!;
    const squareInk = colorInkMask(squareImg, "red")!;
    const a = resampleMaskToGrid(socketInk.mask, socketInk.width, socketInk.height);
    const b = resampleMaskToGrid(squareInk.mask, squareInk.width, squareInk.height);
    expect(tolerantShapeScore(a, a)).toBeGreaterThanOrEqual(0.99);
    expect(tolerantShapeScore(a, b)).toBeLessThan(0.85);
  });

  it("finds identical colored symbols on the page and skips different shapes", () => {
    const page = makeColorRaster(200, 80, (set) => {
      drawSocket(set, 10, 10, RED); // reference
      drawSocket(set, 60, 12, RED); // identical
      drawSocket(set, 120, 40, RED); // identical
      drawSquare(set, 160, 10, RED); // different shape, same color
      drawSocket(set, 60, 50, GREEN); // same shape, different color
    });
    const refBbox = { x: 8 / 200, y: 8 / 80, width: 16 / 200, height: 16 / 80 };
    const ref = prepareComponentReference(page, refBbox);
    expect(ref).not.toBeNull();
    expect(ref!.color).toBe("red");
    const hits = matchPageByComponents({
      pageRaster: page,
      refShape: ref!.refShape,
      refPxW: ref!.refPxW,
      refPxH: ref!.refPxH,
      color: ref!.color,
      pageNumber: 1,
      excludeRefPx: ref!.refPx,
    });
    const strong = hits.filter((h) => h.matchScore >= 0.85);
    expect(strong.length).toBe(2);
    // The square (different shape) must not reach the accepted band.
    for (const h of hits) {
      const px = h.normalizedPosition.x * 200;
      if (px > 150) expect(h.matchScore).toBeLessThan(0.85);
    }
  });

  it("returns null reference for dark-ink symbols (falls back to NCC)", () => {
    const page = makeColorRaster(60, 60, (set) => drawSquare(set, 20, 20, [0, 0, 0]));
    const ref = prepareComponentReference(page, {
      x: 18 / 60,
      y: 18 / 60,
      width: 16 / 60,
      height: 16 / 60,
    });
    expect(ref).toBeNull();
  });
});
