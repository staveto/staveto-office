import { describe, expect, it } from "vitest";
import { isOverlappingStack } from "./overlappingSymbolStack";
import type { NearbySymbolCandidate } from "@/lib/ai/pickSymbolFromClick";

function cand(
  id: string,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  partOnly = false
): NearbySymbolCandidate {
  return {
    id,
    bbox: {
      x: box.minX / 1000,
      y: box.minY / 1000,
      width: (box.maxX - box.minX) / 1000,
      height: (box.maxY - box.minY) / 1000,
    },
    center: {
      x: (box.minX + box.maxX) / 2000,
      y: (box.minY + box.maxY) / 2000,
    },
    colorHint: "orange",
    pixelBbox: box,
    distancePx: 0,
    partOnly,
  };
}

describe("isOverlappingStack", () => {
  it("detects marks stacked on the same spot", () => {
    expect(
      isOverlappingStack([
        cand("a", { minX: 100, minY: 100, maxX: 120, maxY: 120 }),
        cand("b", { minX: 105, minY: 102, maxX: 125, maxY: 122 }),
        cand("c", { minX: 98, minY: 99, maxX: 118, maxY: 119 }),
      ])
    ).toBe(true);
  });

  it("ignores well-separated marks", () => {
    expect(
      isOverlappingStack([
        cand("a", { minX: 10, minY: 10, maxX: 30, maxY: 30 }),
        cand("b", { minX: 200, minY: 200, maxX: 220, maxY: 220 }),
      ])
    ).toBe(false);
  });

  it("needs at least two full marks", () => {
    expect(
      isOverlappingStack([
        cand("a", { minX: 100, minY: 100, maxX: 120, maxY: 120 }),
        cand("p", { minX: 100, minY: 100, maxX: 120, maxY: 120 }, true),
      ])
    ).toBe(false);
  });
});
