/**
 * Plan boundary classification for PDF marking clicks.
 * Conservative: only exclude takeoff when clearly outside the rendered page.
 */

import type { EstimatorPositionBBox } from "@/types/estimatorPositions";

export type PlanBoundaryStatus =
  | "inside_plan"
  | "outside_plan"
  | "in_legend_or_table"
  | "boundary_uncertain";

export type PlanBoundaryResult = {
  status: PlanBoundaryStatus;
  confidence: "high" | "low";
  /** True only when mark must be excluded from takeoff. */
  excludeFromTakeoff: boolean;
  needsReview: boolean;
};

function pointInBbox(
  p: { x: number; y: number },
  b: EstimatorPositionBBox
): boolean {
  return (
    p.x >= b.x &&
    p.x <= b.x + b.width &&
    p.y >= b.y &&
    p.y <= b.y + b.height
  );
}

/**
 * Classify a click in normalized (stored/displayed) page coordinates.
 * Without known legend/table regions, never marks inside visible page as outside_plan.
 */
export function classifyPlanClick(
  normalized: { x: number; y: number },
  options?: {
    legendRegions?: EstimatorPositionBBox[];
    tableRegions?: EstimatorPositionBBox[];
    /** Margin outside [0,1] before calling outside_plan (default 0.02). */
    outsideMargin?: number;
  }
): PlanBoundaryResult {
  const margin = options?.outsideMargin ?? 0.02;

  if (
    normalized.x < -margin ||
    normalized.y < -margin ||
    normalized.x > 1 + margin ||
    normalized.y > 1 + margin
  ) {
    return {
      status: "outside_plan",
      confidence: "high",
      excludeFromTakeoff: true,
      needsReview: true,
    };
  }

  for (const region of options?.legendRegions ?? []) {
    if (pointInBbox(normalized, region)) {
      return {
        status: "in_legend_or_table",
        confidence: "high",
        excludeFromTakeoff: false,
        needsReview: true,
      };
    }
  }
  for (const region of options?.tableRegions ?? []) {
    if (pointInBbox(normalized, region)) {
      return {
        status: "in_legend_or_table",
        confidence: "high",
        excludeFromTakeoff: false,
        needsReview: true,
      };
    }
  }

  const nearEdge =
    normalized.x < 0.02 ||
    normalized.y < 0.02 ||
    normalized.x > 0.98 ||
    normalized.y > 0.98;

  if (nearEdge) {
    return {
      status: "boundary_uncertain",
      confidence: "low",
      excludeFromTakeoff: false,
      needsReview: true,
    };
  }

  return {
    status: "inside_plan",
    confidence: "high",
    excludeFromTakeoff: false,
    needsReview: false,
  };
}
