/**
 * Drawing takeoff summary for proposal / quote-precheck UI.
 *
 * Distinguishes legend/schedule AI extraction from real marks counted on the
 * PDF via Plan Takeoff Workbench (drawingOccurrences).
 */

import type { DrawingOccurrence, OccurrenceSource } from "@/types/drawingTakeoff";

export type VisualTakeoffStatus =
  | "not_started"
  | "in_progress"
  | "needs_review"
  | "verified"
  | "skipped_manual";

export type DrawingTakeoffSummary = {
  totalOccurrences: number;
  confirmedCount: number;
  needsReviewCount: number;
  rejectedCount: number;
  usedInQuoteCount: number;
  manualCount: number;
  similarDetectedCount: number;
  aiDetectedCount: number;
  /** Confirmed + used_in_quote — what "Spočítané vo výkrese" must show. */
  countedOnDrawing: number;
  groupedByTrade: Record<string, number>;
  groupedByType: Record<string, number>;
  hasVisualTakeoff: boolean;
  takeoffStatus: VisualTakeoffStatus;
};

function countSource(
  occurrences: DrawingOccurrence[],
  source: OccurrenceSource
): number {
  return occurrences.filter((o) => o.source === source).length;
}

/**
 * Pure summary from occurrence list (+ optional project-level skip flag).
 * `skippedManual` wins when the user explicitly continued without drawing review.
 */
export function buildDrawingTakeoffSummary(
  occurrences: DrawingOccurrence[],
  options?: { skippedManual?: boolean }
): DrawingTakeoffSummary {
  if (options?.skippedManual) {
    return {
      totalOccurrences: occurrences.length,
      confirmedCount: 0,
      needsReviewCount: 0,
      rejectedCount: 0,
      usedInQuoteCount: 0,
      manualCount: countSource(occurrences, "manual"),
      similarDetectedCount: countSource(occurrences, "similar_symbol_detected"),
      aiDetectedCount: countSource(occurrences, "ai_detected"),
      countedOnDrawing: 0,
      groupedByTrade: {},
      groupedByType: {},
      hasVisualTakeoff: occurrences.length > 0,
      takeoffStatus: "skipped_manual",
    };
  }

  const active = occurrences.filter((o) => o.status !== "rejected");
  const confirmed = occurrences.filter((o) => o.status === "confirmed");
  const needsReview = occurrences.filter(
    (o) => o.status === "needs_review" || o.status === "draft"
  );
  const rejected = occurrences.filter((o) => o.status === "rejected");
  const usedInQuote = occurrences.filter((o) => o.status === "used_in_quote");
  const countedOnDrawing = confirmed.length + usedInQuote.length;

  const groupedByTrade: Record<string, number> = {};
  const groupedByType: Record<string, number> = {};
  for (const o of active) {
    groupedByTrade[o.trade] = (groupedByTrade[o.trade] ?? 0) + 1;
    groupedByType[o.type] = (groupedByType[o.type] ?? 0) + 1;
  }

  let takeoffStatus: VisualTakeoffStatus;
  if (occurrences.length === 0) {
    takeoffStatus = "not_started";
  } else if (needsReview.length > 0) {
    takeoffStatus = "needs_review";
  } else if (countedOnDrawing > 0) {
    takeoffStatus = "verified";
  } else {
    takeoffStatus = "in_progress";
  }

  return {
    totalOccurrences: occurrences.length,
    confirmedCount: confirmed.length,
    needsReviewCount: needsReview.length,
    rejectedCount: rejected.length,
    usedInQuoteCount: usedInQuote.length,
    manualCount: countSource(occurrences, "manual"),
    similarDetectedCount: countSource(occurrences, "similar_symbol_detected"),
    aiDetectedCount: countSource(occurrences, "ai_detected"),
    countedOnDrawing,
    groupedByTrade,
    groupedByType,
    hasVisualTakeoff: occurrences.length > 0,
    takeoffStatus,
  };
}

export type TakeoffPrimaryCta =
  | "start_visual"
  | "finish_review"
  | "continue_quote"
  | "manual_offer";

/** Primary CTA for the proposal-review card when a PDF drawing is present. */
export function primaryCtaForTakeoff(summary: DrawingTakeoffSummary): TakeoffPrimaryCta {
  switch (summary.takeoffStatus) {
    case "not_started":
      return "start_visual";
    case "needs_review":
    case "in_progress":
      return "finish_review";
    case "verified":
      return "continue_quote";
    case "skipped_manual":
      return "manual_offer";
  }
}

/** Quote create should stay secondary while drawing review is incomplete. */
export function isQuoteCreateSecondary(
  hasPdf: boolean,
  summary: DrawingTakeoffSummary
): boolean {
  if (!hasPdf) return false;
  return (
    summary.takeoffStatus === "not_started" ||
    summary.takeoffStatus === "needs_review" ||
    summary.takeoffStatus === "in_progress"
  );
}
