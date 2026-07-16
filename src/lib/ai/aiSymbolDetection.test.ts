import { describe, expect, it } from "vitest";
import {
  bboxIoU,
  clickCropRect,
  clickWithinCrop,
  dedupeDetections,
  filterAlreadyMarked,
  isPlausibleSymbolBox,
  mapCropBboxToCanvas,
  pageTileRects,
  type AiDetectedSymbol,
} from "./aiSymbolDetection";

function det(
  bbox: { x: number; y: number; width: number; height: number },
  confidence: "high" | "medium" | "low" = "high"
): AiDetectedSymbol {
  return { bbox, name: "s", category: "socket", confidence };
}

describe("clickCropRect / clickWithinCrop", () => {
  it("centers the crop on the click and clamps to canvas edges", () => {
    const crop = clickCropRect({ x: 1000, y: 800 }, 4000, 3000, 480);
    expect(crop).toEqual({ x: 760, y: 560, width: 480, height: 480 });

    const corner = clickCropRect({ x: 10, y: 10 }, 4000, 3000, 480);
    expect(corner.x).toBe(0);
    expect(corner.y).toBe(0);

    const edge = clickCropRect({ x: 3995, y: 2995 }, 4000, 3000, 480);
    expect(edge.x + edge.width).toBeLessThanOrEqual(4000);
    expect(edge.y + edge.height).toBeLessThanOrEqual(3000);
  });

  it("maps click into crop-normalized coordinates", () => {
    const crop = { x: 760, y: 560, width: 480, height: 480 };
    const pt = clickWithinCrop({ x: 1000, y: 800 }, crop);
    expect(pt.x).toBeCloseTo(0.5, 5);
    expect(pt.y).toBeCloseTo(0.5, 5);
  });
});

describe("mapCropBboxToCanvas", () => {
  it("round-trips a crop-space box into canvas-normalized space", () => {
    const crop = { x: 400, y: 300, width: 480, height: 480 };
    const mapped = mapCropBboxToCanvas(
      { x: 0.25, y: 0.5, width: 0.1, height: 0.2 },
      crop,
      2000,
      1500
    );
    expect(mapped.x).toBeCloseTo((400 + 120) / 2000, 5);
    expect(mapped.y).toBeCloseTo((300 + 240) / 1500, 5);
    expect(mapped.width).toBeCloseTo(48 / 2000, 5);
    expect(mapped.height).toBeCloseTo(96 / 1500, 5);
  });
});

describe("pageTileRects", () => {
  it("returns single tile for small pages", () => {
    expect(pageTileRects(1600, 1200, 2400)).toEqual([
      { x: 0, y: 0, width: 1600, height: 1200 },
    ]);
  });

  it("tiles large pages with overlap covering the full page", () => {
    const tiles = pageTileRects(5000, 3000, 2400, 0.08);
    expect(tiles.length).toBe(6); // 3 cols x 2 rows
    const maxRight = Math.max(...tiles.map((t) => t.x + t.width));
    const maxBottom = Math.max(...tiles.map((t) => t.y + t.height));
    expect(maxRight).toBe(5000);
    expect(maxBottom).toBe(3000);
    // Neighbouring tiles overlap.
    const first = tiles[0]!;
    const second = tiles[1]!;
    expect(second.x).toBeLessThan(first.x + first.width);
  });
});

describe("bboxIoU / dedupeDetections", () => {
  it("computes IoU", () => {
    const a = { x: 0, y: 0, width: 0.2, height: 0.2 };
    expect(bboxIoU(a, a)).toBeCloseTo(1, 5);
    expect(bboxIoU(a, { x: 0.5, y: 0.5, width: 0.1, height: 0.1 })).toBe(0);
  });

  it("keeps the most confident of overlapping detections", () => {
    const kept = dedupeDetections([
      det({ x: 0.1, y: 0.1, width: 0.02, height: 0.02 }, "low"),
      det({ x: 0.101, y: 0.101, width: 0.02, height: 0.02 }, "high"),
      det({ x: 0.5, y: 0.5, width: 0.02, height: 0.02 }, "medium"),
    ]);
    expect(kept.length).toBe(2);
    expect(kept[0]!.confidence).toBe("high");
  });

  it("treats center-inside as duplicate (different box sizes)", () => {
    const kept = dedupeDetections([
      det({ x: 0.1, y: 0.1, width: 0.04, height: 0.04 }, "high"),
      det({ x: 0.115, y: 0.115, width: 0.01, height: 0.01 }, "low"),
    ]);
    expect(kept.length).toBe(1);
  });
});

describe("filterAlreadyMarked", () => {
  it("drops proposals covering an existing mark", () => {
    const proposals = [
      det({ x: 0.1, y: 0.1, width: 0.03, height: 0.03 }),
      det({ x: 0.6, y: 0.6, width: 0.03, height: 0.03 }),
    ];
    const existing = [{ x: 0.11, y: 0.11, width: 0.01, height: 0.01 }];
    const kept = filterAlreadyMarked(proposals, existing);
    expect(kept.length).toBe(1);
    expect(kept[0]!.bbox.x).toBeCloseTo(0.6, 5);
  });
});

describe("isPlausibleSymbolBox", () => {
  it("accepts compact boxes, rejects page-sized or line-like boxes", () => {
    expect(isPlausibleSymbolBox({ x: 0.4, y: 0.4, width: 0.02, height: 0.025 })).toBe(true);
    expect(isPlausibleSymbolBox({ x: 0, y: 0, width: 0.5, height: 0.5 })).toBe(false);
    expect(isPlausibleSymbolBox({ x: 0.1, y: 0.1, width: 0.06, height: 0.005 })).toBe(false);
  });
});
