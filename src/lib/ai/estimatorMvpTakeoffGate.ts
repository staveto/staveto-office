/**
 * MVP takeoff / quote gate for AI Estimator review.
 * AI legend + extracted items never unlock a fixed quote.
 * Only user-confirmed visual / manual / schedule rows count.
 */

import type { DrawingTakeoffSummary } from "@/lib/takeoff/drawingTakeoffSummary";
import type { AiExtractedItem, AiEstimatorFacts } from "@/types/aiEstimator";
import {
  isPositionFixedQuoteEligible,
  isSimilarCandidateAnchor,
  positionsBlockFixedQuote,
} from "@/lib/ai/estimatorPositions";
import type { EstimatorPosition } from "@/types/estimatorPositions";

/** Local manual / schedule row confirmed on the review screen (session UI). */
export type MvpConfirmedTakeoffRow = {
  id: string;
  label: string;
  category?: string;
  quantity: number;
  unit: string;
  roomName?: string;
  unitPrice?: number;
  source: "manual" | "schedule";
  /** User confirmed quantity for quote. */
  quantityConfirmed: boolean;
};

export type MvpTakeoffMetrics = {
  confirmedItems: number;
  needsReview: number;
  priceMissing: number;
  usedInQuote: number;
};

export type MvpQuoteGate = {
  /** Confirmed takeoff exists — estimate/quote CTAs may proceed (possibly preliminary). */
  hasConfirmedTakeoff: boolean;
  /** True only when takeoff is confirmed and no hard blockers for a fixed quote. */
  allowFixedQuote: boolean;
  preliminaryOnly: boolean;
  reasons: string[];
  metrics: MvpTakeoffMetrics;
};

export function confirmedVisualCount(
  summary: DrawingTakeoffSummary | null | undefined
): number {
  if (!summary) return 0;
  return summary.countedOnDrawing;
}

export function confirmedManualScheduleCount(rows: MvpConfirmedTakeoffRow[]): number {
  return rows.filter((r) => r.quantityConfirmed && r.quantity > 0).length;
}

function similarCandidatesPending(p: EstimatorPosition): boolean {
  return p.evidenceAnchors.some((a) => isSimilarCandidateAnchor(a));
}

export function confirmedEstimatorPositionsCount(positions: EstimatorPosition[]): number {
  return positions.filter(
    (p) =>
      p.reviewStatus === "confirmed" &&
      p.quantity > 0 &&
      !similarCandidatesPending(p)
  ).length;
}

export function buildMvpTakeoffMetrics(input: {
  /** @deprecated Legacy DrawingOccurrence — ignored for confirmed takeoff count. */
  takeoffSummary?: DrawingTakeoffSummary | null;
  confirmedRows?: MvpConfirmedTakeoffRow[];
  positions?: EstimatorPosition[];
  reviewPendingCount?: number;
  priceMissingCount?: number;
  /**
   * When false (default for AI wizard), DrawingOccurrence counts do NOT
   * contribute to confirmed takeoff — only manual/schedule + EstimatorPosition.
   */
  includeLegacyDrawingOccurrences?: boolean;
}): MvpTakeoffMetrics {
  const includeLegacy = input.includeLegacyDrawingOccurrences === true;
  const visual = includeLegacy ? confirmedVisualCount(input.takeoffSummary) : 0;
  const manual = confirmedManualScheduleCount(input.confirmedRows ?? []);
  const fromPositions = confirmedEstimatorPositionsCount(input.positions ?? []);
  const usedInQuote = includeLegacy
    ? (input.takeoffSummary?.usedInQuoteCount ?? 0)
    : (input.positions ?? []).filter((p) => p.reviewStatus === "confirmed").length > 0
      ? fromPositions
      : 0;
  const candidatePending = (input.positions ?? []).reduce(
    (n, p) => n + p.evidenceAnchors.filter((a) => isSimilarCandidateAnchor(a)).length,
    0
  );
  const legacyReview = includeLegacy
    ? (input.takeoffSummary?.needsReviewCount ?? 0)
    : 0;
  const needsReview =
    legacyReview + (input.reviewPendingCount ?? 0) + candidatePending;
  return {
    confirmedItems: visual + manual + fromPositions,
    needsReview,
    priceMissing: input.priceMissingCount ?? 0,
    usedInQuote,
  };
}

