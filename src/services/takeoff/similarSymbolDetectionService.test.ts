import { describe, expect, it } from "vitest";
import {
  colorInkMask,
  cropRaster,
  dominantSymbolColor,
  downscaleRaster,
  expandBboxToFullInkComponent,
  matchPageByComponents,
  prepareComponentReference,
  resampleMaskToGrid,
  splitMergedInkBlob,
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

/** Asymmetric "flag" shape: a full-height vertical stem + a short horizontal
 *  arm only at the TOP — very different when rotated 90°, unlike a
 *  near-symmetric socket arc, so it actually exercises rotation matching. */
function drawHookFlag(set: (x: number, y: number, c: Rgb) => void, ox: number, oy: number, c: Rgb) {
  for (let y = 0; y < 12; y++) {
    set(ox + 5, oy + y, c);
    set(ox + 6, oy + y, c);
  }
  for (let x = 0; x < 10; x++) {
    set(ox + x, oy, c);
    set(ox + x, oy + 1, c);
  }
}

/** Rotate an RGBA crop 90° (test-only — a real symbol rotated to face a different wall). */
function rotateRasterCrop90(crop: RasterImage): RasterImage {
  const { width: w, height: h, data } = crop;
  const outW = h;
  const outH = w;
  const out = new Uint8ClampedArray(outW * outH * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const so = (y * w + x) * 4;
      const nx = h - 1 - y;
      const ny = x;
      const no = (ny * outW + nx) * 4;
      out[no] = data[so]!;
      out[no + 1] = data[so + 1]!;
      out[no + 2] = data[so + 2]!;
      out[no + 3] = 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

/** Paste a crop onto a page raster at (ox, oy) — test-only compositing helper. */
function blitRaster(page: RasterImage, crop: RasterImage, ox: number, oy: number): void {
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= page.width || py >= page.height) continue;
      const so = (y * crop.width + x) * 4;
      const doff = (py * page.width + px) * 4;
      page.data[doff] = crop.data[so]!;
      page.data[doff + 1] = crop.data[so + 1]!;
      page.data[doff + 2] = crop.data[so + 2]!;
    }
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

  it("finds the SAME symbol installed rotated 90° (e.g. mounted on a different wall)", () => {
    const page = makeColorRaster(200, 150, (set) => drawHookFlag(set, 10, 10, GREEN));
    const refCrop = cropRaster(page, { x: 8, y: 8, width: 12, height: 16 });
    const rotated = rotateRasterCrop90(refCrop);
    blitRaster(page, rotated, 100, 60);

    const refBbox = { x: 8 / 200, y: 8 / 150, width: 12 / 200, height: 16 / 150 };
    const ref = prepareComponentReference(page, refBbox)!;
    expect(ref).not.toBeNull();

    const hits = matchPageByComponents({
      pageRaster: page,
      refShape: ref.refShape,
      refPxW: ref.refPxW,
      refPxH: ref.refPxH,
      color: ref.color,
      pageNumber: 1,
      excludeRefPx: ref.refPx,
    });

    const nearRotated = hits.find(
      (h) => h.normalizedPosition.x * 200 > 90 && h.normalizedPosition.x * 200 < 140
    );
    expect(nearRotated).toBeDefined();
    expect(nearRotated!.matchScore).toBeGreaterThanOrEqual(0.5);
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

// ---------------------------------------------------------------------------
// splitMergedInkBlob — recovering touching/overlapping instances of the
// same symbol that connected-component analysis merged into one blob.
// ---------------------------------------------------------------------------

describe("splitMergedInkBlob", () => {
  it("recovers two reference-sized instances from a blob twice as wide", () => {
    const refMask = new Uint8Array(12 * 12).fill(1);
    const blobMask = new Uint8Array(24 * 12).fill(1); // two 12x12 squares touching, 0px gap
    const hits = splitMergedInkBlob({
      blobMask,
      blobWidth: 24,
      blobHeight: 12,
      refMask,
      refWidth: 12,
      refHeight: 12,
    });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (const h of hits) expect(h.score).toBeGreaterThanOrEqual(0.55);
  });

  it("returns a single hit when the blob is only reference-sized", () => {
    const refMask = new Uint8Array(12 * 12).fill(1);
    const hits = splitMergedInkBlob({
      blobMask: refMask,
      blobWidth: 12,
      blobHeight: 12,
      refMask,
      refWidth: 12,
      refHeight: 12,
    });
    expect(hits.length).toBe(1);
  });

  it("finds nothing when the reference shape does not appear in the blob", () => {
    const refMask = new Uint8Array(12 * 12).fill(1); // solid square
    const blobMask = new Uint8Array(12 * 12); // empty — no ink at all
    const hits = splitMergedInkBlob({
      blobMask,
      blobWidth: 12,
      blobHeight: 12,
      refMask,
      refWidth: 12,
      refHeight: 12,
    });
    expect(hits.length).toBe(0);
  });
});

describe("matchPageByComponents recovers touching/overlapping merged symbols", () => {
  it("misses a touching pair without refInkMask, recovers both instances with it", () => {
    const page = makeColorRaster(200, 60, (set) => {
      drawSquare(set, 10, 10, RED); // reference
      drawSquare(set, 100, 20, RED); // touching pair — merges into one blob
      drawSquare(set, 112, 20, RED); // (0px gap from the previous square)
    });
    const refBbox = { x: 10 / 200, y: 10 / 60, width: 12 / 200, height: 12 / 60 };
    const ref = prepareComponentReference(page, refBbox)!;
    expect(ref).not.toBeNull();

    const withoutSplit = matchPageByComponents({
      pageRaster: page,
      refShape: ref.refShape,
      refPxW: ref.refPxW,
      refPxH: ref.refPxH,
      color: ref.color,
      pageNumber: 1,
      excludeRefPx: ref.refPx,
    });
    const missedPair = withoutSplit.filter((h) => h.normalizedPosition.x * 200 > 90);
    expect(missedPair.length).toBe(0);

    const withSplit = matchPageByComponents({
      pageRaster: page,
      refShape: ref.refShape,
      refInkMask: ref.refInkMask,
      refPxW: ref.refPxW,
      refPxH: ref.refPxH,
      color: ref.color,
      pageNumber: 1,
      excludeRefPx: ref.refPx,
    });
    const recoveredPair = withSplit.filter((h) => h.normalizedPosition.x * 200 > 90);
    expect(recoveredPair.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// expandBboxToFullInkComponent — "clicked only part of the symbol"
// ---------------------------------------------------------------------------

/** Wide elongated blob (like a drawn LED-strip icon), NOT a compact square. */
function drawStrip(
  set: (x: number, y: number, c: Rgb) => void,
  ox: number,
  oy: number,
  width: number,
  c: Rgb
) {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < width; x++) set(ox + x, oy + y, c);
  }
}

describe("expandBboxToFullInkComponent", () => {
  it("snaps a fragment bbox (only the left tip) to the full elongated blob", () => {
    const page = makeColorRaster(200, 40, (set) => drawStrip(set, 10, 10, 70, GREEN));
    // Reference only covers the first 10px of a 70px-wide strip — exactly
    // what a fixed ~22px manual point-click box would capture.
    const fragment = { x: 10, y: 10, width: 10, height: 8 };
    const expanded = expandBboxToFullInkComponent(page, fragment);

    expect(expanded.width).toBeGreaterThan(fragment.width * 2);
    expect(expanded.width).toBeCloseTo(70, -1);
    expect(expanded.height).toBeCloseTo(8, 0);
  });

  it("leaves the bbox unchanged when it already fully contains a compact symbol", () => {
    const page = makeColorRaster(60, 60, (set) => drawSocket(set, 20, 20, RED));
    const full = { x: 19, y: 19, width: 14, height: 14 };
    const expanded = expandBboxToFullInkComponent(page, full);

    // Same blob, already fully covered — expansion must not blow it up
    // further or drift to a different blob.
    expect(expanded.width).toBeLessThanOrEqual(full.width + 4);
    expect(expanded.height).toBeLessThanOrEqual(full.height + 4);
  });

  it("falls back to the original bbox when no colored ink is nearby", () => {
    const page = makeColorRaster(100, 100, () => undefined); // blank page
    const isolated = { x: 40, y: 40, width: 10, height: 10 };
    const expanded = expandBboxToFullInkComponent(page, isolated);

    expect(expanded).toEqual(isolated);
  });

  it("regression: fragment reference misses a full-size match; expanded reference finds it", () => {
    const page = makeColorRaster(300, 40, (set) => {
      drawStrip(set, 10, 10, 70, GREEN); // reference strip (only its tip gets clicked)
      drawStrip(set, 150, 10, 70, GREEN); // identical strip elsewhere on the page
    });
    const fragment = { x: 10, y: 10, width: 10, height: 8 };

    // Before the fix: matching directly against the fragment's own tiny
    // component reference fails the size gate against the full-size strip.
    const fragmentRef = prepareComponentReference(page, {
      x: fragment.x / page.width,
      y: fragment.y / page.height,
      width: fragment.width / page.width,
      height: fragment.height / page.height,
    })!;
    const missedHits = matchPageByComponents({
      pageRaster: page,
      refShape: fragmentRef.refShape,
      refPxW: fragmentRef.refPxW,
      refPxH: fragmentRef.refPxH,
      color: fragmentRef.color,
      pageNumber: 1,
      excludeRefPx: fragmentRef.refPx,
    });
    expect(missedHits.length).toBe(0);

    // After the fix: snap the fragment to the full strip first.
    const expandedPx = expandBboxToFullInkComponent(page, fragment);
    const expandedRef = prepareComponentReference(page, {
      x: expandedPx.x / page.width,
      y: expandedPx.y / page.height,
      width: expandedPx.width / page.width,
      height: expandedPx.height / page.height,
    })!;
    const foundHits = matchPageByComponents({
      pageRaster: page,
      refShape: expandedRef.refShape,
      refPxW: expandedRef.refPxW,
      refPxH: expandedRef.refPxH,
      color: expandedRef.color,
      pageNumber: 1,
      excludeRefPx: expandedRef.refPx,
    });
    expect(foundHits.length).toBe(1);
    expect(foundHits[0]!.matchScore).toBeGreaterThanOrEqual(0.9);
  });
});
