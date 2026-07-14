/**
 * Plan Takeoff Workbench — data model (additive).
 *
 * A DrawingOccurrence is a single mark on a PDF drawing: manually placed,
 * AI-detected, or found via "find similar symbols". Occurrences flow into
 * takeoff aggregation and — once confirmed — into editable quote draft lines
 * (projects/{id}/quoteItems). Every occurrence keeps a clear source + status
 * so the user always knows what is manual, what is a candidate and what is
 * already used in a quote.
 *
 * Coordinates are ALWAYS normalized (0..1) against the PDF page size so
 * overlays stay correct across zoom, resolution and window resize.
 */

export type TakeoffTrade =
  | "electrical"
  | "plumbing"
  | "heating"
  | "hvac"
  | "construction"
  | "general";

export type OccurrenceSource =
  | "manual"
  | "ai_detected"
  | "similar_symbol_detected"
  | "imported"
  | "rule_derived"
  | "estimate";

export type OccurrenceStatus =
  | "draft"
  | "needs_review"
  | "confirmed"
  | "rejected"
  | "used_in_quote";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DrawingOccurrence = {
  id: string;
  projectId: string;
  /** Project document id (projects/{id}/documents/{drawingId}). */
  drawingId: string;
  pageNumber: number;
  /** Type id from the trade/type catalog (e.g. "switch", "socket", "radiator"). */
  type: string;
  trade: TakeoffTrade;
  label: string;
  source: OccurrenceSource;
  status: OccurrenceStatus;
  /** 0..1 — only meaningful for detected/similar candidates. */
  confidence?: number;
  /** Optional explicit override; otherwise derived from source/status. */
  color?: string;
  /** Pixel bbox at detection resolution (kept for traceability, optional). */
  bbox?: NormalizedRect;
  /** Normalized (0..1) position on the PDF page — source of truth for overlay. */
  normalizedPosition: NormalizedRect;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type DrawingOccurrenceInput = Omit<
  DrawingOccurrence,
  "id" | "createdAt" | "updatedAt"
>;

// ---------------------------------------------------------------------------
// Trade / type catalog (configurable — not hardcoded to electrical)
// ---------------------------------------------------------------------------

export type TakeoffTypeDefinition = {
  /** Stable type id stored on occurrences. */
  id: string;
  trade: TakeoffTrade;
  /** i18n key for the display name. */
  labelKey: string;
  defaultUnit: string;
};

export const TAKEOFF_TYPE_CATALOG: TakeoffTypeDefinition[] = [
  { id: "switch", trade: "electrical", labelKey: "takeoff.type.switch", defaultUnit: "ks" },
  { id: "socket", trade: "electrical", labelKey: "takeoff.type.socket", defaultUnit: "ks" },
  { id: "light", trade: "electrical", labelKey: "takeoff.type.light", defaultUnit: "ks" },
  { id: "led_strip", trade: "electrical", labelKey: "takeoff.type.ledStrip", defaultUnit: "m" },
  { id: "distribution_board", trade: "electrical", labelKey: "takeoff.type.distributionBoard", defaultUnit: "ks" },
  { id: "cable_route", trade: "electrical", labelKey: "takeoff.type.cableRoute", defaultUnit: "m" },
  { id: "sink", trade: "plumbing", labelKey: "takeoff.type.sink", defaultUnit: "ks" },
  { id: "wc", trade: "plumbing", labelKey: "takeoff.type.wc", defaultUnit: "ks" },
  { id: "shower", trade: "plumbing", labelKey: "takeoff.type.shower", defaultUnit: "ks" },
  { id: "water_pipe", trade: "plumbing", labelKey: "takeoff.type.waterPipe", defaultUnit: "m" },
  { id: "radiator", trade: "heating", labelKey: "takeoff.type.radiator", defaultUnit: "ks" },
  { id: "manifold", trade: "heating", labelKey: "takeoff.type.manifold", defaultUnit: "ks" },
  { id: "underfloor_circuit", trade: "heating", labelKey: "takeoff.type.underfloorCircuit", defaultUnit: "m2" },
  { id: "air_outlet", trade: "hvac", labelKey: "takeoff.type.airOutlet", defaultUnit: "ks" },
  { id: "duct", trade: "hvac", labelKey: "takeoff.type.duct", defaultUnit: "m" },
  { id: "wall_opening", trade: "construction", labelKey: "takeoff.type.wallOpening", defaultUnit: "ks" },
  { id: "generic", trade: "general", labelKey: "takeoff.type.generic", defaultUnit: "ks" },
];

export const TAKEOFF_TRADES: TakeoffTrade[] = [
  "electrical",
  "plumbing",
  "heating",
  "hvac",
  "construction",
  "general",
];

// ---------------------------------------------------------------------------
// Quote lines derived from takeoff
// ---------------------------------------------------------------------------

export type TakeoffQuoteLineSource =
  | "manual"
  | "drawing_detection"
  | "rule_derived"
  | "estimate";

export type TakeoffQuoteLineStatus = "draft" | "needs_review" | "confirmed";

/**
 * Rich quote line built from confirmed occurrences (+ assembly rules).
 * Persisted by mapping onto the existing projects/{id}/quoteItems draft model
 * (category material/work, qty, unit, unitPrice) so the existing manual quote
 * editor keeps working unchanged.
 */
export type TakeoffQuoteLine = {
  id: string;
  projectId: string;
  sourceOccurrenceIds: string[];
  name: string;
  trade: TakeoffTrade;
  /** "material" | "work" for the existing quote draft model. */
  category: "material" | "work";
  unit: string;
  quantity: number;
  materialUnitPrice?: number;
  laborHoursPerUnit?: number;
  laborRate?: number;
  materialTotal?: number;
  laborTotal?: number;
  overheadPercent?: number;
  marginPercent?: number;
  riskPercent?: number;
  total?: number;
  source: TakeoffQuoteLineSource;
  status: TakeoffQuoteLineStatus;
  note?: string;
};

// ---------------------------------------------------------------------------
// Routes (future manual polyline tracing — data model only for now)
// ---------------------------------------------------------------------------

/**
 * TODO(takeoff-routes): manual polyline tracing between points is not
 * implemented yet. The model is prepared so a route can later belong to a
 * distribution board / circuit / pipe system and derive cable/pipe lengths.
 */
export type DrawingRoute = {
  id: string;
  projectId: string;
  drawingId: string;
  pageNumber: number;
  trade: TakeoffTrade;
  /** Normalized (0..1) polyline points. */
  points: Array<{ x: number; y: number }>;
  /** Real-world length in meters when scale is known. */
  lengthMeters?: number;
  /** Optional owner: distribution board, circuit, pipe run, system id. */
  systemId?: string;
  label?: string;
  createdAt: string;
  updatedAt: string;
};
