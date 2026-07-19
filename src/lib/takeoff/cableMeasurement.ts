/**
 * Cable route measurement — pure math (no Firestore, no DOM).
 *
 * All points are normalized 0..1 page fractions (page-space, unrotated).
 * Real distances derive from the page size in PDF points + the page's scale
 * calibration (metersPerPdfPoint). Without a calibration every meter-valued
 * computation returns null — a missing scale must never produce a fake
 * length that silently ends up in a quote.
 */

import type {
  CableInstallationType,
  CableRun,
  DrawingScaleCalibration,
  NormalizedPoint,
  TakeoffItem,
} from "@/types/pdfTakeoff";

export const CABLE_RUN_DEFAULTS = {
  cableTypeName: "CYKY-J 3x2,5",
  installationType: "groove" as CableInstallationType,
  reservePercent: 10,
  fixedReserveM: 0,
  verticalLengthM: 0,
  roundingStepM: 1,
} as const;

/** Built-in cable type suggestions used when no catalog item is picked. */
export const DEFAULT_CABLE_TYPE_NAMES = [
  "CYKY-J 3x1,5",
  "CYKY-J 3x2,5",
  "CYKY-J 5x2,5",
  "UTP CAT6",
  "LED kábel",
] as const;

/** Distance between two normalized points, in PDF points. */
export function distanceBetweenNormalizedPointsPt(
  a: NormalizedPoint,
  b: NormalizedPoint,
  pageWidthPt: number,
  pageHeightPt: number
): number {
  const dxPt = (b.x - a.x) * pageWidthPt;
  const dyPt = (b.y - a.y) * pageHeightPt;
  return Math.sqrt(dxPt * dxPt + dyPt * dyPt);
}

/**
 * Calibration math for two user-picked points and a known real length.
 * Returns null for degenerate inputs (zero distance / non-positive length)
 * so the caller can show "pick two different points" instead of storing a
 * division by zero.
 */
export function computeScaleCalibration(input: {
  pointA: NormalizedPoint;
  pointB: NormalizedPoint;
  pageWidthPt: number;
  pageHeightPt: number;
  realLengthM: number;
}): { pdfDistancePt: number; metersPerPdfPoint: number } | null {
  const pdfDistancePt = distanceBetweenNormalizedPointsPt(
    input.pointA,
    input.pointB,
    input.pageWidthPt,
    input.pageHeightPt
  );
  if (!(pdfDistancePt > 0) || !(input.realLengthM > 0)) return null;
  return { pdfDistancePt, metersPerPdfPoint: input.realLengthM / pdfDistancePt };
}

/**
 * Parse the user's real-length input — accepts meters and millimeters,
 * comma or dot decimals: "1.77", "1,77 m", "1770 mm". Returns meters or
 * null when unparseable/non-positive.
 */
export function parseRealLengthToMeters(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(",", ".");
  const match = text.match(/^([0-9]*\.?[0-9]+)\s*(mm|cm|m)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2] ?? "m";
  if (unit === "mm") return value / 1000;
  if (unit === "cm") return value / 100;
  return value;
}

/**
 * Polyline length in meters using the page calibration. Null without a
 * calibration (never a fake value). The calibration's own page size is used
 * — points are page fractions, so the ratio is what matters, and this keeps
 * the result stable even if the caller re-measures the page slightly
 * differently later.
 *
 * `gapIndexes` marks "pen-up" jumps: segment points[i-1]→points[i] is
 * excluded from the length when `i` is listed (the run continues elsewhere
 * on the plan but stays one position).
 */
export function polylineLengthMeters(
  points: NormalizedPoint[],
  calibration: DrawingScaleCalibration | null | undefined,
  gapIndexes?: number[] | null
): number | null {
  if (!calibration || !(calibration.metersPerPdfPoint > 0)) return null;
  if (points.length < 2) return 0;
  const gaps = new Set(gapIndexes ?? []);
  let totalPt = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (gaps.has(i + 1)) continue;
    totalPt += distanceBetweenNormalizedPointsPt(
      points[i],
      points[i + 1],
      calibration.pageWidthPt,
      calibration.pageHeightPt
    );
  }
  return totalPt * calibration.metersPerPdfPoint;
}

