import { describe, expect, it } from "vitest";
import {
  filterEstimatorPositions,
  positionsBlockFixedQuote,
  primarySourceDocumentLabel,
} from "./estimatorPositions";
import { openConflicts } from "./mergeEstimatorPositionsFromDocuments";
import type {
  EstimatorDocument,
  EstimatorPosition,
  EstimatorQuantityConflict,
} from "@/types/estimatorPositions";

function pos(partial: Partial<EstimatorPosition> & Pick<EstimatorPosition, "id" | "positionCode" | "label">): EstimatorPosition {
  return {
    trade: "electrical",
    category: "socket",
    normalizedPoint: "socket",
    quantity: 1,
    unit: "ks",
    quantitySource: "drawing_detection",
    evidenceAnchors: [],
    priceStatus: "price_missing",
    reviewStatus: "needs_review",
    ...partial,
  };
}

function doc(id: string, fileName: string, role: EstimatorDocument["role"] = "drawing"): EstimatorDocument {
  return {
    id,
    fileId: `file-${id}`,
    fileName,
    mimeType: "application/pdf",
    role,
    trades: ["electrical"],
    documentTypes: [role],
    status: "processed",
    confidence: "high",
  };
}

describe("multi-document acceptance", () => {
  const documents = [
    doc("doc-draw", "plan.pdf", "drawing"),
    doc("doc-sched", "vykaz.pdf", "schedule"),
    doc("doc-price", "cennik.csv", "pricebook"),
  ];

  const drawingPosition = pos({
    id: "p-draw",
    positionCode: "E-ZAS-001",
    label: "Zásuvka",
    quantity: 19,
    quantitySource: "drawing_detection",
    sourceDocuments: ["doc-draw"],
    evidenceAnchors: [
      {
        id: "a1",
        documentId: "doc-draw",
        fileName: "plan.pdf",
        page: 2,
        sourceType: "drawing_occurrence",
        confidence: "high",
        needsReview: false,
        bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
      },
    ],
  });

  const schedulePosition = pos({
    id: "p-sched",
    positionCode: "E-VYP-001",
    label: "Vypínač",
    quantity: 8,
    quantitySource: "schedule",
    sourceDocuments: ["doc-sched"],
    evidenceAnchors: [
      {
        id: "a2",
        documentId: "doc-sched",
        fileName: "vykaz.pdf",
        page: 1,
        sourceType: "schedule_table",
        confidence: "high",
        needsReview: true,
      },
    ],
  });

  const positions = [drawingPosition, schedulePosition];

  it("filters current-document positions without hiding schedule-only rows in all-docs view", () => {
    const all = filterEstimatorPositions(positions, {});
    expect(all).toHaveLength(2);

    const current = filterEstimatorPositions(positions, {
      documentId: "doc-draw",
      documentFileName: "plan.pdf",
      documentFileId: "file-doc-draw",
    });
    expect(current).toHaveLength(1);
    expect(current[0]!.id).toBe("p-draw");

    const scheduleCurrent = filterEstimatorPositions(positions, {
      documentId: "doc-sched",
      documentFileName: "vykaz.pdf",
      documentFileId: "file-doc-sched",
    });
    expect(scheduleCurrent).toHaveLength(1);
    expect(scheduleCurrent[0]!.quantitySource).toBe("schedule");
    expect(scheduleCurrent[0]!.evidenceAnchors[0]!.bbox).toBeUndefined();
  });

  it("labels source document for multi-doc rows", () => {
    expect(primarySourceDocumentLabel(drawingPosition, documents)).toContain("plan.pdf");
    expect(primarySourceDocumentLabel(schedulePosition, documents)).toContain("vykaz.pdf");
  });

  it("blocks fixed quote for open drawing vs schedule conflict", () => {
    const conflicts: EstimatorQuantityConflict[] = [
      {
        id: "c1",
        positionId: "p-draw",
        label: "Zásuvka",
        drawingQty: 19,
        scheduleQty: 21,
        unit: "ks",
        category: "socket",
        status: "open",
      },
    ];
    const safety = positionsBlockFixedQuote(
      [{ ...drawingPosition, reviewStatus: "needs_review" }],
      { openConflicts: conflicts }
    );
    expect(safety.blocked).toBe(true);
    expect(safety.reasons.some((r) => r.includes("rozdielov"))).toBe(true);
    expect(openConflicts(conflicts)).toHaveLength(1);
  });

  it("unblocks quote after conflict resolution", () => {
    const conflicts: EstimatorQuantityConflict[] = [
      {
        id: "c1",
        positionId: "p-draw",
        label: "Zásuvka",
        drawingQty: 19,
        scheduleQty: 21,
        unit: "ks",
        category: "socket",
        status: "resolved_drawing",
      },
    ];
    const resolvedPosition = {
      ...drawingPosition,
      quantity: 19,
      quantitySource: "drawing_detection" as const,
      reviewStatus: "confirmed" as const,
      priceStatus: "manual_price" as const,
      unitPrice: 12,
      totalPrice: 228,
    };
    const safety = positionsBlockFixedQuote([resolvedPosition], {
      openConflicts: conflicts,
    });
    expect(openConflicts(conflicts)).toHaveLength(0);
    expect(safety.reasons.some((r) => r.includes("rozdielov"))).toBe(false);
  });

  it("blocks quote for unconfirmed schedule-only quantity", () => {
    const safety = positionsBlockFixedQuote([schedulePosition]);
    expect(safety.blocked).toBe(true);
    expect(safety.reasons.some((r) => r.includes("výkazu"))).toBe(true);
  });

  it("blocks quote for missing prices without silently using 0 EUR", () => {
    const safety = positionsBlockFixedQuote([
      { ...drawingPosition, reviewStatus: "confirmed", unitPrice: undefined, priceStatus: "price_missing" },
    ]);
    expect(safety.blocked).toBe(true);
    expect(safety.reasons.some((r) => r.includes("nemá cenu"))).toBe(true);
  });
});
