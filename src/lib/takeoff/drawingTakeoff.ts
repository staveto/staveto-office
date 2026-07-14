/**
 * Plan Takeoff Workbench — pure logic (no React, no Firestore).
 *
 * Coordinate math between normalized page coordinates (0..1, source of
 * truth) and rendered screen pixels, marker colors by source/status,
 * aggregation and filtering used by the right panel.
 */

import type {
  DrawingOccurrence,
  NormalizedRect,
  OccurrenceSource,
  OccurrenceStatus,
  TakeoffTrade,
} from "@/types/drawingTakeoff";
import { TAKEOFF_TYPE_CATALOG } from "@/types/drawingTakeoff";

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

export type CanvasSize = { width: number; height: number };

/** Normalized page rect (0..1) → CSS pixel rect for the rendered canvas. */
export function normalizedToScreenRect(
  rect: NormalizedRect,
  canvas: CanvasSize
): NormalizedRect {
  return {
    x: rect.x * canvas.width,
    y: rect.y * canvas.height,
    width: rect.width * canvas.width,
    height: rect.height * canvas.height,
  };
}

/** CSS pixel rect on the rendered canvas → normalized page rect (0..1), clamped. */
export function screenToNormalizedRect(
  rect: NormalizedRect,
  canvas: CanvasSize
): NormalizedRect {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp(rect.x / canvas.width);
  const y = clamp(rect.y / canvas.height);
  return {
    x,
    y,
    width: clamp(rect.width / canvas.width + x) - x,
    height: clamp(rect.height / canvas.height + y) - y,
  };
}

/** Point click → small normalized marker box centered on the click. */
export function pointToNormalizedRect(
  point: { x: number; y: number },
  canvas: CanvasSize,
  markerCssPx = 22
): NormalizedRect {
  const half = markerCssPx / 2;
  return screenToNormalizedRect(
    { x: point.x - half, y: point.y - half, width: markerCssPx, height: markerCssPx },
    canvas
  );
}

/** Normalize a drag rectangle (any corner order) into positive width/height. */
export function normalizeDragRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
): NormalizedRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

// ---------------------------------------------------------------------------
// Marker colors — status wins over source
// ---------------------------------------------------------------------------

export const OCCURRENCE_SOURCE_COLORS: Record<OccurrenceSource, string> = {
  manual: "#2563EB", // blue
  ai_detected: "#7C3AED", // purple
  similar_symbol_detected: "#EA580C", // orange
  imported: "#0891B2", // cyan
  rule_derived: "#7C3AED",
  estimate: "#64748B",
};

export const OCCURRENCE_STATUS_COLORS: Partial<Record<OccurrenceStatus, string>> = {
  confirmed: "#16A34A", // green
  used_in_quote: "#14532D", // dark green
  rejected: "#94A3B8", // muted gray
};

export function occurrenceColor(o: Pick<DrawingOccurrence, "source" | "status" | "color">): string {
  if (o.color) return o.color;
  return OCCURRENCE_STATUS_COLORS[o.status] ?? OCCURRENCE_SOURCE_COLORS[o.source];
}

/** Rejected markers render with low opacity; candidates dashed. */
export function occurrenceMarkerStyle(o: DrawingOccurrence): {
  color: string;
  dashed: boolean;
  opacity: number;
} {
  return {
    color: occurrenceColor(o),
    dashed: o.status === "needs_review" || o.status === "draft",
    opacity: o.status === "rejected" ? 0.35 : 1,
  };
}

// ---------------------------------------------------------------------------
// Layers (viewer toggles)
// ---------------------------------------------------------------------------

export type TakeoffLayerKey =
  | "manual"
  | "ai"
  | "candidates"
  | "confirmed"
  | "rejected"
  | "used_in_quote";

