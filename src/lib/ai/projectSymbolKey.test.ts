import { describe, expect, it } from "vitest";
import {
  resolveBestSymbolKey,
  symbolKindForCategory,
  upsertLegendSymbolKey,
  upsertUserLearnedSymbolKey,
} from "./projectSymbolKey";
import type { EstimatorPosition } from "@/types/estimatorPositions";

function pos(partial: Partial<EstimatorPosition> = {}): EstimatorPosition {
  return {
    id: "pos_1",
    positionCode: "E-ZAS-001",
    label: "Zásuvka",
    category: "socket",
    normalizedPoint: "socket",
    quantity: 1,
    unit: "ks",
    reviewStatus: "confirmed",
    priceStatus: "price_missing",
    evidenceAnchors: [
      {
        id: "a1",
        fileName: "p.pdf",
        page: 1,
        sourceType: "user_confirmed",
        bbox: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
      },
    ],
    ...partial,
  } as EstimatorPosition;
}

describe("projectSymbolKey", () => {
  it("maps LED/cable to line_symbol", () => {
    expect(symbolKindForCategory("led_strip")).toBe("line_symbol");
    expect(symbolKindForCategory("cable")).toBe("line_symbol");
    expect(symbolKindForCategory("socket")).toBe("point_symbol");
  });

  it("user_learned wins over ai_suggested and legend for same point", () => {
    let keys = upsertLegendSymbolKey([], {
      label: "Zásuvka",
      normalizedPoint: "socket",
      category: "socket",
      templateBbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
    });
    keys = [
      ...keys,
      {
        id: "ai1",
        label: "AI socket",
        normalizedPoint: "socket",
        category: "socket",
        source: "ai_suggested",
        kind: "point_symbol",
        colorHint: "green",
        templateBbox: { x: 0.2, y: 0.2, width: 0.02, height: 0.02 },
        confidence: "low",
        needsReview: true,
      },
    ];
    keys = upsertUserLearnedSymbolKey(keys, pos());
    const best = resolveBestSymbolKey(keys, { normalizedPoint: "socket" });
    expect(best?.source).toBe("user_learned");
    expect(best?.linkedPositionId).toBe("pos_1");
  });

  it("legend key does not require floor occurrence", () => {
    const keys = upsertLegendSymbolKey([], {
      label: "Svetlo",
      normalizedPoint: "lighting",
      category: "lighting",
      templateBbox: { x: 0.8, y: 0.05, width: 0.03, height: 0.03 },
    });
    expect(keys).toHaveLength(1);
    expect(keys[0]!.source).toBe("project_legend");
    expect(keys[0]!.linkedPositionId).toBeUndefined();
  });
});
