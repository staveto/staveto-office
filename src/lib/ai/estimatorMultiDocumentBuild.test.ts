import { describe, expect, it } from "vitest";
import {
  buildScheduleOnlyPositions,
  isScheduleOnlySession,
  parsePricebookDocument,
} from "./estimatorMultiDocumentBuild";
import type { EstimatorDocument } from "@/types/estimatorPositions";

function doc(partial: Partial<EstimatorDocument> & Pick<EstimatorDocument, "id" | "fileName" | "role">): EstimatorDocument {
  return {
    fileId: partial.id,
    mimeType: "application/pdf",
    trades: ["electrical"],
    documentTypes: [partial.role],
    status: "uploaded",
    confidence: "medium",
    ...partial,
  };
}

describe("estimatorMultiDocumentBuild", () => {
  it("detects schedule-only session without drawing PDF", () => {
    expect(
      isScheduleOnlySession([
        doc({ id: "d1", fileName: "vykaz.pdf", role: "schedule", mimeType: "application/pdf" }),
      ])
    ).toBe(true);
    expect(
      isScheduleOnlySession([
        doc({ id: "d1", fileName: "plan.pdf", role: "drawing" }),
        doc({ id: "d2", fileName: "vykaz.pdf", role: "schedule" }),
      ])
    ).toBe(false);
  });

  it("builds schedule-only positions without bbox", () => {
    const rows = buildScheduleOnlyPositions([
      {
        id: "r1",
        label: "El.zásuvka",
        roomName: "KUCHYNA",
        category: "socket",
        quantity: 4,
        unit: "ks",
        documentId: "doc-sched",
        fileName: "vykaz.pdf",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantitySource).toBe("schedule");
    expect(rows[0]!.evidenceAnchors[0]!.bbox).toBeUndefined();
    expect(rows[0]!.reviewStatus).toBe("needs_review");
  });

  it("XLSX pricebook returns placeholder without fake products", () => {
    const outcome = parsePricebookDocument(
      doc({
        id: "pb1",
        fileName: "cennik.xlsx",
        role: "pricebook",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    expect(outcome.placeholder).toBe(true);
    expect(outcome.products).toHaveLength(0);
  });

  it("CSV pricebook parses via existing parser", () => {
    const csv = [
      "brand,productName,productCode,category,unit,netPrice,grossPrice,currency,vatPercent,validFrom,supplierName",
      "Legrand,Zásuvka,Z1,socket,ks,2.5,3.0,EUR,20,,Test",
    ].join("\n");
    const outcome = parsePricebookDocument(
      doc({ id: "pb2", fileName: "cennik.csv", role: "pricebook", mimeType: "text/csv" }),
      csv
    );
    expect(outcome.products.length).toBeGreaterThan(0);
    expect(outcome.placeholder).toBe(false);
  });
});
