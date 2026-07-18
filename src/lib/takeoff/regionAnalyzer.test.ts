import { describe, expect, it } from "vitest";
import {
  analyzeRegionRaster,
  assessPlanQualityFromRaster,
  bboxPdfToNormalizedRect,
  countMaskPixels,
  deriveAnalyzeNotice,
  deriveEmptyReason,
  ensureMinimumAnalyzeRegion,
  MIN_ANALYZE_REGION_SIZE,
  normalizedRectToBBoxPdf,
} from "./regionAnalyzer";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import { normalizedToScreenRect, pointToNormalizedRect } from "./drawingTakeoff";

function solidRaster(
  width: number,
  height: number,
  fill: [number, number, number]
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    data[o] = fill[0];
    data[o + 1] = fill[1];
    data[o + 2] = fill[2];
    data[o + 3] = 255;
  }
  return { width, height, data };
}

/** Paint a filled colored square onto a white canvas. */
function paintSquare(
  img: RasterImage,
  x: number,
  y: number,
  size: number,
  rgb: [number, number, number]
) {
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
      const o = (py * img.width + px) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 255;
    }
  }
}

describe("regionAnalyzer coordinates", () => {
  it("round-trips normalized ↔ PDF bbox", () => {
    const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const bbox = normalizedRectToBBoxPdf(rect, 1000, 800);
    expect(bbox[0]).toBeCloseTo(100);
    expect(bbox[1]).toBeCloseTo(160);
    expect(bbox[2]).toBeCloseTo(400);
    expect(bbox[3]).toBeCloseTo(480);
    const back = bboxPdfToNormalizedRect(bbox, 1000, 800);
    expect(back.x).toBeCloseTo(0.1);
    expect(back.y).toBeCloseTo(0.2);
    expect(back.width).toBeCloseTo(0.3);
    expect(back.height).toBeCloseTo(0.4);
  });

  it("maps a PDF bbox to the rendered canvas (overlay) bbox", () => {
    // A4 landscape page in PDF points, rendered at 1190x842 CSS px.
    const pageWidthPt = 841.89;
    const pageHeightPt = 595.28;
    const canvas = { width: 1190, height: 842 };
    const bboxPdf: [number, number, number, number] = [84.189, 119.056, 168.378, 178.584];

    const normalized = bboxPdfToNormalizedRect(bboxPdf, pageWidthPt, pageHeightPt);
    expect(normalized.x).toBeCloseTo(0.1);
    expect(normalized.y).toBeCloseTo(0.2);

    const rendered = normalizedToScreenRect(normalized, canvas);
    expect(rendered.x).toBeCloseTo(0.1 * 1190);
    expect(rendered.y).toBeCloseTo(0.2 * 842);
    expect(rendered.width).toBeCloseTo(0.1 * 1190);
    expect(rendered.height).toBeCloseTo(0.1 * 842);
  });
});

describe("assessPlanQualityFromRaster", () => {
  it("marks mostly white drawing as vector/hybrid", () => {
    const img = solidRaster(200, 200, [250, 250, 250]);
    paintSquare(img, 20, 20, 8, [220, 40, 40]);
    const q = assessPlanQualityFromRaster(img);
    expect(["vector", "hybrid"]).toContain(q.detectedPlanType);
  });
});

