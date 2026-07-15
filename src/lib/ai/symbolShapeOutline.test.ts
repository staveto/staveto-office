import { describe, expect, it } from "vitest";
import {
  convexHull,
  extractSymbolOutlinePolygon,
  hexToRgb,
  isSymbolInkPixel,
} from "./symbolShapeOutline";

function makeImageData(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number, number]
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height } as ImageData;
}

describe("symbolShapeOutline", () => {
  it("builds a convex hull of corner points", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(hull.length).toBe(4);
  });

  it("detects green and dark ink, ignores paper", () => {
    expect(isSymbolInkPixel(22, 163, 74)).toBe(true);
    expect(isSymbolInkPixel(40, 40, 40)).toBe(true);
    expect(isSymbolInkPixel(252, 252, 252)).toBe(false);
  });

  it("extracts a polygon around green symbol ink", () => {
    const w = 100;
    const h = 100;
    const image = makeImageData(w, h, (x, y) => {
      if (x >= 40 && x <= 55 && y >= 40 && y <= 55) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });
    const poly = extractSymbolOutlinePolygon(
      image,
      { minX: 38, minY: 38, maxX: 57, maxY: 57 },
      w,
      h,
      { sampleStep: 1 }
    );
    expect(poly).not.toBeNull();
    expect(poly!.length).toBeGreaterThanOrEqual(3);
  });

  it("parses hex colors", () => {
    expect(hexToRgb("#DC2626")).toEqual({ r: 220, g: 38, b: 38 });
  });
});
