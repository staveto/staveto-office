import { describe, expect, it } from "vitest";
import { foldLegendIntoEstimatorFacts } from "./foldLegendIntoEstimatorFacts";
import type { AiEstimatorFacts } from "@/types/aiEstimator";

function base(overrides: Partial<AiEstimatorFacts> = {}): AiEstimatorFacts {
  return {
    sessionId: "s1",
    detectedDocumentTypes: ["electrical_marking"],
    inputSummary: "",
    rooms: [],
    extractedItems: [],
    inferredItems: [],
    missingQuestions: [],
    risks: [],
    confidence: "medium",
    warnings: [],
    legendEntries: [],
    symbolOccurrences: [],
    unknownSymbols: [],
    ...overrides,
  };
}

describe("foldLegendIntoEstimatorFacts", () => {
  it("promotes legend into extractedItems when occurrences are empty", () => {
    const out = foldLegendIntoEstimatorFacts(
      base({
        legendEntries: [
          {
            id: "l1",
            trade: "electrical",
            symbolLabel: "V1",
            symbolDescription: "Vypínač",
            normalizedType: "switch",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [],
            confidence: "high",
            needsReview: false,
          },
          {
            id: "l2",
            trade: "electrical",
            symbolLabel: "Z1",
            symbolDescription: "Zásuvka",
            normalizedType: "socket",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [],
            confidence: "high",
            needsReview: false,
          },
          {
            id: "l3",
            trade: "electrical",
            symbolDescription: "Svietidlo",
            normalizedType: "ceiling_light",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [],
            confidence: "medium",
            needsReview: false,
          },
        ],
      })
    );
    expect(out.extractedItems).toHaveLength(3);
    expect(out.missingQuestions[0]?.id).toBe("q_legend_counts");
  });

  it("promotes sockets from legend when only lighting was counted", () => {
    const out = foldLegendIntoEstimatorFacts(
      base({
        legendEntries: [
          {
            id: "l1",
            trade: "electrical",
            symbolDescription: "Zásuvka klasická",
            normalizedType: "unknown",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [],
            confidence: "high",
            needsReview: false,
          },
        ],
        symbolOccurrences: [
          {
            id: "o1",
            page: 1,
            normalizedType: "pendant_light",
            title: "Visiace svietidlo",
            quantity: 2,
            unit: "ks",
            origin: "from_document",
            evidence: [],
            confidence: "high",
            needsReview: false,
          },
        ],
        extractedItems: [
          {
            id: "e1",
            category: "lighting",
            title: "Visiace svietidlo",
            quantity: 2,
            unit: "ks",
            origin: "from_document",
            evidence: [],
            confidence: "high",
            needsReview: false,
          },
        ],
      })
    );
    expect(out.extractedItems.some((i) => /Zásuvka/i.test(i.title))).toBe(true);
  });
});