describe("analyzeRegionRaster", () => {
  it("returns multiple color-layer candidates inside one region", () => {
    const pageW = 400;
    const pageH = 300;
    const region = solidRaster(200, 150, [252, 252, 252]);
    // Green / red / orange blobs (symbol-sized).
    paintSquare(region, 20, 30, 14, [40, 180, 60]);
    paintSquare(region, 80, 40, 12, [210, 30, 30]);
    paintSquare(region, 140, 70, 16, [230, 140, 20]);
    // Elongated orange line — should be ignored by aspect filter.
    paintSquare(region, 10, 120, 4, [230, 140, 20]);
    for (let x = 10; x < 180; x++) {
      paintSquare(region, x, 120, 3, [230, 140, 20]);
    }

    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [50, 40, 200, 150],
      pageWidthPx: pageW,
      pageHeightPx: pageH,
      pageWidthPt: 841.89,
      pageHeightPt: 595.28,
      regionIdPrefix: "cand_test",
    });

    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.summary.needs_review).toBe(result.candidates.length);
    expect(result.candidates.every((c) => c.kind === "symbol_candidate")).toBe(true);
    expect(result.candidates.every((c) => c.source === "opencv")).toBe(true);
    // Page-normalized boxes must sit inside the region placement.
    for (const c of result.candidates) {
      expect(c.normalized_position.x).toBeGreaterThanOrEqual(50 / pageW - 0.01);
      expect(c.normalized_position.y).toBeGreaterThanOrEqual(40 / pageH - 0.01);
      expect(c.page_number).toBe(1);
    }
    const layers = new Set(result.candidates.map((c) => c.color_layer));
    expect(layers.size).toBeGreaterThanOrEqual(2);
  });

  it("does not invent quote quantities (candidates stay unconfirmed)", () => {
    const region = solidRaster(100, 100, [255, 255, 255]);
    paintSquare(region, 30, 30, 18, [40, 180, 60]);
    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 2,
      profession: "electrical",
      regionBboxPx: [0, 0, 100, 100],
      pageWidthPx: 100,
      pageHeightPx: 100,
    });
    expect(result.candidates.every((c) => c.status !== "confirmed")).toBe(true);
    // Only review statuses may exist — never anything that changes quantities.
    expect(
      result.candidates.every((c) => c.status === "candidate" || c.status === "probable")
    ).toBe(true);
  });

  it("blank region → 0 candidates with emptyReason no_color_pixels", () => {
    const region = solidRaster(200, 200, [252, 252, 252]);
    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 200, 200],
      pageWidthPx: 200,
      pageHeightPx: 200,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.debug.emptyReason).toBe("no_color_pixels");
    expect(result.debug.maskPixelCounts.green).toBe(0);
    expect(result.debug.maskPixelCounts.red).toBe(0);
    expect(result.debug.maskPixelCounts.orange).toBe(0);
  });

  it("keeps close/overlapping red and green candidates separate (different color layers never merge)", () => {
    const region = solidRaster(200, 150, [252, 252, 252]);
    // Adjacent red switch + green socket, close together but not the same color.
    paintSquare(region, 60, 60, 12, [210, 30, 30]);
    paintSquare(region, 78, 60, 12, [40, 180, 60]);

    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 200, 150],
      pageWidthPx: 200,
      pageHeightPx: 150,
    });

    const red = result.candidates.filter((c) => c.color_layer === "red");
    const green = result.candidates.filter((c) => c.color_layer === "green");
    expect(red).toHaveLength(1);
    expect(green).toHaveLength(1);
  });

  it("two visually similar green symbols in the same region are both returned", () => {
    const region = solidRaster(200, 150, [252, 252, 252]);
    paintSquare(region, 20, 20, 14, [40, 180, 60]);
    paintSquare(region, 120, 90, 14, [40, 180, 60]);

    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 200, 150],
      pageWidthPx: 200,
      pageHeightPx: 150,
    });

    const green = result.candidates.filter((c) => c.color_layer === "green");
    expect(green).toHaveLength(2);
  });

  it("a long orange line becomes a led_strip candidate instead of being discarded", () => {
    const region = solidRaster(300, 200, [252, 252, 252]);
    // Long enough to be elongated (aspect > 5.5) but short enough to stay
    // under the region's maxDim size gate (so it fails on aspect, not size).
    for (let x = 10; x < 75; x++) {
      paintSquare(region, x, 100, 3, [230, 140, 20]);
    }

    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 300, 200],
      pageWidthPx: 300,
      pageHeightPx: 200,
    });

    const ledCandidates = result.candidates.filter(
      (c) => c.color_layer === "orange" && c.label_suggestions.some((l) => l.label.includes("LED"))
    );
    expect(ledCandidates.length).toBeGreaterThanOrEqual(1);
    expect(ledCandidates[0]!.kind).toBe("symbol_candidate");
    expect(ledCandidates[0]!.status === "candidate" || ledCandidates[0]!.status === "probable").toBe(
      true
    );
    // A long blue "dimension" line stays ignored, never becomes a candidate
    // (blue ink is never classified as a symbol color by the detector).
    const blueRegion = solidRaster(300, 200, [252, 252, 252]);
    for (let x = 10; x < 75; x++) {
      paintSquare(blueRegion, x, 100, 3, [40, 80, 220]);
    }
    const blueResult = analyzeRegionRaster({
      regionRaster: blueRegion,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 300, 200],
      pageWidthPx: 300,
      pageHeightPx: 200,
    });
    expect(blueResult.candidates).toHaveLength(0);
  });

  it("a green text-like cluster (many small separate blobs) is likely_text, not a symbol", () => {
    const region = solidRaster(200, 100, [252, 252, 252]);
    // Simulate a short run of green "letters": 4 small blobs close enough
    // (2px gaps) for the main detector's merge step to treat them as ONE
    // blob, but a zero-gap flood fill still sees 4 separate ink groups —
    // that gap pattern is exactly what real text looks like vs. one symbol.
    for (const x of [20, 28, 36, 44]) {
      paintSquare(region, x, 40, 6, [40, 180, 60]);
    }
    // A real single-blob green socket elsewhere in the same region.
    paintSquare(region, 140, 40, 14, [40, 180, 60]);

    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 200, 100],
      pageWidthPx: 200,
      pageHeightPx: 100,
    });

    // The text-like cluster must not appear as a symbol_candidate...
    const textLikeDebug = result.debug.detectionsBeforeFilter.find(
      (d) => d.rejectReason === "likely_text"
    );
    expect(textLikeDebug).toBeDefined();
    // ...while the real socket is still detected as a candidate.
    expect(result.candidates.some((c) => c.color_layer === "green")).toBe(true);
  });

  it("per-candidate debug rows carry source, filtersPassed, bboxPx and bboxPdf", () => {
    const region = solidRaster(200, 150, [252, 252, 252]);
    paintSquare(region, 20, 20, 14, [40, 180, 60]);
    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 3,
      profession: "electrical",
      regionBboxPx: [50, 40, 200, 150],
      pageWidthPx: 400,
      pageHeightPx: 300,
      pageWidthPt: 841.89,
      pageHeightPt: 595.28,
    });
    const kept = result.debug.detectionsBeforeFilter.filter((d) => d.rejectReason === null);
    expect(kept.length).toBeGreaterThanOrEqual(1);
    for (const d of kept) {
      expect(d.source).toBe("opencv");
      expect(Array.isArray(d.filtersPassed)).toBe(true);
      expect(d.filtersPassed.length).toBeGreaterThan(0);
      expect(d.bboxPx).toHaveLength(4);
      expect(d.bboxPdf).toHaveLength(4);
    }
  });

  it("a sparse wall-corner-like ink patch does not become a false symbol candidate", () => {
    const region = solidRaster(200, 150, [252, 252, 252]);
    // 4-connected diagonal staircase — compact bbox (aspect ≈ 1, so the
    // line_like filter never sees it) but low ink density, the way a wall
    // corner's crossing hatch strokes look once merged into one bbox.
    let x = 20;
    let y = 20;
    paintSquare(region, x, y, 1, [230, 140, 20]);
    for (let i = 0; i < 25; i++) {
      x += 1;
      paintSquare(region, x, y, 1, [230, 140, 20]);
      y += 1;
      paintSquare(region, x, y, 1, [230, 140, 20]);
    }
    // A real, dense orange light symbol elsewhere in the same region.
    paintSquare(region, 140, 90, 14, [230, 140, 20]);

    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 200, 150],
      pageWidthPx: 200,
      pageHeightPx: 150,
    });

    // Only the real dense symbol becomes a candidate — the sparse patch does not.
    expect(result.candidates.filter((c) => c.color_layer === "orange")).toHaveLength(1);
    expect(
      result.debug.detectionsBeforeFilter.some((d) => d.rejectReason === "low_density")
    ).toBe(true);
  });

  it("a thick orange band (merged wall-hatch strokes) is not promoted to a false LED strip", () => {
    const region = solidRaster(300, 200, [252, 252, 252]);
    // Same aspect-ratio ballpark as the genuine LED-strip test (elongated
    // enough to be rejected as line_like) but much thicker (short dim well
    // above the thinness gate) — a wall-hatch band, not a thin drawn line.
    for (let x = 10; x < 69; x++) {
      paintSquare(region, x, 90, 12, [230, 140, 20]);
    }

    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 300, 200],
      pageWidthPx: 300,
      pageHeightPx: 200,
    });

    expect(result.candidates.filter((c) => c.color_layer === "orange")).toHaveLength(0);
    expect(
      result.debug.detectionsBeforeFilter.some(
        (d) => d.colorLayer === "orange" && d.rejectReason === "line_like"
      )
    ).toBe(true);
  });

  it("colored ink below minimum size → emptyReason too_small", () => {
    const region = solidRaster(300, 300, [255, 255, 255]);
    // Scattered 2×2 green specks: colored pixels exist, but every component
    // is below the ~4px minimum symbol size.
    for (const [x, y] of [[20, 20], [80, 90], [150, 40], [220, 200], [50, 250], [260, 120]]) {
      paintSquare(region, x!, y!, 2, [40, 180, 60]);
    }
    const result = analyzeRegionRaster({
      regionRaster: region,
      pageNumber: 1,
      profession: "electrical",
      regionBboxPx: [0, 0, 300, 300],
      pageWidthPx: 300,
      pageHeightPx: 300,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.debug.maskPixelCounts.green).toBeGreaterThanOrEqual(10);
    expect(result.debug.emptyReason).toBe("too_small");
  });
});

