import { describe, expect, it } from "vitest";
import {
  buildDrawingTakeoffSummary,
} from "@/lib/takeoff/drawingTakeoffSummary";
import type { DrawingOccurrence } from "@/types/drawingTakeoff";
import type { AiEstimatorFacts, AiExtractedItem, AiLegendEntry } from "@/types/aiEstimator";
import type { EstimatorPosition } from "@/types/estimatorPositions";
import {
  confirmedManualScheduleCount,
  confirmedVisualCount,
  isLegendCountSuccessMetric,
  resolveMvpQuoteGate,
} from "./estimatorMvpTakeoffGate";
import { enrichAiPlanWithEstimatorFacts } from "./enrichPlanWithEstimatorFacts";
import type { AiProjectPlan } from "@/lib/aiProjectSchema";

function facts(partial: Partial<AiEstimatorFacts> = {}): AiEstimatorFacts {
  return {
    inputSummary: "test",
    confidence: "medium",
    rooms: [],
    extractedItems: [],
    inferredItems: [],
    missingQuestions: [],
    risks: [],
    assumptions: [],
    warnings: [],
    detectedDocumentTypes: [],
    ...partial,
  } as AiEstimatorFacts;
}

function legend(n: number): AiLegendEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `l${i}`,
    trade: "electrical",
    symbolDescription: `Symbol ${i}`,
    normalizedType: "socket",
    confidence: "medium",
    needsReview: true,
    evidence: [],
  })) as AiLegendEntry[];
}

function extracted(title: string): AiExtractedItem {
  return {
    id: "e1",
    category: "socket",
    title,
    unit: "ks",
    quantity: 4,
    origin: "from_document",
    confidence: "medium",
    needsReview: true,
    evidence: [],
  } as AiExtractedItem;
}