export type CableRunGeometry = {
  points: NormalizedPoint[];
  gapIndexes: number[];
};

/**
 * Insert a vertex into segment `segmentIndex` (between points[segmentIndex]
 * and points[segmentIndex + 1]) — used by the on-plan route editor. Gap
 * indexes are remapped; splitting a "pen-up" segment keeps BOTH halves
 * unmeasured (a jump must never silently start counting meters).
 */
export function insertCableRunPoint(
  points: NormalizedPoint[],
  gapIndexes: number[] | undefined,
  segmentIndex: number,
  point: NormalizedPoint
): CableRunGeometry {
  const insertAt = segmentIndex + 1;
  const nextPoints = [...points.slice(0, insertAt), point, ...points.slice(insertAt)];
  const gaps = new Set(gapIndexes ?? []);
  const splitWasGap = gaps.has(insertAt);
  const next: number[] = [];
  for (const g of gaps) {
    if (g === insertAt) continue;
    next.push(g > insertAt ? g + 1 : g);
  }
  if (splitWasGap) next.push(insertAt, insertAt + 1);
  return { points: nextPoints, gapIndexes: normalizeGaps(next, nextPoints.length) };
}

/**
 * Remove vertex `pointIndex` — the two adjacent segments merge, and the
 * merged segment stays a gap when either side was one. Refuses to shrink
 * below 2 points (a route needs a line).
 */
export function removeCableRunPoint(
  points: NormalizedPoint[],
  gapIndexes: number[] | undefined,
  pointIndex: number
): CableRunGeometry | null {
  if (points.length <= 2 || pointIndex < 0 || pointIndex >= points.length) return null;
  const nextPoints = points.filter((_, i) => i !== pointIndex);
  const gaps = new Set(gapIndexes ?? []);
  const mergedIsGap = gaps.has(pointIndex) || gaps.has(pointIndex + 1);
  const next: number[] = [];
  for (const g of gaps) {
    if (g === pointIndex || g === pointIndex + 1) continue;
    next.push(g > pointIndex ? g - 1 : g);
  }
  const isInterior = pointIndex > 0 && pointIndex < points.length - 1;
  if (isInterior && mergedIsGap) next.push(pointIndex);
  return { points: nextPoints, gapIndexes: normalizeGaps(next, nextPoints.length) };
}

/** Dedupe, drop out-of-range entries and sort — gaps must index segments. */
function normalizeGaps(gaps: number[], pointCount: number): number[] {
  return [...new Set(gaps)].filter((g) => g > 0 && g < pointCount).sort((a, b) => a - b);
}

export type CableRunTotals = {
  measured2dLengthM: number;
  /** Route + vertical + fixed reserve, before percentage and rounding. */
  rawLengthM: number;
  finalLengthM: number;
};

/**
 * Full length math of a cable run:
 *
 *   raw   = measured2d + vertical + fixedReserve
 *   final = ceil((raw * (1 + reserve% / 100)) / step) * step
 *
 * Null without calibration. roundingStepM ≤ 0 falls back to 1 m.
 */
export function computeCableRunTotals(
  run: Pick<
    CableRun,
    "points" | "verticalLengthM" | "fixedReserveM" | "reservePercent" | "roundingStepM"
  > &
    Partial<Pick<CableRun, "gapIndexes">>,
  calibration: DrawingScaleCalibration | null | undefined
): CableRunTotals | null {
  const measured = polylineLengthMeters(run.points, calibration, run.gapIndexes);
  if (measured === null) return null;
  const vertical = Number.isFinite(run.verticalLengthM) ? Math.max(0, run.verticalLengthM) : 0;
  const fixed = Number.isFinite(run.fixedReserveM) ? Math.max(0, run.fixedReserveM) : 0;
  const reservePercent = Number.isFinite(run.reservePercent)
    ? Math.max(0, run.reservePercent)
    : CABLE_RUN_DEFAULTS.reservePercent;
  const step =
    Number.isFinite(run.roundingStepM) && run.roundingStepM > 0
      ? run.roundingStepM
      : CABLE_RUN_DEFAULTS.roundingStepM;
  const rawLengthM = measured + vertical + fixed;
  const finalLengthM =
    rawLengthM > 0 ? Math.ceil((rawLengthM * (1 + reservePercent / 100)) / step) * step : 0;
  return {
    measured2dLengthM: Math.round(measured * 100) / 100,
    rawLengthM: Math.round(rawLengthM * 100) / 100,
    finalLengthM,
  };
}

