import { describe, expect, it } from "vitest";
import {
  convertTechnicalDrawingFactsToEstimatorItems,
  validateEstimatorFacts,
} from "../../../functions/src/estimator/symbolReading";
import { mergeEstimatorFactsStrict } from "../../../functions/src/estimator/estimatorMerge";
import type {
  EstimatorFactsPayload,
  SymbolOccurrencePayload,
} from "../../../functions/src/estimator/estimatorSchema";

function facts(overrides: Partial<EstimatorFactsPayload> = {}): EstimatorFactsPayload {
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
    drawingRegions: [],
    legendEntries: [],
    symbolOccurrences: [],
    unknownSymbols: [],
    companyFocus: [],
    ...overrides,
  };
}

function occ(overrides: Partial<SymbolOccurrencePayload> = {}): SymbolOccurrencePayload {
  return {
    id: "o1",
    page: 1,
    normalizedType: "pendant_light",
    title: "Visiace svietidlo",
    quantity: 2,
    unit: "ks",
    origin: "from_document",
    evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
    confidence: "high",
    needsReview: false,
    ...overrides,
  };
}

describe("convertTechnicalDrawingFactsToEstimatorItems", () => {
  it("folds symbol occurrences into extractedItems", () => {
    const out = convertTechnicalDrawingFactsToEstimatorItems(
      facts({ symbolOccurrences: [occ({ roomName: "KUCHYNA" })] })
    );
    expect(out.extractedItems).toHaveLength(1);
    expect(out.extractedItems[0]!.title).toBe("Visiace svietidlo");
    expect(out.extractedItems[0]!.category).toBe("lighting");
  });

  it("promotes legend entries into extractedItems when occurrences are missing", () => {
    const out = convertTechnicalDrawingFactsToEstimatorItems(
      facts({
        legendEntries: [
          {
            id: "l1",
            trade: "electrical",
            symbolLabel: "V1",
            symbolDescription: "Vypínač",
            normalizedType: "switch",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
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
            evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
            confidence: "high",
            needsReview: false,
          },
          {
            id: "l3",
            trade: "electrical",
            symbolLabel: "S1",
            symbolDescription: "Svietidlo",
            normalizedType: "ceiling_light",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
            confidence: "medium",
            needsReview: false,
          },
        ],
        extractedItems: [
          {
            id: "e1",
            category: "other",
            title: "Elektroinštalácia",
            origin: "from_document",
            evidence: [],
            confidence: "low",
            needsReview: true,
          },
        ],
      })
    );
    expect(out.extractedItems.length).toBeGreaterThanOrEqual(3);
    expect(out.extractedItems.some((i) => /Vypínač/i.test(i.title))).toBe(true);
    expect(out.missingQuestions.some((q) => q.id === "q_legend_counts")).toBe(true);
    expect(out.warnings.some((w) => /legend/i.test(w))).toBe(true);
  });

  it("does not lose unknown symbols and moves them to unknownSymbols", () => {
    const out = convertTechnicalDrawingFactsToEstimatorItems(
      facts({
        symbolOccurrences: [
          occ({ id: "u1", normalizedType: "unknown", title: "?", needsReview: true }),
        ],
      })
    );
    expect(out.symbolOccurrences).toHaveLength(0);
    expect(out.unknownSymbols).toHaveLength(1);
    // Unknown symbols are not folded into quotable items.
    expect(out.extractedItems).toHaveLength(0);
  });

  it("builds companyFocus fallback when the model provided none", () => {
    const out = convertTechnicalDrawingFactsToEstimatorItems(
      facts({
        symbolOccurrences: [occ()],
        missingQuestions: [
          {
            id: "q1",
            question: "Dodáva svietidlá zákazník?",
            reason: "",
            importance: "critical",
            blocksFixedQuote: true,
          },
        ],
      })
    );
    expect(out.companyFocus.length).toBeGreaterThan(0);
    expect(out.companyFocus.some((f) => f.focusType === "customer_question")).toBe(true);
  });

  it("does not overwrite existing document rows when folding", () => {
    const out = convertTechnicalDrawingFactsToEstimatorItems(
      facts({
        extractedItems: [
          {
            id: "e1",
            category: "lighting",
            roomName: "KUCHYNA",
            title: "Visiace svietidlo",
            quantity: 2,
            unit: "ks",
            origin: "from_document",
            evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
            confidence: "high",
            needsReview: false,
          },
        ],
        symbolOccurrences: [occ({ roomName: "KUCHYNA" })],
      })
    );
    // Same room+title+qty+unit → no duplicate row added.
    expect(out.extractedItems).toHaveLength(1);
  });

  it("expands switch/socket into box + labor + cable assumption for review", () => {
    const out = convertTechnicalDrawingFactsToEstimatorItems(
      facts({
        symbolOccurrences: [
          occ({
            id: "sw1",
            normalizedType: "switch",
            title: "Vypínač",
            quantity: 3,
            unit: "ks",
            roomName: "CHODBA",
          }),
          occ({
            id: "sk1",
            normalizedType: "socket",
            title: "Zásuvka",
            quantity: 5,
            unit: "ks",
            roomName: "KUCHYNA",
          }),
        ],
      })
    );
    expect(out.extractedItems.some((i) => i.title === "Vypínač")).toBe(true);
    expect(out.extractedItems.some((i) => i.title === "Zásuvka")).toBe(true);
    expect(out.inferredItems.some((i) => /krabica.*vypínač/i.test(i.title))).toBe(true);
    expect(out.inferredItems.some((i) => /krabica.*zásuv/i.test(i.title))).toBe(true);
    const cable = out.inferredItems.find((i) => i.category === "cable");
    expect(cable).toBeTruthy();
    expect(cable!.needsReview).toBe(true);
    expect(cable!.origin).toBe("assumption");
    expect(cable!.quantity == null || cable!.quantity === 0).toBe(true);
    expect(out.inferredItems.some((i) => /Drážkovanie/i.test(i.title))).toBe(true);
    expect(out.inferredItems.some((i) => /rozvádzač/i.test(i.title))).toBe(true);
    expect(out.missingQuestions.some((q) => /kábel|trasa|dĺžk/i.test(q.question))).toBe(true);
  });

  it("promotes missing legend types even when lighting occurrences exist", () => {
    const out = convertTechnicalDrawingFactsToEstimatorItems(
      facts({
        legendEntries: [
          {
            id: "l1",
            trade: "electrical",
            symbolDescription: "Zásuvka",
            normalizedType: "socket",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [],
            confidence: "high",
            needsReview: false,
          },
          {
            id: "l2",
            trade: "electrical",
            symbolDescription: "Vypínač",
            normalizedType: "unknown",
            unit: "ks",
            defaultQuoteCategory: "material_and_labor",
            evidence: [],
            confidence: "high",
            needsReview: false,
          },
        ],
        symbolOccurrences: [occ({ roomName: "KUCHYNA", quantity: 4 })],
      })
    );
    expect(out.extractedItems.some((i) => i.category === "lighting")).toBe(true);
    expect(out.extractedItems.some((i) => /Zásuvka/i.test(i.title))).toBe(true);
    expect(out.extractedItems.some((i) => /Vypínač/i.test(i.title))).toBe(true);
    expect(out.rooms.some((r) => /KUCHYNA/i.test(r.name))).toBe(true);
  });
});

