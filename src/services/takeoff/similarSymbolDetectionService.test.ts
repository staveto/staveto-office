import { describe, expect, it } from "vitest";
import { cropRaster, downscaleRaster } from "./similarSymbolDetectionService";
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