export type CableRunGroup = {
  /** Stable grouping key: cableTypeName + installationType + catalogItemId. */
  key: string;
  cableTypeName: string;
  installationType: CableInstallationType;
  catalogItemId: string | null;
  runs: CableRun[];
  totalFinalLengthM: number;
  totalMeasured2dLengthM: number;
};

function normKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** FNV-1a hex hash — short stable suffix for Firestore doc ids. */
function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function cableRunGroupKey(
  run: Pick<CableRun, "cableTypeName" | "installationType" | "catalogItemId">
): string {
  return [
    normKeyPart(run.cableTypeName),
    run.installationType,
    run.catalogItemId ?? "",
  ].join("|");
}

/** Group cable runs by cable type + installation type (+ catalog link). */
export function groupCableRunsByType(runs: CableRun[]): CableRunGroup[] {
  const groups = new Map<string, CableRunGroup>();
  for (const run of runs) {
    const key = cableRunGroupKey(run);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        cableTypeName: run.cableTypeName,
        installationType: run.installationType,
        catalogItemId: run.catalogItemId ?? null,
        runs: [],
        totalFinalLengthM: 0,
        totalMeasured2dLengthM: 0,
      };
      groups.set(key, group);
    }
    group.runs.push(run);
    group.totalFinalLengthM =
      Math.round((group.totalFinalLengthM + run.finalLengthM) * 100) / 100;
    group.totalMeasured2dLengthM =
      Math.round((group.totalMeasured2dLengthM + run.measured2dLengthM) * 100) / 100;
  }
  return [...groups.values()].sort((a, b) =>
    a.cableTypeName.localeCompare(b.cableTypeName)
  );
}

export type CableRunCatalogRef = {
  id: string;
  name: string;
  unit?: string;
};

/**
 * Convert APPROVED cable runs into quote takeoff items — one item per
 * (cableTypeName, installationType, catalogItemId) group, quantity = sum of
 * final lengths in meters.
 *
 * IDEMPOTENT: the item id is deterministic (`cablegrp_<drawing>_p<page>_<hash>`),
 * so re-exporting after a change updates the existing Firestore doc instead
 * of duplicating it. Price is intentionally NOT set here — the quote side
 * shows "Cena chýba" until the reviewer prices the row (or the linked
 * catalog item provides one downstream).
 *
 * Kept extensible: later the same group can additionally emit installation /
 * grooving / trunking work items (installationType is already in metadata).
 */
export function convertCableRunsToTakeoffItems(
  runs: CableRun[],
  options: {
    projectId: string;
    drawingId: string;
    pageNumber: number;
    catalogItems?: CableRunCatalogRef[];
    now?: string;
  }
): TakeoffItem[] {
  const approved = runs.filter(
    (r) => r.status === "approved" && r.finalLengthM > 0
  );
  const catalogById = new Map((options.catalogItems ?? []).map((c) => [c.id, c]));
  const now = options.now ?? new Date().toISOString();

  return groupCableRunsByType(approved).map((group) => {
    const catalog = group.catalogItemId ? catalogById.get(group.catalogItemId) : undefined;
    const sourceId = `${options.drawingId}_${options.pageNumber}_${stableHash(group.key)}`;
    return {
      id: `cablegrp_${sourceId}`,
      projectId: options.projectId,
      drawingId: options.drawingId,
      quoteId: null,
      name: catalog?.name ?? group.cableTypeName,
      profession: "electrical",
      quantity: group.totalFinalLengthM,
      unit: "m",
      sourceOfQuantity: "route_calculation",
      status: "confirmed",
      evidenceCount: group.runs.length,
      metadata: {
        sourceType: "cable_run_group",
        sourceId,
        cableTypeName: group.cableTypeName,
        installationType: group.installationType,
        catalogItemId: group.catalogItemId,
        cableRunIds: group.runs.map((r) => r.id),
        pageNumber: options.pageNumber,
      },
      createdAt: now,
      updatedAt: now,
    } satisfies TakeoffItem;
  });
}
