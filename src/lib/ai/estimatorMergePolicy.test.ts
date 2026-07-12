import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  extractedItemDedupeKey,
  mergeEstimatorFactsStrict,
} from "../../../functions/src/estimator/estimatorMerge";
import { splitPdfIntoPages } from "../../../functions/src/estimator/pdfPageSplit";
import type { EstimatorFactsPayload } from "../../../functions/src/estimator/estimatorSchema";

function emptyFacts(overrides: Partial<EstimatorFactsPayload> = {}): EstimatorFactsPayload {
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
    ...overrides,
  };
}

describe("estimatorMergePolicy", () => {
  it("keeps LED strips in different rooms separate", () => {
    const a = emptyFacts({
      extractedItems: [
        {
          id: "1",
          category: "led_strip",
          roomName: "KUCHYNA",
          title: "LED pás v SDK",
          quantity: 4,
          unit: "m",
          origin: "from_document",
          evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
          confidence: "high",
          needsReview: false,
        },
        {
          id: "2",
          category: "led_strip",
          roomName: "SPALNA",
          title: "LED pás v SDK",
          quantity: 4,
          unit: "m",
          origin: "from_document",
          evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" }],
          confidence: "high",
          needsReview: false,
        },
      ],
    });
    const merged = mergeEstimatorFactsStrict("s1", [a]);
    expect(merged.extractedItems).toHaveLength(2);
  });

  it("keeps same title with different lengths separate", () => {
    const items = [
      {
        id: "1",
        category: "led_strip" as const,
        roomName: "KUCHYNA",
        title: "LED pás v svetelnej lište",
        quantity: 3.2,
        unit: "m" as const,
        origin: "from_document" as const,
        evidence: [{ fileName: "plan.pdf", page: 2, inputType: "pdf" as const }],
        confidence: "high" as const,
        needsReview: false,
      },
      {
        id: "2",
        category: "led_strip" as const,
        roomName: "KUCHYNA",
        title: "LED pás v svetelnej lište",
        quantity: 5.5,
        unit: "m" as const,
        origin: "from_document" as const,
        evidence: [{ fileName: "plan.pdf", page: 2, inputType: "pdf" as const }],
        confidence: "high" as const,
        needsReview: false,
      },
    ];
    expect(extractedItemDedupeKey(items[0]!)).not.toBe(extractedItemDedupeKey(items[1]!));
    const merged = mergeEstimatorFactsStrict("s1", [emptyFacts({ extractedItems: items })]);
    expect(merged.extractedItems).toHaveLength(2);
  });

  it("dedupes only exact title+room+qty+unit+source", () => {
    const row = {
      id: "1",
      category: "lighting" as const,
      roomName: "VSTUP",
      title: "Visiace svietidlo",
      quantity: 2,
      unit: "ks" as const,
      origin: "from_document" as const,
      evidence: [{ fileName: "plan.pdf", page: 1, inputType: "pdf" as const }],
      confidence: "high" as const,
      needsReview: false,
    };
    const merged = mergeEstimatorFactsStrict("s1", [
      emptyFacts({ extractedItems: [row] }),
      emptyFacts({ extractedItems: [{ ...row, id: "dup" }] }),
    ]);
    expect(merged.extractedItems).toHaveLength(1);
  });

  it("does not merge inferred into extracted", () => {
    const merged = mergeEstimatorFactsStrict("s1", [
      emptyFacts({
        extractedItems: [
          {
            id: "e1",
            category: "cable",
            title: "CYKY 3x1,5",
            origin: "from_document",
            evidence: [{ fileName: "plan.pdf", inputType: "pdf" }],
            confidence: "medium",
            needsReview: true,
          },
        ],
        inferredItems: [
          {
            id: "i1",
            category: "cable",
            title: "CYKY 3x1,5",
            origin: "inferred",
            evidence: [{ fileName: "plan.pdf", inputType: "pdf" }],
            confidence: "low",
            needsReview: true,
          },
        ],
      }),
    ]);
    expect(merged.extractedItems).toHaveLength(1);
    expect(merged.inferredItems).toHaveLength(1);
  });
});

describe("pdfPageSplit", () => {
  it("splits a multi-page PDF into single-page buffers", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    doc.addPage();
    const bytes = Buffer.from(await doc.save());
    const split = await splitPdfIntoPages(bytes, "08_Znacenie_elektrika.pdf");
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.pageCount).toBe(3);
    expect(split.pages).toHaveLength(3);
    expect(split.pages[0]!.pageNumber).toBe(1);
    expect(split.pages[0]!.fileName).toContain("_p1.pdf");
  });
});
