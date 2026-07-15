import { describe, expect, it } from "vitest";
import {
  categoryToColorPreference,
  estimatorCategoryToPickHint,
  isDenseSymbolClick,
  listNearbySymbolCandidates,
  pickOptionsForContext,
  pickSymbolFromClick,
} from "./pickSymbolFromClick";

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

describe("pickSymbolFromClick", () => {
  it("detects green socket pixels near click", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const near =
        Math.hypot(x - 100, y - 100) < 6 ||
        (x >= 96 && x <= 104 && y >= 108 && y <= 112);
      if (near) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    });

    expect(result.found).toBe(true);
    expect(result.tightSymbolBbox).not.toBeNull();
    expect(result.colorHint).toBe("green");
    expect(result.tightSymbolBbox!.width).toBeLessThan(0.15);
  });

  it("merges multi-component symbol parts into one bbox", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const partA = x >= 94 && x <= 98 && y >= 96 && y <= 104;
      const partB = x >= 102 && x <= 106 && y >= 96 && y <= 104;
      if (partA || partB) return [22, 163, 74, 255];
      return [255, 255, 255, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    });

    expect(result.found).toBe(true);
    expect(result.components.length).toBeGreaterThanOrEqual(1);
    const bbox = result.tightSymbolBbox!;
    expect(bbox.width).toBeGreaterThan(4 / w);
  });

  it("ignores long dimension line and returns found=false", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      if (y === 100 && x >= 40 && x <= 160) return [30, 30, 30, 255];
      return [255, 255, 255, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "unknown",
    });

    expect(result.found).toBe(false);
  });

  it("does not latch onto a far green blob below the click", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      // Far blob at bottom — must NOT win over empty click at center.
      if (x >= 90 && x <= 110 && y >= 180 && y <= 190) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    });

    expect(result.found).toBe(false);
  });

  it("picks only the nearest of three dense neighbouring symbols", () => {
    const w = 200;
    const h = 200;
    // Three separate green marks ~12px apart (typical dense plan spacing).
    const image = makeImageData(w, h, (x, y) => {
      const a = x >= 70 && x <= 78 && y >= 96 && y <= 104;
      const b = x >= 90 && x <= 98 && y >= 96 && y <= 104;
      const c = x >= 110 && x <= 118 && y >= 96 && y <= 104;
      if (a || b || c) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 94, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    });

    expect(result.found).toBe(true);
    const bbox = result.tightSymbolBbox!;
    // Must cover the middle mark only — not stretch across all three.
    expect(bbox.x).toBeGreaterThan(0.4);
    expect(bbox.x + bbox.width).toBeLessThan(0.55);
    expect(bbox.width).toBeLessThan(0.08);
    expect(result.components.length).toBe(1);
  });

  it("prefers green for socket category", () => {
    expect(categoryToColorPreference("socket")).toEqual(["green"]);
    expect(estimatorCategoryToPickHint("socket")).toBe("socket");
  });

  it("prefers red for switch category", () => {
    expect(categoryToColorPreference("switch")).toEqual(["red"]);
    expect(estimatorCategoryToPickHint("switch")).toBe("switch");
  });

  it("prefers orange for light category", () => {
    expect(categoryToColorPreference("light")).toEqual(["orange"]);
    expect(estimatorCategoryToPickHint("lighting")).toBe("light");
  });

  it("merges a double-socket pair into one mark", () => {
    const w = 200;
    const h = 200;
    // Two green circles ~14px apart — classic double socket, no third neighbour.
    const image = makeImageData(w, h, (x, y) => {
      const a = x >= 80 && x <= 88 && y >= 96 && y <= 104;
      const b = x >= 102 && x <= 110 && y >= 96 && y <= 104;
      if (a || b) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 94, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
      normalizedPoint: "double_socket_point",
      options: pickOptionsForContext("socket", "double_socket_point"),
    });

    expect(result.found).toBe(true);
    const bbox = result.tightSymbolBbox!;
    // One wide mark covering both halves.
    expect(bbox.x).toBeLessThan(0.42);
    expect(bbox.x + bbox.width).toBeGreaterThan(0.54);
    expect(bbox.width).toBeGreaterThan(0.12);

    const loupe = listNearbySymbolCandidates({
      imageData: image,
      clickCanvasPx: { x: 94, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
      normalizedPoint: "double_socket_point",
      options: pickOptionsForContext("socket", "double_socket_point"),
    });
    expect(loupe.length).toBe(1);
  });

  it("does not merge two adjacent peer-sized lights into one mark", () => {
    const w = 200;
    const h = 200;
    // Two orange lights ~10px apart — must stay separate.
    const image = makeImageData(w, h, (x, y) => {
      const a = x >= 80 && x <= 88 && y >= 96 && y <= 104;
      const b = x >= 98 && x <= 106 && y >= 96 && y <= 104;
      if (a || b) return [234, 88, 12, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 84, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "light",
      options: pickOptionsForContext("light"),
    });

    expect(result.found).toBe(true);
    const bbox = result.tightSymbolBbox!;
    expect(bbox.x + bbox.width).toBeLessThan(0.5);
    expect(bbox.width).toBeLessThan(0.08);

    const loupe = listNearbySymbolCandidates({
      imageData: image,
      clickCanvasPx: { x: 92, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "light",
      options: pickOptionsForContext("light"),
    });
    expect(loupe.length).toBe(2);
  });
});

describe("listNearbySymbolCandidates", () => {
  it("lists three separate dense neighbours for loupe pick", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const a = x >= 70 && x <= 78 && y >= 96 && y <= 104;
      const b = x >= 90 && x <= 98 && y >= 96 && y <= 104;
      const c = x >= 110 && x <= 118 && y >= 96 && y <= 104;
      if (a || b || c) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const input = {
      imageData: image,
      clickCanvasPx: { x: 94, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket" as const,
    };

    expect(isDenseSymbolClick(input)).toBe(true);
    const candidates = listNearbySymbolCandidates(input);
    expect(candidates.length).toBe(3);
    // Nearest (middle) first.
    expect(candidates[0]!.pixelBbox.minX).toBeGreaterThanOrEqual(90);
    expect(candidates[0]!.pixelBbox.maxX).toBeLessThanOrEqual(98);
    // Each candidate stays a single mark, not a merged span.
    for (const c of candidates) {
      expect(c.pixelBbox.maxX - c.pixelBbox.minX).toBeLessThan(12);
    }
  });

  it("returns a single candidate when only one symbol is near the click", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      if (x >= 96 && x <= 104 && y >= 96 && y <= 104) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });

    const candidates = listNearbySymbolCandidates({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    });

    expect(candidates.length).toBe(1);
    expect(isDenseSymbolClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    })).toBe(false);
  });
});