describe("ensureMinimumAnalyzeRegion (auto-expand small selections)", () => {
  it("expands a tight rect to the minimum size around its center", () => {
    const tight = { x: 0.495, y: 0.495, width: 0.01, height: 0.01 };
    const { rect, autoExpanded } = ensureMinimumAnalyzeRegion(tight);
    expect(autoExpanded).toBe(true);
    expect(rect.width).toBeCloseTo(MIN_ANALYZE_REGION_SIZE);
    expect(rect.height).toBeCloseTo(MIN_ANALYZE_REGION_SIZE);
    // Center preserved.
    expect(rect.x + rect.width / 2).toBeCloseTo(0.5);
    expect(rect.y + rect.height / 2).toBeCloseTo(0.5);
  });

  it("expands a zero-size point (click) selection", () => {
    const point = { x: 0.3, y: 0.7, width: 0, height: 0 };
    const { rect, autoExpanded } = ensureMinimumAnalyzeRegion(point);
    expect(autoExpanded).toBe(true);
    expect(rect.width).toBeCloseTo(MIN_ANALYZE_REGION_SIZE);
    expect(rect.height).toBeCloseTo(MIN_ANALYZE_REGION_SIZE);
    expect(rect.x + rect.width / 2).toBeCloseTo(0.3);
    expect(rect.y + rect.height / 2).toBeCloseTo(0.7);
  });

  it("clamps the expanded rect inside the page near a corner", () => {
    const corner = { x: 0.99, y: 0.995, width: 0.005, height: 0.004 };
    const { rect, autoExpanded } = ensureMinimumAnalyzeRegion(corner);
    expect(autoExpanded).toBe(true);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1);
    expect(rect.width).toBeCloseTo(MIN_ANALYZE_REGION_SIZE);
    expect(rect.height).toBeCloseTo(MIN_ANALYZE_REGION_SIZE);
  });

  it("expands only the too-small axis", () => {
    const wide = { x: 0.1, y: 0.4, width: 0.4, height: 0.01 };
    const { rect, autoExpanded } = ensureMinimumAnalyzeRegion(wide);
    expect(autoExpanded).toBe(true);
    expect(rect.width).toBeCloseTo(0.4);
    expect(rect.height).toBeCloseTo(MIN_ANALYZE_REGION_SIZE);
  });

  it("leaves large-enough selections untouched", () => {
    const big = { x: 0.2, y: 0.2, width: 0.3, height: 0.25 };
    const { rect, autoExpanded } = ensureMinimumAnalyzeRegion(big);
    expect(autoExpanded).toBe(false);
    expect(rect).toEqual(big);
  });

  it("tiny analyze drag (a click) never silently disappears", () => {
    // The viewer converts a sub-6px drag into a point marker rect; the analyze
    // service then expands it — so the pipeline always has a usable region.
    const canvas = { width: 1190, height: 842 };
    const clickRect = pointToNormalizedRect({ x: 600, y: 400 }, canvas);
    const { rect, autoExpanded } = ensureMinimumAnalyzeRegion(clickRect);
    expect(autoExpanded).toBe(true);
    expect(rect.width).toBeGreaterThanOrEqual(MIN_ANALYZE_REGION_SIZE - 1e-9);
    expect(rect.height).toBeGreaterThanOrEqual(MIN_ANALYZE_REGION_SIZE - 1e-9);
    // Expanded around the clicked point.
    expect(rect.x + rect.width / 2).toBeCloseTo(600 / 1190, 2);
    expect(rect.y + rect.height / 2).toBeCloseTo(400 / 842, 2);
  });
});

