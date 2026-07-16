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

  it("assembles colored cross + dark circle into the complete light symbol", () => {
    const w = 200;
    const h = 200;
    // Light fixture: orange X strokes inside a dark circle outline.
    const image = makeImageData(w, h, (x, y) => {
      const dx = x - 100;
      const dy = y - 100;
      const r = Math.hypot(dx, dy);
      const onCircle = r >= 10 && r <= 12;
      const onCross =
        r < 9 && (Math.abs(dx - dy) <= 1.2 || Math.abs(dx + dy) <= 1.2);
      if (onCross) return [234, 88, 12, 255];
      if (onCircle) return [40, 40, 40, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "light",
    });

    expect(result.found).toBe(true);
    const bbox = result.tightSymbolBbox!;
    // The whole circle (Ø ~24px) is in the mark, not only the cross (Ø ~18px).
    expect(bbox.width * w).toBeGreaterThanOrEqual(22);
    expect(bbox.height * h).toBeGreaterThanOrEqual(22);
    expect(result.colorHint).toBe("orange");
  });

  it("merges overlapping same-color peer parts (circle + inner cross)", () => {
    const w = 200;
    const h = 200;
    // Both parts orange but not touching: ring + cross inside it.
    const image = makeImageData(w, h, (x, y) => {
      const dx = x - 100;
      const dy = y - 100;
      const r = Math.hypot(dx, dy);
      const onCircle = r >= 10 && r <= 12;
      const onCross =
        r < 8 && (Math.abs(dx - dy) <= 1.2 || Math.abs(dx + dy) <= 1.2);
      if (onCircle || onCross) return [234, 88, 12, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "light",
    });

    expect(result.found).toBe(true);
    const bbox = result.tightSymbolBbox!;
    expect(bbox.width * w).toBeGreaterThanOrEqual(22);
  });

  it("does not absorb a dark wall line via overlap absorption", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const symbol = x >= 96 && x <= 106 && y >= 96 && y <= 106;
      const wall = y >= 100 && y <= 102 && x >= 40 && x <= 160;
      if (symbol) return [234, 88, 12, 255];
      if (wall && !symbol) return [40, 40, 40, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 101, y: 98 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "light",
    });

    expect(result.found).toBe(true);
    // Wall spans 40..160 — the mark must stay around the 10px symbol.
    expect(result.tightSymbolBbox!.width * w).toBeLessThan(30);
  });

  it("lists dark strokes as part-only assembly candidates", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const orange = x >= 96 && x <= 104 && y >= 96 && y <= 104;
      const darkPart = x >= 96 && x <= 104 && y >= 112 && y <= 120;
      if (orange) return [234, 88, 12, 255];
      if (darkPart) return [40, 40, 40, 255];
      return [252, 252, 252, 255];
    });

    const candidates = listNearbySymbolCandidates({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "light",
    });

    const full = candidates.filter((c) => !c.partOnly);
    const parts = candidates.filter((c) => c.partOnly);
    expect(full.length).toBe(1);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    // Part-only candidates never trigger the dense-plan loupe by themselves.
    expect(
      isDenseSymbolClick({
        imageData: image,
        clickCanvasPx: { x: 100, y: 100 },
        pageWidth: w,
        pageHeight: h,
        categoryHint: "light",
      })
    ).toBe(false);
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

  it("green socket click ignores green text label", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const socket = x >= 96 && x <= 104 && y >= 96 && y <= 104;
      // Wide short green label next to the socket (plan text).
      const label = y >= 88 && y <= 94 && x >= 70 && x <= 150;
      if (socket || label) return [22, 163, 74, 255];
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
    expect(result.symbolMaskBbox).not.toBeNull();
    expect(result.tightSymbolBbox!.width).toBeLessThan(0.1);
    expect(result.tightSymbolBbox!.height).toBeLessThan(0.1);
    expect(result.rejectedComponents.some((r) => r.reason === "text_like")).toBe(true);
    // Display bbox must be tight symbol — not the debug search window.
    expect(result.tightSymbolBbox!.width).toBeLessThan(result.rawSearchBbox.width * 0.5);
  });

  it("red switch click ignores black wall", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const sw = x >= 96 && x <= 104 && y >= 96 && y <= 104;
      const wall = x >= 40 && x <= 160 && y >= 110 && y <= 112;
      if (sw) return [220, 38, 38, 255];
      if (wall) return [40, 40, 40, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "switch",
    });

    expect(result.found).toBe(true);
    expect(result.colorHint).toBe("red");
    expect(result.tightSymbolBbox!.width).toBeLessThan(0.1);
    expect(result.tightSymbolBbox!.height).toBeLessThan(0.1);
  });

  it("orange light click ignores blue dimensions", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const light = x >= 96 && x <= 104 && y >= 96 && y <= 104;
      const dimLine = y === 90 && x >= 50 && x <= 150;
      const dimText = x >= 60 && x <= 90 && y >= 84 && y <= 88;
      if (light) return [234, 88, 12, 255];
      if (dimLine || dimText) return [37, 99, 235, 255];
      return [252, 252, 252, 255];
    });

    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "light",
      options: pickOptionsForContext("light"),
    });

    expect(result.found).toBe(true);
    expect(result.colorHint).toBe("orange");
    expect(result.tightSymbolBbox!.width).toBeLessThan(0.1);
    expect(result.reason).toBe("symbol_mask");
  });

  it("rejects long line and wall-like components", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      if (y === 100 && x >= 20 && x <= 180) return [35, 35, 35, 255];
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
    expect(result.tightSymbolBbox).toBeNull();
    expect(
      result.rejectedComponents.some(
        (r) =>
          r.reason === "long_line" ||
          r.reason === "wall_like" ||
          r.reason === "dimension_like"
      )
    ).toBe(true);
  });

  it("rejects text-like green component alone", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      if (y >= 96 && y <= 102 && x >= 40 && x <= 160) return [22, 163, 74, 255];
      return [255, 255, 255, 255];
    });
    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 99 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    });
    expect(result.found).toBe(false);
    expect(result.rejectedComponents.some((r) => r.reason === "text_like")).toBe(true);
  });

  it("composite symbol merges valid parts only (not text)", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const partA = x >= 94 && x <= 98 && y >= 96 && y <= 104;
      const partB = x >= 100 && x <= 104 && y >= 96 && y <= 104;
      const label = y >= 84 && y <= 90 && x >= 60 && x <= 150;
      if (partA || partB || label) return [22, 163, 74, 255];
      return [255, 255, 255, 255];
    });
    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 99, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
    });
    expect(result.found).toBe(true);
    expect(result.tightSymbolBbox!.width).toBeLessThan(0.12);
    expect(result.rejectedComponents.some((r) => r.reason === "text_like")).toBe(true);
  });

  it("stacked double socket suggests double_socket_point with needsReview", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const a = x >= 96 && x <= 104 && y >= 88 && y <= 96;
      const b = x >= 96 && x <= 104 && y >= 104 && y <= 112;
      if (a || b) return [22, 163, 74, 255];
      return [252, 252, 252, 255];
    });
    const result = pickSymbolFromClick({
      imageData: image,
      clickCanvasPx: { x: 100, y: 100 },
      pageWidth: w,
      pageHeight: h,
      categoryHint: "socket",
      options: pickOptionsForContext("socket"),
    });
    expect(result.found).toBe(true);
    expect(result.suggestedNormalizedPoint).toBe("double_socket_point");
    expect(result.needsReview).toBe(true);
    expect(result.tightSymbolBbox!.height).toBeGreaterThan(0.1);
  });

  it("rawSearchBbox is not used as tight/display marker", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      if (x >= 96 && x <= 104 && y >= 96 && y <= 104) return [22, 163, 74, 255];
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
    expect(result.symbolMaskBbox).not.toBeNull();
    expect(result.tightSymbolBbox).not.toBeNull();
    expect(result.rawSearchBbox.width).toBeGreaterThan(result.tightSymbolBbox!.width);
    expect(result.rawSearchBbox.height).toBeGreaterThan(result.tightSymbolBbox!.height);
    expect(result.tightSymbolBbox).not.toEqual(result.rawSearchBbox);
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

  it("omits green text labels from loupe candidates", () => {
    const w = 200;
    const h = 200;
    const image = makeImageData(w, h, (x, y) => {
      const socket = x >= 96 && x <= 104 && y >= 96 && y <= 104;
      const label = y >= 88 && y <= 94 && x >= 70 && x <= 150;
      if (socket || label) return [22, 163, 74, 255];
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
    expect(candidates[0]!.pixelBbox.maxX - candidates[0]!.pixelBbox.minX).toBeLessThan(20);
  });
});
