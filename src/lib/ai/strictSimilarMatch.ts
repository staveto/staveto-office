/**
 * Strict post-filter for "Nájsť rovnaké" — geometry + score bands.
 * Rejects loose color-only / line / oversized false positives.
 */

import type { EstimatorPositionBBox } from "@/types/estimatorPositions";
import { classifyPlanClick, defaultLegendTitleRegions } from "./planBoundary";

export const SIMILAR_ACCEPTED_MIN = 0.85;
export const SIMILAR_UNCERTAIN_MIN = 0.65;
export const SIMILAR_MAX_ACCEPTED_VISIBLE = 20;

export type SimilarMatchBand = "accepted" | "uncertain" | "rejected";

export type StrictSimilarHit = {
  matchScore: number;
  page: number;
  bbox: EstimatorPositionBBox;
};

export type StrictSimilarBuckets<T extends StrictSimilarHit> = {
  accepted: T[];
  uncertain: T[];
  rejected: T[];
};

/** Aspect ratio of a normalized bbox (width/height). */
export function bboxAspect(b: EstimatorPositionBBox): number {
  const w = Math.max(1e-6, b.width);
  const h = Math.max(1e-6, b.height);
  return w / h;
}

export function bboxArea(b: EstimatorPositionBBox): number {
  return Math.max(0, b.width) * Math.max(0, b.height);
}

/** Thin long stroke — dimension lines / walls fragments. */
export function isLongLineBbox(b: EstimatorPositionBBox, maxAspect = 5.5): boolean {
  const aspect = Math.max(b.width, b.height) / Math.max(1e-6, Math.min(b.width, b.height));
  return aspect > maxAspect && Math.max(b.width, b.height) >= 0.035;
}

/** Tiny ink speck / text fragment. */
export function isTinyFragment(b: EstimatorPositionBBox): boolean {
  return bboxArea(b) < 0.000012 || Math.max(b.width, b.height) < 0.004;
}

/** Oversized blob (room fill / wall block). */
export function isOversizedBlob(b: EstimatorPositionBBox, ref: EstimatorPositionBBox): boolean {
  const areaRatio = bboxArea(b) / Math.max(1e-9, bboxArea(ref));
  return areaRatio > 3.2 || Math.max(b.width, b.height) > Math.max(ref.width, ref.height) * 2.8;
}

export { defaultLegendTitleRegions };

export function isInLegendOrTitleArea(bbox: EstimatorPositionBBox): boolean {
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const hit = classifyPlanClick(
    { x: cx, y: cy },
    { legendRegions: defaultLegendTitleRegions(), useDefaultLegendStrips: false }
  );
  return hit.status === "in_legend_or_table" || hit.excludeFromTakeoff;
}

/**
 * Classify one NCC hit vs a confirmed template bbox.
 * Requires template similarity score AND geometric agreement.
 */
export function classifyStrictSimilarHit(
  reference: EstimatorPositionBBox,
  hit: StrictSimilarHit
): SimilarMatchBand {
  if (hit.matchScore < SIMILAR_UNCERTAIN_MIN) return "rejected";
  if (isLongLineBbox(hit.bbox)) return "rejected";
  if (isTinyFragment(hit.bbox)) return "rejected";
  if (isOversizedBlob(hit.bbox, reference)) return "rejected";
  if (isInLegendOrTitleArea(hit.bbox)) return "rejected";

  const aspectRef = bboxAspect(reference);
  const aspectHit = bboxAspect(hit.bbox);
  const aspectRatio =
    Math.max(aspectRef, aspectHit) / Math.max(1e-6, Math.min(aspectRef, aspectHit));
  if (aspectRatio > 1.75) return "rejected";

  const areaRatio =
    bboxArea(hit.bbox) / Math.max(1e-9, bboxArea(reference));
  if (areaRatio > 2.4 || areaRatio < 1 / 2.4) return "rejected";

  // Size must be similar — loose color-only matches with wrong size fail here.
  const maxSideRef = Math.max(reference.width, reference.height);
  const maxSideHit = Math.max(hit.bbox.width, hit.bbox.height);
  const sideRatio =
    Math.max(maxSideRef, maxSideHit) / Math.max(1e-6, Math.min(maxSideRef, maxSideHit));
  if (sideRatio > 2.1) return "rejected";

  if (
    hit.matchScore >= SIMILAR_ACCEPTED_MIN &&
    aspectRatio <= 1.45 &&
    areaRatio >= 1 / 1.9 &&
    areaRatio <= 1.9
  ) {
    return "accepted";
  }
  if (hit.matchScore >= SIMILAR_UNCERTAIN_MIN) return "uncertain";
  return "rejected";
}

export function bucketStrictSimilarHits<T extends StrictSimilarHit>(
  reference: EstimatorPositionBBox,
  hits: T[],
  options?: { maxAccepted?: number }
): StrictSimilarBuckets<T> {
  const maxAccepted = options?.maxAccepted ?? SIMILAR_MAX_ACCEPTED_VISIBLE;
  const accepted: T[] = [];
  const uncertain: T[] = [];
  const rejected: T[] = [];
  const ranked = [...hits].sort((a, b) => b.matchScore - a.matchScore);
  for (const hit of ranked) {
    const band = classifyStrictSimilarHit(reference, hit);
    if (band === "accepted") {
      if (accepted.length < maxAccepted) accepted.push(hit);
      else rejected.push(hit);
    } else if (band === "uncertain") uncertain.push(hit);
    else rejected.push(hit);
  }
  return { accepted, uncertain, rejected };
}
