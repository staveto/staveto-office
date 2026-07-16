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

  it("colorGroup filter keeps only that color's ink (walls out)", () => {
    // Green socket pixel counts; dark wall pixel does not when group=green.
    expect(isSymbolInkPixel(22, 163, 74, "green")).toBe(true);
    expect(isSymbolInkPixel(40, 40, 40, "green")).toBe(false);
    expect(isSymbolInkPixel(220, 38, 38, "green")).toBe(false);
    expect(isSymbolInkPixel(220, 38, 38, "red")).toBe(true);
  });

  it("outline with colorGroup ignores dark wall inside bbox", () => {
    const w = 100;
    const h = 100;
    const image = makeImageData(w, h, (x, y) => {
      const symbol = x >= 45 && x <= 55 && y >= 45 && y <= 55;
      const wall = y >= 38 && y <= 40 && x >= 30 && x <= 70;
      if (symbol) return [22, 163, 74, 255];
      if (wall) return [40, 40, 40, 255];
      return [252, 252, 252, 255];
    });
    const poly = extractSymbolOutlinePolygon(
      image,
      { minX: 30, minY: 36, maxX: 70, maxY: 58 },
      w,
      h,
      { sampleStep: 1, colorGroup: "green" }
    );
    expect(poly).not.toBeNull();
    // Hull must wrap only the green square, not the wall above it.
    const minY = Math.min(...poly!.map((p) => p.y)) * h;
    expect(minY).toBeGreaterThan(41);
  });

  it("outline excludes same-color text label near the symbol", () => {
    const w = 120;
    const h = 120;
    // Green symbol square + wide green "560"-like label above it (same color!).
    const image = makeImageData(w, h, (x, y) => {
      const symbol = x >= 50 && x <= 62 && y >= 60 && y <= 72;
      const textLabel = y >= 40 && y <= 48 && x >= 30 && x <= 90;
      if (symbol || textLabel) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });
    const poly = extractSymbolOutlinePolygon(
      image,
      { minX: 30, minY: 38, maxX: 92, maxY: 74 },
      w,
      h,
      { sampleStep: 1, colorGroup: "green" }
    );
    expect(poly).not.toBeNull();
    // Hull wraps only the symbol square, not the text run above.
    const minY = Math.min(...poly!.map((p) => p.y)) * h;
    const minX = Math.min(...poly!.map((p) => p.x)) * w;
    const maxX = Math.max(...poly!.map((p) => p.x)) * w;
    expect(minY).toBeGreaterThan(50);
    expect(minX).toBeGreaterThan(40);
    expect(maxX).toBeLessThan(70);
  });

  it("outline excludes same-color dimension line crossing the bbox", () => {
    const w = 120;
    const h = 120;
    const image = makeImageData(w, h, (x, y) => {
      const symbol = x >= 55 && x <= 66 && y >= 55 && y <= 66;
      const dimLine =
        y >= 59 && y <= 60 && ((x >= 10 && x <= 51) || (x >= 70 && x <= 110));
      if (symbol || dimLine) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });
    const poly = extractSymbolOutlinePolygon(
      image,
      { minX: 40, minY: 50, maxX: 80, maxY: 70 },
      w,
      h,
      { sampleStep: 1, colorGroup: "green" }
    );
    expect(poly).not.toBeNull();
    const minX = Math.min(...poly!.map((p) => p.x)) * w;
    const maxX = Math.max(...poly!.map((p) => p.x)) * w;
    // Line runs 10..110; symbol only 55..66 — hull must stay near the symbol.
    expect(minX).toBeGreaterThan(48);
    expect(maxX).toBeLessThan(74);
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