export function occurrenceLayer(o: DrawingOccurrence): TakeoffLayerKey {
  if (o.status === "rejected") return "rejected";
  if (o.status === "used_in_quote") return "used_in_quote";
  if (o.status === "confirmed") return "confirmed";
  if (o.source === "similar_symbol_detected") return "candidates";
  if (o.source === "ai_detected" || o.source === "estimate" || o.source === "rule_derived")
    return "ai";
  return "manual";
}

export const TAKEOFF_LAYER_ORDER: TakeoffLayerKey[] = [
  "manual",
  "ai",
  "candidates",
  "confirmed",
  "rejected",
  "used_in_quote",
];

// ---------------------------------------------------------------------------
// Aggregation + filtering
// ---------------------------------------------------------------------------

export type TakeoffFilter = {
  status?: OccurrenceStatus | "all";
  trade?: TakeoffTrade | "all";
  search?: string;
  pageNumber?: number;
};

export function filterOccurrences(
  occurrences: DrawingOccurrence[],
  filter: TakeoffFilter
): DrawingOccurrence[] {
  const search = filter.search?.trim().toLowerCase();
  return occurrences.filter((o) => {
    if (filter.status && filter.status !== "all" && o.status !== filter.status) return false;
    if (filter.trade && filter.trade !== "all" && o.trade !== filter.trade) return false;
    if (typeof filter.pageNumber === "number" && o.pageNumber !== filter.pageNumber)
      return false;
    if (search) {
      const hay = `${o.label} ${o.type} ${o.trade} ${o.note ?? ""}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

export type TypeCountRow = {
  trade: TakeoffTrade;
  type: string;
  label: string;
  total: number;
  confirmed: number;
  needsReview: number;
};

/** Counts per trade+type (rejected excluded from totals). */
export function aggregateByType(occurrences: DrawingOccurrence[]): TypeCountRow[] {
  const map = new Map<string, TypeCountRow>();
  for (const o of occurrences) {
    if (o.status === "rejected") continue;
    const key = `${o.trade}|${o.type}`;
    let row = map.get(key);
    if (!row) {
      row = { trade: o.trade, type: o.type, label: o.label, total: 0, confirmed: 0, needsReview: 0 };
      map.set(key, row);
    }
    row.total += 1;
    if (o.status === "confirmed" || o.status === "used_in_quote") row.confirmed += 1;
    if (o.status === "needs_review" || o.status === "draft") row.needsReview += 1;
  }
  return [...map.values()].sort(
    (a, b) => a.trade.localeCompare(b.trade) || a.type.localeCompare(b.type)
  );
}

export type StatusCounts = Record<OccurrenceStatus, number> & { total: number };

export function countByStatus(occurrences: DrawingOccurrence[]): StatusCounts {
  const counts: StatusCounts = {
    draft: 0,
    needs_review: 0,
    confirmed: 0,
    rejected: 0,
    used_in_quote: 0,
    total: occurrences.length,
  };
  for (const o of occurrences) counts[o.status] += 1;
  return counts;
}

export function groupByTrade(
  occurrences: DrawingOccurrence[]
): Array<{ trade: TakeoffTrade; occurrences: DrawingOccurrence[] }> {
  const map = new Map<TakeoffTrade, DrawingOccurrence[]>();
  for (const o of occurrences) {
    const list = map.get(o.trade) ?? [];
    list.push(o);
    map.set(o.trade, list);
  }
  return [...map.entries()].map(([trade, occ]) => ({ trade, occurrences: occ }));
}

// ---------------------------------------------------------------------------
// Type catalog helpers
// ---------------------------------------------------------------------------

export function typesForTrade(trade: TakeoffTrade) {
  return TAKEOFF_TYPE_CATALOG.filter((d) => d.trade === trade);
}

export function typeDefinition(trade: TakeoffTrade, typeId: string) {
  return TAKEOFF_TYPE_CATALOG.find((d) => d.trade === trade && d.id === typeId);
}

export function defaultUnitFor(trade: TakeoffTrade, typeId: string): string {
  return typeDefinition(trade, typeId)?.defaultUnit ?? "ks";
}
