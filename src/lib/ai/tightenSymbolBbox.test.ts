import { describe, expect, it } from "vitest";
import { tightenSymbolBboxFromCrop } from "./tightenSymbolBbox";
import type { EstimatorPositionBBox } from "@/types/estimatorPositions";

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

describe("tightenSymbolBboxFromCrop", () => {
  it("returns a smaller tight bbox for symbol-like pixels inside a large selection", () => {
    const pageWidth = 200;
    const pageHeight = 200;
    const rawBbox: EstimatorPositionBBox = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };

    const imageData = makeImageData(pageWidth, pageHeight, (x, y) => {
      const nx = x / pageWidth;
      const ny = y / pageHeight;
      const inSymbol =
        nx >= 0.24 && nx <= 0.28 && ny >= 0.25 && ny <= 0.29;
      if (inSymbol) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const result = tightenSymbolBboxFromCrop(imageData, rawBbox, {
      pageWidth,
      pageHeight,
    });

    expect(result.reliable).toBe(true);
    expect(result.tightBbox).not.toBeNull();
    expect(result.tightBbox!.width).toBeLessThan(rawBbox.width);
    expect(result.tightBbox!.height).toBeLessThan(rawBbox.height);
    expect(result.outsidePlan).toBe(false);
  });

  it("rectangle over symbol + wall tightens to colored symbol only", () => {
    const pageWidth = 200;
    const pageHeight = 200;
    // Rect covers a green socket AND a black wall line — wall must be ignored.
    const rawBbox: EstimatorPositionBBox = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const imageData = makeImageData(pageWidth, pageHeight, (x, y) => {
      const nx = x / pageWidth;
      const ny = y / pageHeight;
      const symbol = nx >= 0.3 && nx <= 0.34 && ny >= 0.3 && ny <= 0.34;
      const wall = ny >= 0.14 && ny <= 0.16 && nx >= 0.1 && nx <= 0.6;
      if (symbol) return [22, 163, 74, 255];
      if (wall) return [40, 40, 40, 255];
      return [252, 252, 252, 255];
    });

    const result = tightenSymbolBboxFromCrop(imageData, rawBbox, {
      pageWidth,
      pageHeight,
    });

    expect(result.reliable).toBe(true);
    expect(result.tightBbox).not.toBeNull();
    // Tight box wraps the green symbol only — not stretched up to the wall.
    expect(result.tightBbox!.y).toBeGreaterThan(0.25);
    expect(result.tightBbox!.width).toBeLessThan(0.1);
  });

  it("explicit colorGroup ignores other colored ink", () => {
    const pageWidth = 200;
    const pageHeight = 200;
    const rawBbox: EstimatorPositionBBox = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const imageData = makeImageData(pageWidth, pageHeight, (x, y) => {
      const nx = x / pageWidth;
      const ny = y / pageHeight;
      const green = nx >= 0.3 && nx <= 0.34 && ny >= 0.3 && ny <= 0.34;
      const orangeText = ny >= 0.18 && ny <= 0.21 && nx >= 0.12 && nx <= 0.5;
      if (green) return [22, 163, 74, 255];
      if (orangeText) return [234, 88, 12, 255];
      return [252, 252, 252, 255];
    });

    const result = tightenSymbolBboxFromCrop(imageData, rawBbox, {
      pageWidth,
      pageHeight,
      colorGroup: "green",
    });

    expect(result.reliable).toBe(true);
    expect(result.tightBbox!.y).toBeGreaterThan(0.25);
  });

  it("same-color text label inside the rect never widens the tight bbox", () => {
    const pageWidth = 200;
    const pageHeight = 200;
    const rawBbox: EstimatorPositionBBox = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    // Green socket + wide green dimension text — both the SAME color.
    const imageData = makeImageData(pageWidth, pageHeight, (x, y) => {
      const nx = x / pageWidth;
      const ny = y / pageHeight;
      const symbol = nx >= 0.3 && nx <= 0.35 && ny >= 0.32 && ny <= 0.37;
      const greenText = ny >= 0.15 && ny <= 0.185 && nx >= 0.12 && nx <= 0.5;
      if (symbol || greenText) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const result = tightenSymbolBboxFromCrop(imageData, rawBbox, {
      pageWidth,
      pageHeight,
    });

    expect(result.reliable).toBe(true);
    expect(result.tightBbox).not.toBeNull();
    // Box wraps only the symbol — the text row above stays out.
    expect(result.tightBbox!.y).toBeGreaterThan(0.25);
    expect(result.tightBbox!.width).toBeLessThan(0.12);
  });

  it("flags empty crop as needs review, not outside_plan", () => {
    const pageWidth = 100;
    const pageHeight = 100;
    const rawBbox: EstimatorPositionBBox = { x: 0.7, y: 0.7, width: 0.2, height: 0.2 };
    const imageData = makeImageData(pageWidth, pageHeight, () => [255, 255, 255, 255]);

    const result = tightenSymbolBboxFromCrop(imageData, rawBbox, {
      pageWidth,
      pageHeight,
    });

    expect(result.outsidePlan).toBe(false);
    expect(result.reliable).toBe(false);
    expect(result.needsReview).toBe(true);
    expect(result.tightBbox).toBeNull();
  });
});
