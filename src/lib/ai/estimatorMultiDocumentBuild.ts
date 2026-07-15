/**
 * Schedule-only and pricebook helpers for multi-document estimator sessions.
 */

import { parseSupplierPricebookCsv } from "@/lib/products/pricebookCsv";
import type { ProductCandidate } from "@/lib/products/productSourcingTypes";
import type {
  EstimatorDocument,
  EstimatorPosition,
  EstimatorPositionTrade,
} from "@/types/estimatorPositions";
import { positionCategoryCode } from "./estimatorPositions";

/** True when session has schedule/list docs but no drawing PDF. */
export function isScheduleOnlySession(documents: EstimatorDocument[]): boolean {
  const pdfs = documents.filter(
    (d) => d.mimeType.includes("pdf") || d.fileName.toLowerCase().endsWith(".pdf")
  );
  const hasDrawing = pdfs.some((d) => d.role === "drawing" || d.role === "legend");
  const hasSchedule = documents.some(
    (d) => d.role === "schedule" || d.role === "technical_report"
  );
  return hasSchedule && !hasDrawing;
}

export type ScheduleRowInput = {
  id: string;
  label: string;
  roomName?: string;
  category: string;
  quantity: number;
  unit: EstimatorPosition["unit"];
  documentId: string;
  fileName: string;
};

/** Build schedule-only positions (bbox not required). */
export function buildScheduleOnlyPositions(
  rows: ScheduleRowInput[],
  options?: { trade?: EstimatorPositionTrade; currency?: string }
): EstimatorPosition[] {
  const trade = options?.trade ?? "electrical";
  const currency = options?.currency ?? "EUR";
  const counters = new Map<string, number>();

  return rows
    .filter((r) => r.label.trim() && r.quantity > 0)
    .map((row) => {
      const codeBase = positionCategoryCode(trade, row.category);
      const n = (counters.get(codeBase) ?? 0) + 1;
      counters.set(codeBase, n);
      const positionCode = `${codeBase}-${String(n).padStart(3, "0")}`;

      return {
        id: `pos_sched_${row.id}`,
        positionCode,
        trade,
        category: row.category,
        normalizedPoint: row.category,
        label: row.label.trim(),
        roomName: row.roomName?.trim() || undefined,
        quantity: row.quantity,
        unit: row.unit,
        quantitySource: "schedule" as const,
        sourceDocuments: [row.documentId],
        evidenceAnchors: [
          {
            id: `anchor_sched_${row.id}`,
            documentId: row.documentId,
            fileName: row.fileName,
            page: 1,
            sourceType: "schedule_table" as const,
            sourceText: row.label,
            confidence: "medium" as const,
            needsReview: true,
          },
        ],
        priceStatus: "price_missing" as const,
        currency,
        reviewStatus: "needs_review" as const,
        reviewReason: "Množstvo z výkazu — potvrďte pred pevnou ponukou.",
      };
    });
}

export type PricebookParseOutcome = {
  role: "pricebook";
  products: ProductCandidate[];
  errors: string[];
  placeholder?: boolean;
};

/**
 * Parse uploaded pricebook. CSV uses existing parser; XLSX is placeholder only.
 */
export function parsePricebookDocument(
  document: EstimatorDocument,
  textContent?: string
): PricebookParseOutcome {
  const name = document.fileName.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return {
      role: "pricebook",
      products: [],
      errors: ["XLSX pricebook parsing is not implemented yet."],
      placeholder: true,
    };
  }
  if (!textContent?.trim()) {
    return {
      role: "pricebook",
      products: [],
      errors: ["Pricebook file content is not available for parsing."],
      placeholder: true,
    };
  }
  const parsed = parseSupplierPricebookCsv(textContent);
  return {
    role: "pricebook",
    products: parsed.products,
    errors: parsed.errors,
    placeholder: false,
  };
}