describe("deriveAnalyzeNotice (visible feedback is mandatory)", () => {
  it("0 candidates always produces a visible notice", () => {
    expect(deriveAnalyzeNotice({ candidateCount: 0, autoExpanded: false })).toBe("empty");
    expect(deriveAnalyzeNotice({ candidateCount: 0, autoExpanded: true })).toBe(
      "expanded_empty"
    );
  });

  it("auto-expanded successful analysis explains the expansion", () => {
    expect(deriveAnalyzeNotice({ candidateCount: 3, autoExpanded: true })).toBe("expanded");
  });

  it("normal successful analysis needs no notice", () => {
    expect(deriveAnalyzeNotice({ candidateCount: 3, autoExpanded: false })).toBeNull();
  });
});

describe("deriveEmptyReason / countMaskPixels", () => {
  const noPixels = { green: 0, red: 0, orange: 0, blue: 0, sampledPixels: 100 };
  const somePixels = { green: 40, red: 0, orange: 0, blue: 5, sampledPixels: 100 };

  it("classifies the four empty reasons", () => {
    expect(
      deriveEmptyReason({ candidateCount: 0, detectionCount: 0, maskPixelCounts: noPixels })
    ).toBe("no_color_pixels");
    expect(
      deriveEmptyReason({ candidateCount: 0, detectionCount: 2, maskPixelCounts: somePixels })
    ).toBe("filtered_all");
    expect(
      deriveEmptyReason({ candidateCount: 0, detectionCount: 0, maskPixelCounts: somePixels })
    ).toBe("too_small");
    expect(
      deriveEmptyReason({ candidateCount: 3, detectionCount: 5, maskPixelCounts: somePixels })
    ).toBeNull();
  });

  it("counts colored pixels per detector color class", () => {
    const img = solidRaster(50, 50, [255, 255, 255]);
    paintSquare(img, 5, 5, 10, [40, 180, 60]); // green 100 px
    paintSquare(img, 25, 25, 6, [40, 80, 220]); // blue 36 px
    const counts = countMaskPixels(img);
    expect(counts.green).toBe(100);
    expect(counts.blue).toBe(36);
    expect(counts.red).toBe(0);
    expect(counts.orange).toBe(0);
  });
});
