import { describe, expect, it } from "vitest";
import {
  categoryKeyForLabel,
  scaleNormalizedRectAboutCenter,
  uniquifyCategoryLabel,
} from "@/lib/takeoff/takeoffCategories";

describe("scaleNormalizedRectAboutCenter", () => {
  it("keeps the rect unchanged at scale 1", () => {
    const rect = { x: 0.2, y: 0.3, width: 0.04, height: 0.04 };
    expect(scaleNormalizedRectAboutCenter(rect, 1)).toEqual(rect);
  });

  it("grows about the center", () => {
    const rect = { x: 0.2, y: 0.3, width: 0.04, height: 0.04 };
    const scaled = scaleNormalizedRectAboutCenter(rect, 2);
    expect(scaled.width).toBeCloseTo(0.08);
    expect(scaled.height).toBeCloseTo(0.08);
    expect(scaled.x + scaled.width / 2).toBeCloseTo(0.22);
    expect(scaled.y + scaled.height / 2).toBeCloseTo(0.32);
  });
});

describe("uniquifyCategoryLabel", () => {
  it("keeps the label when free", () => {
    expect(uniquifyCategoryLabel("Valena Zásuvka", ["iná položka"])).toBe(
      "Valena Zásuvka"
    );
  });

  it("appends (2), (3) when the same product name already exists", () => {
    const existing = [
      categoryKeyForLabel("Valena Zásuvka"),
      categoryKeyForLabel("Valena Zásuvka (2)"),
    ];
    expect(uniquifyCategoryLabel("Valena Zásuvka", existing)).toBe(
      "Valena Zásuvka (3)"
    );
  });
});
