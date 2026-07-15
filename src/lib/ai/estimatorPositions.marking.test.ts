import { describe, expect, it } from "vitest";
import {
  addManualMarkToPosition,
  isManualMarkAnchor,
  manualMarkCount,
} from "./estimatorPositions";
import type { EstimatorPosition } from "@/types/estimatorPositions";

function basePosition(): EstimatorPosition {
  return {
    id: "pos_1",
    positionCode: "E-ZAS-001",
    trade: "electrical",
    category: "socket",
    normalizedPoint: "socket",
    label: "El. zásuvka",
    unit: "ks",
    quantity: 1,
    quantitySource: "manual",
    reviewStatus: "confirmed",
    priceStatus: "missing",
    evidenceAnchors: [],
  };
}

describe("outside-plan manual marks", () => {
  it("stores anchor but excludes outside-plan from manual mark count", () => {
    const position = addManualMarkToPosition(basePosition(), {
      page: 1,
      bbox: { x: 0.8, y: 0.8, width: 0.05, height: 0.05 },
      fileName: "plan.pdf",
      rawSelectionBbox: { x: 0.75, y: 0.75, width: 0.2, height: 0.2 },
      markStatus: "outside_plan",
      needsReview: true,
    });

    expect(position.evidenceAnchors).toHaveLength(1);
    const anchor = position.evidenceAnchors[0];
    expect(anchor.markStatus).toBe("outside_plan");
    expect(isManualMarkAnchor(anchor)).toBe(false);
    expect(manualMarkCount(position)).toBe(0);
  });

  it("counts confirmed tightened marks toward takeoff", () => {
    const position = addManualMarkToPosition(basePosition(), {
      page: 1,
      bbox: { x: 0.24, y: 0.25, width: 0.02, height: 0.02 },
      fileName: "plan.pdf",
      rawSelectionBbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
      tightSymbolBbox: { x: 0.24, y: 0.25, width: 0.02, height: 0.02 },
      markStatus: "confirmed",
    });

    expect(manualMarkCount(position)).toBe(1);
    expect(position.evidenceAnchors[0].rawSelectionBbox?.width).toBe(0.4);
    expect(position.evidenceAnchors[0].bbox.width).toBe(0.02);
  });
});
