import { describe, expect, it } from "vitest";
import {
  isLegendOnlyPosition,
  mergeEstimatorPositionsFromDocuments,
  positionMergeKey,
  positionsForDocument,
  resolveSelectionTarget,
} from "./mergeEstimatorPositionsFromDocuments";
import type { EstimatorDocument, EstimatorPosition } from "@/types/estimatorPositions";

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

function doc(id: string, fileName: string): EstimatorDocument {
  return {
    id,
    fileId: `file-${id}`,
    fileName,
    mimeType: "application/pdf",
    role: "drawing",
    trades: ["electrical"],
    documentTypes: ["electrical_marking"],
    status: "processed",
    confidence: "high",
  };
}

describe("mergeEstimatorPositionsFromDocuments", () => {
  it("merges positions from 2 documents and preserves evidence anchors", () => {
    const drawing = pos({
      id: "p1",
      positionCode: "E-ZAS-001",
      label: "El.zásuvka",
      roomName: "KUCHYNA",
      quantity: 4,
      quantitySource: "drawing_detection",
      evidenceAnchors: [
        {
          id: "a1",
          documentId: "doc-draw",
          fileName: "plan.pdf",
          page: 1,
          sourceType: "drawing_occurrence",
          confidence: "high",
          needsReview: false,
          bbox: { x: 0.1, y: 0.2, width: 0.02, height: 0.02 },
        },
      ],
    });
    const schedule = pos({
      id: "p2",
      positionCode: "E-ZAS-001B",
      label: "El.zásuvka",
      roomName: "KUCHYNA",
      quantity: 4,
      quantitySource: "schedule",
      evidenceAnchors: [
        {
          id: "a2",
          documentId: "doc-sched",
          fileName: "vykaz.pdf",
          page: 1,
          sourceType: "schedule_table",
          sourceText: "El.zásuvka",
          confidence: "high",
          needsReview: false,
        },
      ],
    });

    const result = mergeEstimatorPositionsFromDocuments({
      documents: [doc("doc-draw", "plan.pdf"), doc("doc-sched", "vykaz.pdf")],
      positionsByDocument: new Map([
        ["doc-draw", [drawing]],
        ["doc-sched", [schedule]],
      ]),
    });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.evidenceAnchors).toHaveLength(2);
    expect(result.positions[0]!.sourceDocuments).toContain("doc-draw");
    expect(result.positions[0]!.sourceDocuments).toContain("doc-sched");
    expect(result.conflicts).toHaveLength(0);
  });

  it("legend-only does not duplicate drawing occurrence", () => {
    const drawing = pos({
      id: "p1",
      positionCode: "E-ZAS-001",
      label: "El.zásuvka",
      roomName: "KUCHYNA",
      quantity: 4,
      quantitySource: "drawing_detection",
      evidenceAnchors: [
        {
          id: "a1",
          documentId: "doc-draw",
          fileName: "plan.pdf",
          page: 1,
          sourceType: "drawing_occurrence",
          confidence: "high",
          needsReview: false,
        },
      ],
    });
    const legendOnly = pos({
      id: "p2",
      positionCode: "E-ZAS-LEG",
      label: "El.zásuvka",
      roomName: "KUCHYNA",
      quantity: 4,
      quantitySource: "legend",
      evidenceAnchors: [
        {
          id: "a2",
          documentId: "doc-draw",
          fileName: "plan.pdf",
          page: 1,
          sourceType: "project_legend",
          sourceText: "Z",
          confidence: "medium",
          needsReview: false,
        },
      ],
    });

    expect(isLegendOnlyPosition(legendOnly)).toBe(true);

    const result = mergeEstimatorPositionsFromDocuments({
      documents: [doc("doc-draw", "plan.pdf")],
      positionsByDocument: new Map([
        ["doc-draw", [drawing, legendOnly]],
      ]),
    });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.evidenceAnchors).toHaveLength(2);
    expect(result.positions[0]!.quantity).toBe(4);
  });

  it("drawing 19 vs schedule 21 creates open conflict", () => {
    const drawing = pos({
      id: "p1",
      positionCode: "E-ZAS-001",
      label: "Zásuvka",
      roomName: "OBÝVACKA",
      quantity: 19,
      quantitySource: "drawing_detection",
      evidenceAnchors: [
        {
          id: "a1",
          documentId: "doc-draw",
          fileName: "plan.pdf",
          page: 1,
          sourceType: "drawing_occurrence",
          confidence: "high",
          needsReview: false,
        },
      ],
    });
    const schedule = pos({
      id: "p2",
      positionCode: "E-ZAS-002",
      label: "Zásuvka",
      roomName: "OBÝVACKA",
      quantity: 21,
      quantitySource: "schedule",
      evidenceAnchors: [
        {
          id: "a2",
          documentId: "doc-sched",
          fileName: "vykaz.pdf",
          page: 1,
          sourceType: "schedule_table",
          confidence: "high",
          needsReview: false,
        },
      ],
    });

    const result = mergeEstimatorPositionsFromDocuments({
      documents: [doc("doc-draw", "plan.pdf"), doc("doc-sched", "vykaz.pdf")],
      positionsByDocument: new Map([
        ["doc-draw", [drawing]],
        ["doc-sched", [schedule]],
      ]),
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.drawingQty).toBe(19);
    expect(result.conflicts[0]!.scheduleQty).toBe(21);
    expect(result.conflicts[0]!.status).toBe("open");
    expect(result.positions[0]!.reviewStatus).toBe("needs_review");
    expect(result.positions[0]!.quantitySource).toBe("unknown");
  });

  it("schedule-only position valid without bbox", () => {
    const schedule = pos({
      id: "p1",
      positionCode: "E-VYP-001",
      label: "Vypínač",
      quantity: 8,
      quantitySource: "schedule",
      evidenceAnchors: [
        {
          id: "a1",
          documentId: "doc-sched",
          fileName: "vykaz.pdf",
          page: 1,
          sourceType: "schedule_table",
          confidence: "high",
          needsReview: false,
        },
      ],
    });

    const result = mergeEstimatorPositionsFromDocuments({
      documents: [doc("doc-sched", "vykaz.pdf")],
      positionsByDocument: new Map([["doc-sched", [schedule]]]),
      scheduleOnly: true,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.quantity).toBe(8);
    expect(result.positions[0]!.evidenceAnchors[0]!.bbox).toBeUndefined();
    expect(result.conflicts).toHaveLength(0);
  });

  it("resolveSelectionTarget picks document and page from anchor", () => {
    const documents = [doc("doc-draw", "plan.pdf")];
    const position = pos({
      id: "p1",
      positionCode: "E-ZAS-001",
      label: "Zásuvka",
      evidenceAnchors: [
        {
          id: "a1",
          documentId: "doc-draw",
          fileName: "plan.pdf",
          page: 3,
          sourceType: "drawing_occurrence",
          confidence: "high",
          needsReview: false,
          bbox: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 },
        },
      ],
    });

    const target = resolveSelectionTarget(position, documents);
    expect(target.documentId).toBe("doc-draw");
    expect(target.page).toBe(3);
    expect(target.fileName).toBe("plan.pdf");
  });

  it("positionsForDocument filters by documentId", () => {
    const documents = [doc("doc-a", "a.pdf"), doc("doc-b", "b.pdf")];
    const positions = [
      pos({
        id: "p1",
        positionCode: "E-ZAS-001",
        label: "A",
        evidenceAnchors: [
          {
            id: "a1",
            documentId: "doc-a",
            fileName: "a.pdf",
            page: 1,
            sourceType: "drawing_occurrence",
            confidence: "high",
            needsReview: false,
          },
        ],
      }),
      pos({
        id: "p2",
        positionCode: "E-ZAS-002",
        label: "B",
        evidenceAnchors: [
          {
            id: "a2",
            documentId: "doc-b",
            fileName: "b.pdf",
            page: 1,
            sourceType: "schedule_table",
            confidence: "high",
            needsReview: false,
          },
        ],
      }),
    ];

    const filtered = positionsForDocument(positions, "doc-a", documents);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.id).toBe("p1");
  });

  it("positionMergeKey groups same room/category", () => {
    const a = pos({
      id: "p1",
      positionCode: "E-ZAS-001",
      label: "Zásuvka",
      roomName: "KUCHYNA",
      category: "socket",
      normalizedPoint: "socket",
      unit: "ks",
    });
    const b = pos({
      id: "p2",
      positionCode: "E-ZAS-002",
      label: "Zásuvka iný kód",
      roomName: "KUCHYNA",
      category: "socket",
      normalizedPoint: "socket",
      unit: "ks",
    });
    expect(positionMergeKey(a)).toBe(positionMergeKey(b));
  });
});