function occurrence(status: DrawingOccurrence["status"]): DrawingOccurrence {
  return {
    id: "o1",
    projectId: "p1",
    documentId: "d1",
    pageNumber: 1,
    normalizedPosition: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
    trade: "electrical",
    type: "socket",
    label: "Zásuvka",
    source: "manual",
    status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as DrawingOccurrence;
}

describe("estimatorMvpTakeoffGate", () => {
  it("raw legend count does not enable quote", () => {
    const gate = resolveMvpQuoteGate({
      facts: facts({ legendEntries: legend(216), extractedItems: [] }),
      takeoffSummary: buildDrawingTakeoffSummary([]),
    });
    expect(gate.hasConfirmedTakeoff).toBe(false);
    expect(gate.allowFixedQuote).toBe(false);
    expect(gate.reasons).toContain("no_confirmed_takeoff");
    expect(gate.reasons).toContain("ai_only_data");
    expect(isLegendCountSuccessMetric(216)).toBe(false);
  });

  it("AI extracted item does not enable fixed quote", () => {
    const gate = resolveMvpQuoteGate({
      facts: facts({ extractedItems: [extracted("Zásuvka")] }),
      takeoffSummary: buildDrawingTakeoffSummary([]),
    });
    expect(gate.hasConfirmedTakeoff).toBe(false);
    expect(gate.allowFixedQuote).toBe(false);
    expect(gate.reasons).toContain("ai_only_data");
  });

  it("confirmed manual item enables takeoff count", () => {
    const gate = resolveMvpQuoteGate({
      facts: facts({ legendEntries: legend(10) }),
      confirmedRows: [
        {
          id: "m1",
          label: "Zásuvka",
          quantity: 5,
          unit: "ks",
          source: "manual",
          quantityConfirmed: true,
        },
      ],
    });
    expect(confirmedManualScheduleCount(gate.metrics ? [
      {
        id: "m1",
        label: "Zásuvka",
        quantity: 5,
        unit: "ks",
        source: "manual",
        quantityConfirmed: true,
      },
    ] : [])).toBe(1);
    expect(gate.hasConfirmedTakeoff).toBe(true);
    expect(gate.metrics.confirmedItems).toBe(1);
  });

  it("legacy DrawingOccurrence confirmed does NOT enable takeoff by default", () => {
    const summary = buildDrawingTakeoffSummary([occurrence("confirmed")]);
    expect(confirmedVisualCount(summary)).toBe(1);
    const gate = resolveMvpQuoteGate({
      facts: facts(),
      takeoffSummary: summary,
    });
    expect(gate.hasConfirmedTakeoff).toBe(false);
    expect(gate.metrics.confirmedItems).toBe(0);
  });

  it("confirmed EstimatorPosition enables takeoff count", () => {
    const position = {
      id: "pos1",
      positionCode: "E-1",
      label: "Zásuvka",
      category: "socket",
      quantity: 3,
      unit: "ks",
      reviewStatus: "confirmed",
      priceStatus: "priced",
      unitPrice: 12,
      totalPrice: 36,
      quantitySource: "manual",
      evidenceAnchors: [
        {
          id: "a1",
          fileName: "p.pdf",
          page: 1,
          sourceType: "user_confirmed",
          confidence: "high",
          needsReview: false,
          bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
        },
      ],
    } as EstimatorPosition;
    const gate = resolveMvpQuoteGate({
      facts: facts({ legendEntries: legend(20) }),
      positions: [position],
    });
    expect(gate.hasConfirmedTakeoff).toBe(true);
    expect(gate.metrics.confirmedItems).toBe(1);
  });

  it("project/concept creation is allowed with 0 drawing occurrences (gate only blocks fixed quote)", () => {
    const gate = resolveMvpQuoteGate({
      facts: facts({ extractedItems: [extracted("Zásuvka")] }),
      takeoffSummary: buildDrawingTakeoffSummary([]),
    });
    expect(gate.hasConfirmedTakeoff).toBe(false);
    expect(gate.allowFixedQuote).toBe(false);
    // Concept/project CTAs must ignore this — only fixed quote uses allowFixedQuote.
    expect(gate.reasons).toContain("no_confirmed_takeoff");
  });

  it("candidate / needs_review DrawingOccurrence does not unlock quote", () => {
    const summary = buildDrawingTakeoffSummary([occurrence("needs_review")]);
    const gate = resolveMvpQuoteGate({
      facts: facts(),
      takeoffSummary: summary,
      includeLegacyDrawingOccurrences: true,
    });
    expect(gate.hasConfirmedTakeoff).toBe(false);
    expect(gate.reasons).toContain("candidates_unconfirmed");
  });

  it("price_missing blocks fixed quote even with confirmed takeoff", () => {
    const gate = resolveMvpQuoteGate({
      facts: facts(),
      confirmedRows: [
        {
          id: "m1",
          label: "Zásuvka",
          quantity: 2,
          unit: "ks",
          source: "manual",
          quantityConfirmed: true,
        },
      ],
      priceMissingCount: 3,
    });
    expect(gate.hasConfirmedTakeoff).toBe(true);
    expect(gate.allowFixedQuote).toBe(false);
    expect(gate.reasons).toContain("price_missing");
    expect(gate.preliminaryOnly).toBe(true);
  });

  it("EstimatorPosition with pending similar candidates does not allow fixed quote", () => {
    const position = {
      id: "pos1",
      positionCode: "E-1",
      label: "Svetlo",
      category: "lighting",
      quantity: 1,
      unit: "ks",
      reviewStatus: "confirmed",
      priceStatus: "priced",
      unitPrice: 10,
      totalPrice: 10,
      quantitySource: "manual",
      evidenceAnchors: [
        {
          id: "sim_abc",
          fileName: "p.pdf",
          page: 1,
          sourceType: "visual_detection",
          confidence: "medium",
          needsReview: true,
          bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
        },
      ],
    } as EstimatorPosition;
    const gate = resolveMvpQuoteGate({
      facts: facts(),
      positions: [position],
    });
    expect(gate.reasons).toContain("candidates_unconfirmed");
    expect(gate.allowFixedQuote).toBe(false);
  });

  it("does not auto-enrich plan materials from legend/AI facts", () => {
    const plan: AiProjectPlan = {
      summary: "Classic",
      phases: [],
      materialSuggestions: [{ name: "Keep me", confidence: "high" }],
    } as AiProjectPlan;
    const out = enrichAiPlanWithEstimatorFacts(
      plan,
      facts({
        legendEntries: legend(50),
        extractedItems: [extracted("AI socket"), extracted("AI light")],
      })
    );
    expect(out.materialSuggestions).toHaveLength(1);
    expect(out.materialSuggestions?.[0]?.name).toBe("Keep me");
  });

  it("review labels must not treat legend count as drawing count success", () => {
    expect(isLegendCountSuccessMetric(216)).toBe(false);
    const gate = resolveMvpQuoteGate({
      facts: facts({ legendEntries: legend(216) }),
    });
    expect(gate.metrics.confirmedItems).toBe(0);
  });
});