describe("validateEstimatorFacts", () => {
  it("warns when only generic items are present", () => {
    const res = validateEstimatorFacts(
      facts({
        extractedItems: [
          {
            id: "g1",
            category: "other",
            title: "material",
            origin: "from_document",
            evidence: [],
            confidence: "medium",
            needsReview: false,
          },
        ],
      })
    );
    expect(res.warnings.some((w) => w.toLowerCase().includes("všeobecné"))).toBe(true);
  });

  it("marks quote indicative when confidence is low", () => {
    const res = validateEstimatorFacts(facts({ confidence: "low" }));
    expect(res.indicative).toBe(true);
  });

  it("warns about LED strip without quantity and not flagged for review", () => {
    const res = validateEstimatorFacts(
      facts({
        extractedItems: [
          {
            id: "led1",
            category: "led_strip",
            title: "LED pás v SDK",
            origin: "from_document",
            evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
            confidence: "high",
            needsReview: false,
          },
        ],
      })
    );
    expect(res.warnings.some((w) => w.toLowerCase().includes("led"))).toBe(true);
  });

  it("marks indicative when technical drawing has no legend", () => {
    const res = validateEstimatorFacts(
      facts({ detectedDocumentTypes: ["electrical_marking"], legendEntries: [] })
    );
    expect(res.indicative).toBe(true);
  });
});

describe("symbol merge", () => {
  it("keeps same symbol title in different rooms separate and never drops unknowns", () => {
    const merged = mergeEstimatorFactsStrict("s1", [
      facts({
        symbolOccurrences: [
          occ({ id: "a", roomName: "KUCHYNA" }),
          occ({ id: "b", roomName: "SPALNA" }),
        ],
        unknownSymbols: [occ({ id: "u", normalizedType: "unknown", title: "?" })],
      }),
    ]);
    expect(merged.symbolOccurrences).toHaveLength(2);
    expect(merged.unknownSymbols).toHaveLength(1);
  });
});
