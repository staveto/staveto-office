import { describe, expect, it } from "vitest";
import {
  computeAiSetupTotals,
  defaultCalculation,
  resolveSetupMaterialRows,
  resolveWorkEstimateForQuoteItems,
  workEstimateFromQuoteItems,
} from "@/components/projects/setup/aiSetupHelpers";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import { buildQuoteDocFromProjectDraft } from "@/lib/projectQuotePrint";
import { buildPriceSummaryFromQuote } from "@/lib/quoteDocumentMeta";
import type { ProjectDoc } from "@/lib/projects";
import { computeItemTotal } from "@/lib/estimateUtils";

function item(
  partial: Partial<QuoteDraftItemDoc> &
    Pick<QuoteDraftItemDoc, "id" | "category" | "name" | "qty" | "unitPrice">
): QuoteDraftItemDoc {
  return {
    unit: "ks",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("quote totals after manual add (post AI freeze)", () => {
  const takeoffMaterials = [
    item({
      id: "m1",
      category: "material",
      name: "Zásuvka",
      qty: 18,
      unitPrice: 6.93,
      sourceOfQuantity: "symbol_detection",
      sourceDrawingId: "d1",
      evidenceCount: 18,
    }),
  ];
  const manualMaterials = [
    item({
      id: "m2",
      category: "material",
      name: "Cyky-j 3x2,5",
      qty: 900,
      unit: "m",
      unitPrice: 1.31,
    }),
  ];
  const takeoffWork = [
    item({
      id: "w1",
      category: "work",
      name: "Montáž svetla",
      qty: 40,
      unit: "pxs",
      unitPrice: 19,
      sourceOfQuantity: "symbol_detection",
      sourceDrawingId: "d1",
      evidenceCount: 40,
    }),
  ];
  const manualWork = [
    item({
      id: "w2",
      category: "work",
      name: "Osadenie krabice",
      qty: 1,
      unitPrice: 1.2,
    }),
  ];

  it("resolveFrozenOverride follows live material sum after items are added", () => {
    const all = [...takeoffMaterials, ...manualMaterials];
    const materials = resolveSetupMaterialRows(all, [], []);
    const work = workEstimateFromQuoteItems(takeoffWork, []);
    const frozenAt = computeAiSetupTotals(
      resolveSetupMaterialRows(takeoffMaterials, [], []),
      work,
      { ...defaultCalculation(20, "SK"), marginPercent: 0 }
    );
    const afterAdd = computeAiSetupTotals(materials, work, {
      ...defaultCalculation(20, "SK"),
      marginPercent: 0,
      materialTotalOverride: frozenAt.materialCost,
      workTotalOverride: frozenAt.workCost,
    });

    const expectedMaterial = all.reduce(
      (s, i) => s + computeItemTotal(i.qty, i.unitPrice),
      0
    );
    expect(afterAdd.materialCost).toBeCloseTo(expectedMaterial, 2);
    expect(afterAdd.materialCost).toBeGreaterThan(frozenAt.materialCost);
  });

  it("resolveWorkEstimateForQuoteItems picks up extra work lines", () => {
    const frozen = workEstimateFromQuoteItems(takeoffWork, []);
    const resolved = resolveWorkEstimateForQuoteItems(
      [...takeoffWork, ...manualWork],
      [],
      frozen
    );
    const live = workEstimateFromQuoteItems([...takeoffWork, ...manualWork], []);
    expect(computeItemTotal(resolved.hours, resolved.hourlyRate)).toBeCloseTo(
      computeItemTotal(live.hours, live.hourlyRate),
      2
    );
    expect(computeItemTotal(resolved.hours, resolved.hourlyRate)).toBeGreaterThan(
      computeItemTotal(frozen.hours, frozen.hourlyRate)
    );
  });

  it("buildQuoteDocFromProjectDraft footer matches all priced lines", () => {
    const quoteItems = [
      ...takeoffMaterials,
      ...manualMaterials,
      ...takeoffWork,
      ...manualWork,
    ];
    const project = {
      id: "p1",
      name: "Test",
      createdAt: "2026-01-01T00:00:00.000Z",
      quoteDraftVatPercent: 20,
      quoteDraftNotes: JSON.stringify({
        aiSetupMeta: {
          workEstimate: workEstimateFromQuoteItems(takeoffWork, []),
          calculation: {
            ...defaultCalculation(20, "SK"),
            marginPercent: 0,
            materialTotalOverride: computeItemTotal(18, 6.93),
            workTotalOverride: computeItemTotal(40, 19),
          },
        },
      }),
    } as ProjectDoc;

    const quote = buildQuoteDocFromProjectDraft(project, quoteItems, []);
    const lineSum = quote.items.reduce((s, i) => s + i.total, 0);
    expect(quote.subtotal).toBeCloseTo(lineSum, 2);
    expect(quote.subtotal).toBeGreaterThan(computeItemTotal(18, 6.93) + computeItemTotal(40, 19));

    const summary = buildPriceSummaryFromQuote(quote);
    expect(summary.netTotal).toBeCloseTo(lineSum, 2);
    expect(summary.grossTotal).toBeCloseTo(quote.grandTotal, 2);
  });
});
