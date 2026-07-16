/**
 * Project/session symbol key — confirmed templates used as truth for
 * "Nájsť rovnaké". Estimator-only; not a global catalog.
 */

import type {
  EstimatorPosition,
  EstimatorPositionBBox,
  ProjectSymbolKeyEntry,
  ProjectSymbolKeyKind,
  ProjectSymbolKeySource,
} from "@/types/estimatorPositions";

export function newSymbolKeyId(): string {
  return `symkey_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function symbolKindForCategory(category: string): ProjectSymbolKeyKind {
  if (category === "led_strip" || category === "cable") return "line_symbol";
  if (category === "unknown") return "text_annotation";
  return "point_symbol";
}

/** Create/update a user-learned key from a confirmed takeoff position. */
export function upsertUserLearnedSymbolKey(
  keys: ProjectSymbolKeyEntry[],
  position: EstimatorPosition,
  templateBbox?: EstimatorPositionBBox,
  colorHint?: ProjectSymbolKeyEntry["colorHint"]
): ProjectSymbolKeyEntry[] {
  const bbox =
    templateBbox ??
    [...position.evidenceAnchors].reverse().find((a) => a.tightSymbolBbox || a.bbox)?.tightSymbolBbox ??
    [...position.evidenceAnchors].reverse().find((a) => a.bbox)?.bbox;
  if (!bbox) return keys;

  const kind = symbolKindForCategory(position.category);
  const existingIdx = keys.findIndex(
    (k) =>
      k.normalizedPoint === position.normalizedPoint &&
      k.source === "user_learned" &&
      k.kind === kind
  );
  const entry: ProjectSymbolKeyEntry = {
    id: existingIdx >= 0 ? keys[existingIdx]!.id : newSymbolKeyId(),
    label: position.label,
    normalizedPoint: position.normalizedPoint ?? position.category,
    category: position.category,
    source: "user_learned",
    kind,
    colorHint: colorHint ?? "unknown",
    templateBbox: bbox,
    confidence: "high",
    needsReview: kind === "line_symbol",
    linkedPositionId: position.id,
  };
  if (existingIdx >= 0) {
    const next = [...keys];
    next[existingIdx] = entry;
    return next;
  }
  return [...keys, entry];
}

/** Legend entry becomes a project_legend key (does not count floor occurrences). */
export function upsertLegendSymbolKey(
  keys: ProjectSymbolKeyEntry[],
  input: {
    label: string;
    normalizedPoint: string;
    category?: string;
    templateBbox: EstimatorPositionBBox;
    colorHint?: ProjectSymbolKeyEntry["colorHint"];
  }
): ProjectSymbolKeyEntry[] {
  const existingIdx = keys.findIndex(
    (k) =>
      k.source === "project_legend" &&
      k.normalizedPoint === input.normalizedPoint &&
      k.label === input.label
  );
  const entry: ProjectSymbolKeyEntry = {
    id: existingIdx >= 0 ? keys[existingIdx]!.id : newSymbolKeyId(),
    label: input.label,
    normalizedPoint: input.normalizedPoint,
    category: input.category,
    source: "project_legend",
    kind: symbolKindForCategory(input.category ?? "unknown"),
    colorHint: input.colorHint ?? "unknown",
    templateBbox: input.templateBbox,
    confidence: "high",
    needsReview: false,
  };
  if (existingIdx >= 0) {
    const next = [...keys];
    next[existingIdx] = entry;
    return next;
  }
  return [...keys, entry];
}

/**
 * Resolve best key for matching: user_learned > project_legend > ai_suggested.
 */
export function resolveBestSymbolKey(
  keys: ProjectSymbolKeyEntry[],
  opts: { normalizedPoint?: string; category?: string; positionId?: string }
): ProjectSymbolKeyEntry | null {
  const pool = keys.filter((k) => {
    if (opts.positionId && k.linkedPositionId === opts.positionId) return true;
    if (opts.normalizedPoint && k.normalizedPoint === opts.normalizedPoint) return true;
    if (opts.category && k.category === opts.category) return true;
    return false;
  });
  if (pool.length === 0) return null;
  const rank = (s: ProjectSymbolKeySource) =>
    s === "user_learned" ? 0 : s === "project_legend" ? 1 : 2;
  return [...pool].sort((a, b) => rank(a.source) - rank(b.source))[0] ?? null;
}

export function isLineSymbolKey(entry: ProjectSymbolKeyEntry): boolean {
  return entry.kind === "line_symbol";
}
