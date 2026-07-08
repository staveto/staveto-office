import { describe, expect, it } from "vitest";
import type { QuoteDoc } from "@/lib/quotes";
import {
  buildPriceSummaryFromQuote,
  shouldPreferQuoteDocumentPricing,
} from "@/lib/quoteDocumentMeta";
import { computeAiSetupTotals, defaultCalculation } from "@/components/projects/setup/aiSetupHelpers";

function sampleQuote(overrides?: Partial<QuoteDoc>): QuoteDoc {
  return {
    id: "q1",
    title: "Test",
    clientName: "Client",
    status: "accepted",
    items: [
      {
        id: "m1",
        category: "material",
        name: "Tehla",
        qty: 10,
        unit: "m3",
        unitPrice: 14,
        total: 140,
      },
      {
        id: "w1",
        category: "work",
        name: "Práca",
        qty: 130,
        unit: "h",
        unitPrice: 20,
        total: 2600,
      },
    ],
    subtotal: 2740,
    vatPercent: 20,
    vatAmount: 548,
    grandTotal: 3288,
    ...overrides,
  };
}

describe("buildPriceSummaryFromQuote", () => {
  it("splits material and work from line items", () => {
    const summary = buildPriceSummaryFromQuote(sampleQuote());
    expect(summary.materialTotal).toBe(140);
    expect(summary.workTotal).toBe(2600);
    expect(summary.grossTotal).toBe(3288);
    expect(summary.isFlatRate).toBe(false);
  });
});

describe("shouldPreferQuoteDocumentPricing", () => {
  it("prefers saved quote when frozen setup has zero material", () => {
    const quote = sampleQuote({
      subtotal: 82176.1,
      vatAmount: 16435.22,
      grandTotal: 98611.32,
      items: [
        {
          id: "m1",
          category: "material",
          name: "Izolácia",
          qty: 1,
          unit: "m2",
          unitPrice: 79576.1,
          total: 79576.1,
        },
        {
          id: "w1",
          category: "work",
          name: "Práca",
          qty: 130,
          unit: "h",
          unitPrice: 20,
          total: 2600,
        },
      ],
    });
    const setupTotals = computeAiSetupTotals(
      [],
      { workers: 2, hours: 130, hourlyRate: 20, note: "" },
      {
        ...defaultCalculation(20, "SK"),
        materialTotalOverride: 0,
        workTotalOverride: 2600,
        manualGrossTotal: 3588,
      }
    );
    expect(shouldPreferQuoteDocumentPricing(quote, setupTotals)).toBe(true);
    const summary = buildPriceSummaryFromQuote(quote);
    expect(summary.materialTotal).toBeCloseTo(79576.1, 2);
    expect(summary.grossTotal).toBeCloseTo(98611.32, 2);
  });
});
