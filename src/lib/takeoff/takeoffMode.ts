/**
 * Shared takeoff workbench contract — one tool, four contexts.
 *
 * The same PlanTakeoffWorkbench is used from quote, project and documents.
 * Data (confirmedSymbols / takeoffItems / takeoffEvidence / symbolCandidates)
 * is keyed by projectId + drawingId, so every mode sees the same takeoff —
 * modes differ only in what the operator may do.
 */

import type { NormalizedRect } from "@/types/drawingTakeoff";

export type TakeoffMode = "quote" | "project" | "document" | "readonly";

export type TakeoffPermissions = {
  /** Manual marking + reviewing candidates (confirm/reject/change type). */
  allowEdit: boolean;
  /** Analyze region + find similar. */
  allowAnalyze: boolean;
  /** Confirming candidates (quantity/evidence writes). */
  allowConfirm: boolean;
  /** "Add to quote" panel. */
  allowCreateQuoteItems: boolean;
  /** Creating project tasks from takeoff (future). */
  allowCreateProjectTasks: boolean;
};

const MODE_DEFAULTS: Record<TakeoffMode, TakeoffPermissions> = {
  quote: {
    allowEdit: true,
    allowAnalyze: true,
    allowConfirm: true,
    allowCreateQuoteItems: true,
    allowCreateProjectTasks: false,
  },
  project: {
    allowEdit: true,
    allowAnalyze: true,
    allowConfirm: true,
    allowCreateQuoteItems: false,
    allowCreateProjectTasks: true,
  },
  document: {
    // Document mode is a preview — the "open full takeoff" action switches
    // to project/quote mode; no separate takeoff state exists.
    allowEdit: false,
    allowAnalyze: false,
    allowConfirm: false,
    allowCreateQuoteItems: false,
    allowCreateProjectTasks: false,
  },
  readonly: {
    allowEdit: false,
    allowAnalyze: false,
    allowConfirm: false,
    allowCreateQuoteItems: false,
    allowCreateProjectTasks: false,
  },
};

/**
 * Resolve effective permissions: mode defaults, then explicit prop overrides,
 * then the hard gate — readonly/document can never gain edit rights and a
 * user without edit permission (canEditProject=false) is always view-only.
 */
export function resolveTakeoffPermissions(params: {
  mode: TakeoffMode;
  canEditProject?: boolean;
  overrides?: Partial<TakeoffPermissions>;
}): TakeoffPermissions {
  const { mode, canEditProject = true, overrides } = params;
  const base = { ...MODE_DEFAULTS[mode], ...overrides };
  const editable = canEditProject && mode !== "readonly" && mode !== "document";
  if (!editable) {
    return {
      allowEdit: false,
      allowAnalyze: false,
      allowConfirm: false,
      allowCreateQuoteItems: false,
      allowCreateProjectTasks: false,
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Central route + deep links
// ---------------------------------------------------------------------------

export type TakeoffRouteParams = {
  projectId: string;
  /** Project document id of the PDF drawing (drawingId == documentId today). */
  drawingId?: string | null;
  quoteId?: string | null;
  documentId?: string | null;
  mode?: TakeoffMode;
  page?: number | null;
  /** Focus bbox (normalized page coords) — e.g. evidence deep link. */
  bbox?: NormalizedRect | null;
  returnTo?: string | null;
};

export function encodeBboxParam(rect: NormalizedRect): string {
  const f = (v: number) => Number(v.toFixed(5));
  return [f(rect.x), f(rect.y), f(rect.width), f(rect.height)].join(",");
}

export function decodeBboxParam(value: string | null | undefined): NormalizedRect | null {
  if (!value) return null;
  const parts = value.split(",").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width < 0 || height < 0) return null;
  return { x, y, width, height };
}

const VALID_MODES: TakeoffMode[] = ["quote", "project", "document", "readonly"];

export function parseTakeoffMode(value: string | null | undefined): TakeoffMode | null {
  return VALID_MODES.includes(value as TakeoffMode) ? (value as TakeoffMode) : null;
}

/** Single canonical takeoff URL — all entry points navigate here. */
export function takeoffRoute(params: TakeoffRouteParams): string {
  const q = new URLSearchParams();
  // `doc` is the historical param name for drawingId — kept for compat.
  if (params.drawingId) q.set("doc", params.drawingId);
  if (params.quoteId) q.set("quoteId", params.quoteId);
  if (params.documentId && params.documentId !== params.drawingId) {
    q.set("documentId", params.documentId);
  }
  if (params.mode) q.set("mode", params.mode);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  if (params.bbox) q.set("bbox", encodeBboxParam(params.bbox));
  if (params.returnTo) q.set("returnTo", params.returnTo);
  const qs = q.toString();
  return `/app/projects/${params.projectId}/takeoff${qs ? `?${qs}` : ""}`;
}
