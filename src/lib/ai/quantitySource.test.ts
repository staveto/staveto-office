import { describe, expect, it } from "vitest";
import {
  applyManualQuantityOverride,
  buildSymbolCountComparisonRows,
  getSymbolCountingSummary,
  resolveQuantitySource,
  resolveQuoteReadiness,
} from "./quantitySource";
import {
  createUnavailableSymbolCounting,
  estimateSymbolOccurrences,
  summarizeSymbolCounting,
} from "./symbolOccurrenceService";
import type { AiEstimatorFacts, AiExtractedItem } from "@/types/aiEstimator";

function item(partial: Partial<AiExtractedItem> & Pick<AiExtractedItem, "id" | "title">): AiExtractedItem {
  return {
    category: "socket",
    origin: "from_document",
    evidence: [],
    confidence: "medium",
    needsReview: false,
    ...partial,
  };
}

function facts(partial: Partial<AiEstimatorFacts>): AiEstimatorFacts {
  return {
    sessionId: "s1",
    detectedDocumentTypes: ["electrical_marking"],
    inputSummary: "test",
    rooms: [],
    extractedItems: [],
    inferredItems: [],
    missingQuestions: [],
    risks: [],
    confidence: "medium",
    warnings: [],
    ...partial,
  };
}

describe("quantitySource", () => {
  it("does not treat legend/schedule rows as drawing_detection", () => {
    expect(
      resolveQuantitySource(
        item({ id: "1", title: "Zásuvka", quantity: 4, origin: "from_document" })
      )
    ).toBe("schedule");
    expect(
      resolveQuantitySource(
        item({ id: "2", title: "Zásuvka", origin: "from_document", needsReview: true })
      )
    ).toBe("legend");
    expect(
      resolveQuantitySource(
        item({
          id: "3",
          title: "Zásuvka",
          detectedOccurrenceCount: 4,
          quantitySource: "drawing_detection",
        })
      )
    ).toBe("drawing_detection");
  });

  it("marks drawing counting unavailable when no real detections exist", () => {
    const summary = getSymbolCountingSummary(
      facts({
        legendEntries: [],
        symbolOccurrences: [
          {
            id: "o1",
            page: 1,
            normalizedType: "socket",
            title: "Zásuvka",
            quantity: 2,
            origin: "from_document",
            evidence: [],
            confidence: "medium",
            needsReview: false,
          },
        ],
      })
    );
    expect(summary.drawingDetectionAvailable).toBe(false);
    expect(summary.status).toBe("unavailable");
  });

  it("comparison rows leave drawing count null when detection unavailable", () => {
    const rows = buildSymbolCountComparisonRows(
      facts({
        extractedItems: [
          item({
            id: "1",
            title: "EL.zásuvka",
            roomName: "Kuchyňa",
            quantity: 2,
            unit: "ks",
            symbolCode: "EL.zásuvka",
          }),
        ],
        symbolCounting: createUnavailableSymbolCounting([]),
      })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantityFromSchedule).toBe(2);
    expect(rows[0]!.detectedOccurrenceCount).toBeNull();
    expect(rows[0]!.status).toBe("needs_confirm");
  });

  it("manual override sets source manual and readiness can become ready", () => {
    const base = item({
      id: "1",
      title: "Zásuvka",
      quantity: 2,
      needsReview: true,
      reviewReason: "check",
    });
    const manual = applyManualQuantityOverride(base, { quantity: 3, roomName: "Kuchyňa" });
    expect(manual.quantitySource).toBe("manual");
    expect(manual.quantity).toBe(3);
    expect(manual.needsReview).toBe(false);

    const f = facts({
      extractedItems: [manual],
      symbolCounting: {
        status: "unavailable",
        drawingDetectionAvailable: false,
        detections: [],
      },
    });
    // Still partially ready without drawing detection for critical symbols unless all manual
    const rows = buildSymbolCountComparisonRows(f);
    const readiness = resolveQuoteReadiness({
      facts: f,
      criticalQuestionCount: 0,
      comparisonRows: rows,
    });
    expect(readiness.state).toBe("ready");
  });

  it("partially ready when schedule exists but drawing detection missing", () => {
    const f = facts({
      extractedItems: [
        item({ id: "1", title: "Zásuvka", quantity: 4, unit: "ks" }),
      ],
      symbolCounting: createUnavailableSymbolCounting([]),
    });
    const rows = buildSymbolCountComparisonRows(f);
    const readiness = resolveQuoteReadiness({
      facts: f,
      criticalQuestionCount: 0,
      comparisonRows: rows,
    });
    expect(readiness.state).toBe("partially_ready");
    expect(readiness.warning).toMatch(/orientačne|výkrese/i);
  });
});

describe("estimateSymbolOccurrences placeholder", () => {
  it("returns null counts and never invents numbers", async () => {
    const result = await estimateSymbolOccurrences({
      documentPageImage: "data:image/png;base64,aaa",
      legendItems: [
        {
          id: "l1",
          symbolLabel: "EL.zásuvka",
          symbolDescription: "Zásuvka",
          normalizedType: "socket",
          unit: "ks",
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.detectedOccurrenceCount).toBeNull();
    expect(result[0]!.source).toBe("unknown");
    const summary = summarizeSymbolCounting(result);
    expect(summary.drawingDetectionAvailable).toBe(false);
  });
});