/**
 * Fixed / non-preliminary quote path.
 * - raw legendEntries do not count
 * - AI extractedItems do not count
 * - visual candidates do not count
 * - only confirmed visual / manual / schedule / EstimatorPosition counts
 */
export function resolveMvpQuoteGate(input: {
  facts: AiEstimatorFacts;
  takeoffSummary?: DrawingTakeoffSummary | null;
  confirmedRows?: MvpConfirmedTakeoffRow[];
  positions?: EstimatorPosition[];
  priceMissingCount?: number;
  reviewPendingCount?: number;
  criticalQuestionCount?: number;
  /** Default false — legacy /takeoff DrawingOccurrence must not unlock quote. */
  includeLegacyDrawingOccurrences?: boolean;
}): MvpQuoteGate {
  const reasons: string[] = [];
  const includeLegacy = input.includeLegacyDrawingOccurrences === true;
  const metrics = buildMvpTakeoffMetrics({
    takeoffSummary: input.takeoffSummary,
    confirmedRows: input.confirmedRows,
    positions: input.positions,
    reviewPendingCount: input.reviewPendingCount,
    priceMissingCount: input.priceMissingCount,
    includeLegacyDrawingOccurrences: includeLegacy,
  });

  const hasConfirmedTakeoff = metrics.confirmedItems > 0;

  if (!hasConfirmedTakeoff) {
    reasons.push("no_confirmed_takeoff");
    if (
      (input.facts.legendEntries?.length ?? 0) > 0 ||
      (input.facts.extractedItems?.length ?? 0) > 0 ||
      (input.facts.inferredItems?.length ?? 0) > 0
    ) {
      reasons.push("ai_only_data");
    }
  }

  if ((input.criticalQuestionCount ?? 0) > 0) {
    reasons.push("items_need_review");
  }

  // Legacy drawing candidates only matter when explicitly included.
  if (includeLegacy && (input.takeoffSummary?.needsReviewCount ?? 0) > 0) {
    reasons.push("candidates_unconfirmed");
  }

  if (input.positions?.some((p) => similarCandidatesPending(p))) {
    reasons.push("candidates_unconfirmed");
  }

  if ((input.priceMissingCount ?? 0) > 0) {
    reasons.push("price_missing");
  }

  if (input.positions && input.positions.length > 0) {
    const safety = positionsBlockFixedQuote(input.positions);
    if (safety.blocked) {
      if (safety.reasons.some((r) => /cena|price/i.test(r))) {
        reasons.push("price_missing");
      }
      if (safety.reasons.some((r) => /kontrol|review/i.test(r))) {
        reasons.push("items_need_review");
      }
      if (safety.reasons.some((r) => /kandidát|candidate/i.test(r))) {
        reasons.push("candidates_unconfirmed");
      }
    }
  }

  const uniqueReasons = [...new Set(reasons)];

  // Fixed quote: confirmed takeoff + no price/candidate/critical blockers
  const hardBlockers = uniqueReasons.filter((r) =>
    ["no_confirmed_takeoff", "price_missing", "candidates_unconfirmed", "items_need_review"].includes(
      r
    )
  );
  const allowFixedQuote =
    hasConfirmedTakeoff &&
    !uniqueReasons.includes("price_missing") &&
    !uniqueReasons.includes("candidates_unconfirmed") &&
    (input.criticalQuestionCount ?? 0) === 0 &&
    (input.positions?.length
      ? input.positions.some(isPositionFixedQuoteEligible) &&
        !positionsBlockFixedQuote(input.positions).blocked
      : !uniqueReasons.includes("items_need_review"));

  return {
    hasConfirmedTakeoff,
    allowFixedQuote,
    preliminaryOnly: !allowFixedQuote,
    reasons: uniqueReasons.length ? uniqueReasons : hardBlockers,
    metrics,
  };
}

/** Legend count is never a success KPI. */
export function isLegendCountSuccessMetric(_count: number): false {
  return false;
}

/** AI suggestions for review only — never auto-trusted takeoff. */
export function estimatorFactsAsReviewSuggestions(
  facts: AiEstimatorFacts
): AiExtractedItem[] {
  return [...facts.extractedItems, ...facts.inferredItems].filter(
    (i) => i.included !== false && i.origin !== "missing"
  );
}
