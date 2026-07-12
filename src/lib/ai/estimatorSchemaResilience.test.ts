import { describe, expect, it } from "vitest";
import { parseEstimatorFactsJson } from "../../../functions/src/estimator/estimatorSchema";

describe("parseEstimatorFactsJson resilience", () => {
  it("accepts warnings as objects and unit Ks", () => {
    const json = JSON.stringify({
      sessionId: "s1",
      detectedDocumentTypes: ["electrical_marking"],
      inputSummary: "Elektro značenie",
      rooms: [{ id: "r1", name: "KUCHYNA", evidence: [], confidence: "High", needsReview: false }],
      extractedItems: [
        {
          id: "i1",
          category: "switch",
          roomName: "KUCHYNA",
          title: "Vypínač",
          quantity: 2,
          unit: "Ks",
          origin: "from_document",
          evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
          confidence: "high",
          needsReview: false,
        },
      ],
      inferredItems: [],
      missingQuestions: [],
      risks: [],
      legendEntries: [
        {
          id: "l1",
          trade: "electrical",
          symbolDescription: "Vypínač",
          normalizedType: "switch",
          unit: "Ks",
          defaultQuoteCategory: "material_and_labor",
          evidence: [],
          confidence: "medium",
          needsReview: false,
        },
      ],
      symbolOccurrences: [
        {
          id: "o1",
          page: 1,
          roomName: "KUCHYNA",
          normalizedType: "switch",
          title: "Vypínač",
          quantity: 2,
          unit: "Ks",
          origin: "from_document",
          evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
          confidence: "high",
          needsReview: false,
        },
      ],
      unknownSymbols: [],
      companyFocus: [],
      confidence: "Medium",
      warnings: [
        { message: "Kabelové dĺžky nie sú spoľahlivé", severity: "medium" },
        "Druhé upozornenie",
      ],
    });

    const facts = parseEstimatorFactsJson(json, "s1");
    expect(facts.warnings[0]).toContain("Kabelové");
    expect(facts.warnings[1]).toBe("Druhé upozornenie");
    expect(facts.extractedItems[0]!.unit).toBe("ks");
    expect(facts.symbolOccurrences[0]!.unit).toBe("ks");
    expect(facts.confidence).toBe("medium");
    expect(facts.rooms[0]!.confidence).toBe("high");
  });
});
