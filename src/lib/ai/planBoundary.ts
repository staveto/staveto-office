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

/** Heuristic title/legend strips when exact regions are unknown. */
export function defaultLegendTitleRegions(): EstimatorPositionBBox[] {
  return [
    { x: 0, y: 0, width: 1, height: 0.055 },
    { x: 0, y: 0.93, width: 1, height: 0.07 },
  ];
}

/**
 * Classify a click in normalized (stored/displayed) page coordinates.
 * Without known legend/table regions, uses default title/legend strips.
 */
export function classifyPlanClick(
  normalized: { x: number; y: number },
  options?: {
    legendRegions?: EstimatorPositionBBox[];
    tableRegions?: EstimatorPositionBBox[];
    /** Margin outside [0,1] before calling outside_plan (default 0.02). */
    outsideMargin?: number;
    /** When true (default), apply heuristic title/legend strips. */
    useDefaultLegendStrips?: boolean;
  }
): PlanBoundaryResult {
  const margin = options?.outsideMargin ?? 0.02;
  const legendRegions = [
    ...(options?.useDefaultLegendStrips === false
      ? []
      : defaultLegendTitleRegions()),
    ...(options?.legendRegions ?? []),
  ];

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

  for (const region of legendRegions) {
    if (pointInBbox(normalized, region)) {
      return {
        status: "in_legend_or_table",
        confidence: "high",
        excludeFromTakeoff: true,
        needsReview: true,
      };
    }
  }
  for (const region of options?.tableRegions ?? []) {
    if (pointInBbox(normalized, region)) {
      return {
        status: "in_legend_or_table",
        confidence: "high",
        excludeFromTakeoff: true,
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
