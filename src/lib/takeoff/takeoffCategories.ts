/**
 * Item categories for the operator-driven takeoff workflow.
 *
 * The projektant defines a position ("Svetlo LED 12W", "Zásuvka 230V dvojitá",
 * …) and click-counts its symbols on the plan. Everything with the same label
 * belongs to one category: one color on the plan, one grouped row with a piece
 * count in the panel, one takeoff item. Pure logic — no React / Firestore.
 */

import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";
import { defaultSymbolTypeForCandidate } from "@/lib/takeoff/candidateReview";

export type TakeoffCategory = {
  /** Stable key — normalized label. */
  key: string;
  /** Display label exactly as the operator wrote it (first occurrence wins). */
  label: string;
  /** Symbol type used when adding more marks to this category. */
  symbolType: string;
  /** Marker + panel accent color for this category. */
  color: string;
  candidates: AnalyzeRegionCandidateDto[];
};

/**
 * Distinct, high-contrast palette for category markers. Deliberately avoids
 * the selection highlight (#C400FF magenta) and stays readable both as a
 * marker border on white plans and as a chip in the panel.
 */
export const CATEGORY_COLOR_PALETTE = [
  "#2563EB", // blue
  "#059669", // emerald
  "#D97706", // amber
  "#DC2626", // red
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#DB2777", // pink
  "#65A30D", // lime
  "#4F46E5", // indigo
  "#B45309", // brown
  "#0D9488", // teal
  "#9333EA", // purple
] as const;

/** Normalized grouping key for a category label. */
export function categoryKeyForLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Ensure a new position name does not collide with an existing category.
 * Same catalog product can be counted as separate positions
 * ("Valena…", "Valena… (2)", …) — "+ Nová položka" must not silently
 * join the previous group just because the product name matches.
 */
export function uniquifyCategoryLabel(
  label: string,
  existingKeys: Iterable<string>
): string {
  const base = label.trim().replace(/\s+/g, " ");
  if (!base) return base;
  const taken = new Set<string>();
  for (const k of existingKeys) {
    const key = k.trim();
    if (key) taken.add(categoryKeyForLabel(key));
  }
  if (!taken.has(categoryKeyForLabel(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(categoryKeyForLabel(candidate))) return candidate;
  }
  return `${base} (${Date.now()})`;
}

/** Per-project operator color overrides (persisted in localStorage). */
const colorOverridesByProject = new Map<string, Map<string, string>>();
/** Per-project marker frame scale (1 = detection bbox size). */
const markerScaleOverridesByProject = new Map<string, Map<string, number>>();
/** Per-project category comments / info notes. */
const noteOverridesByProject = new Map<string, Map<string, string>>();
let activeColorProjectId: string | null = null;

const COLOR_STORAGE_PREFIX = "takeoff.categoryColors.";
const MARKER_SCALE_STORAGE_PREFIX = "takeoff.categoryMarkerScales.";
const NOTE_STORAGE_PREFIX = "takeoff.categoryNotes.";

/** Allowed marker frame scale (relative to the detection bbox). */
export const CATEGORY_MARKER_SCALE_MIN = 0.25;
export const CATEGORY_MARKER_SCALE_MAX = 3;
export const CATEGORY_MARKER_SCALE_DEFAULT = 1;

function readStoredOverrides(projectId: string): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof window === "undefined") return map;
  try {
    const raw = window.localStorage.getItem(`${COLOR_STORAGE_PREFIX}${projectId}`);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v)) map.set(k, v);
    }
  } catch {
    /* ignore */
  }
  return map;
}

function persistOverrides(projectId: string, map: Map<string, string>) {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of map) obj[k] = v;
    window.localStorage.setItem(
      `${COLOR_STORAGE_PREFIX}${projectId}`,
      JSON.stringify(obj)
    );
  } catch {
    /* storage full/blocked */
  }
}

function clampMarkerScale(scale: number): number {
  if (!Number.isFinite(scale)) return CATEGORY_MARKER_SCALE_DEFAULT;
  return Math.min(
    CATEGORY_MARKER_SCALE_MAX,
    Math.max(CATEGORY_MARKER_SCALE_MIN, Math.round(scale * 100) / 100)
  );
}

function readStoredMarkerScales(projectId: string): Map<string, number> {
  const map = new Map<string, number>();
  if (typeof window === "undefined") return map;
  try {
    const raw = window.localStorage.getItem(
      `${MARKER_SCALE_STORAGE_PREFIX}${projectId}`
    );
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        map.set(k, clampMarkerScale(v));
      }
    }
  } catch {
    /* ignore */
  }
  return map;
}

function persistMarkerScales(projectId: string, map: Map<string, number>) {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, number> = {};
    for (const [k, v] of map) obj[k] = v;
    window.localStorage.setItem(
      `${MARKER_SCALE_STORAGE_PREFIX}${projectId}`,
      JSON.stringify(obj)
    );
  } catch {
    /* storage full/blocked */
  }
}

function readStoredNotes(projectId: string): Map<string, string> {
  const map = new Map<string, string>();
  if (typeof window === "undefined") return map;
  try {
    const raw = window.localStorage.getItem(`${NOTE_STORAGE_PREFIX}${projectId}`);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) map.set(k, v.trim());
    }
  } catch {
    /* ignore */
  }
  return map;
}

function persistNotes(projectId: string, map: Map<string, string>) {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of map) {
      if (v.trim()) obj[k] = v.trim();
    }
    window.localStorage.setItem(
      `${NOTE_STORAGE_PREFIX}${projectId}`,
      JSON.stringify(obj)
    );
  } catch {
    /* storage full/blocked */
  }
}

/** Load (or activate) color overrides for the current project so plan + panel match. */
export function setActiveCategoryColorProject(projectId: string | null): void {
  activeColorProjectId = projectId?.trim() || null;
  if (!activeColorProjectId) return;
  if (!colorOverridesByProject.has(activeColorProjectId)) {
    colorOverridesByProject.set(
      activeColorProjectId,
      readStoredOverrides(activeColorProjectId)
    );
  }
  if (!markerScaleOverridesByProject.has(activeColorProjectId)) {
    markerScaleOverridesByProject.set(
      activeColorProjectId,
      readStoredMarkerScales(activeColorProjectId)
    );
  }
  if (!noteOverridesByProject.has(activeColorProjectId)) {
    noteOverridesByProject.set(
      activeColorProjectId,
      readStoredNotes(activeColorProjectId)
    );
  }
}

/** Persist a custom color for a category key (normalized label). */
export function setCategoryColorOverride(key: string, color: string): void {
  const k = key.trim();
  if (!k || !activeColorProjectId) return;
  const hex = color.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
  let map = colorOverridesByProject.get(activeColorProjectId);
  if (!map) {
    map = new Map();
    colorOverridesByProject.set(activeColorProjectId, map);
  }
  map.set(k, hex);
  persistOverrides(activeColorProjectId, map);
}

/** Operator comment / info for a category (empty clears). */
export function setCategoryNoteOverride(key: string, note: string): void {
  const k = key.trim();
  if (!k || !activeColorProjectId) return;
  let map = noteOverridesByProject.get(activeColorProjectId);
  if (!map) {
    map = new Map();
    noteOverridesByProject.set(activeColorProjectId, map);
  }
  const trimmed = note.trim();
  if (!trimmed) map.delete(k);
  else map.set(k, trimmed);
  persistNotes(activeColorProjectId, map);
}

/** Read category comment (empty string when none). */
export function categoryNoteForKey(key: string): string {
  if (!activeColorProjectId) return "";
  return noteOverridesByProject.get(activeColorProjectId)?.get(key.trim()) ?? "";
}

/** Move note when a category is renamed (same key space as colors). */
export function moveCategoryNoteOverride(fromKey: string, toKey: string): void {
  const from = fromKey.trim();
  const to = toKey.trim();
  if (!from || !to || from === to || !activeColorProjectId) return;
  const map = noteOverridesByProject.get(activeColorProjectId);
  if (!map) return;
  const note = map.get(from);
  if (note === undefined) return;
  map.delete(from);
  map.set(to, note);
  persistNotes(activeColorProjectId, map);
}

/** Persist highlight-frame scale for a category (1 = original detection size). */
export function setCategoryMarkerScaleOverride(key: string, scale: number): void {
  const k = key.trim();
  if (!k || !activeColorProjectId) return;
  const next = clampMarkerScale(scale);
  let map = markerScaleOverridesByProject.get(activeColorProjectId);
  if (!map) {
    map = new Map();
    markerScaleOverridesByProject.set(activeColorProjectId, map);
  }
  if (Math.abs(next - CATEGORY_MARKER_SCALE_DEFAULT) < 0.01) {
    map.delete(k);
  } else {
    map.set(k, next);
  }
  persistMarkerScales(activeColorProjectId, map);
}

/**
 * Highlight-frame scale for a category key (operator override or 1).
 * Used only for on-plan overlay size — stored mark geometry is unchanged.
 */
export function categoryMarkerScaleForKey(key: string): number {
  if (activeColorProjectId) {
    const override = markerScaleOverridesByProject
      .get(activeColorProjectId)
      ?.get(key);
    if (typeof override === "number") return override;
  }
  return CATEGORY_MARKER_SCALE_DEFAULT;
}

/** Scale a normalized rect about its center (for overlay display). */
export function scaleNormalizedRectAboutCenter(
  rect: { x: number; y: number; width: number; height: number },
  scale: number
): { x: number; y: number; width: number; height: number } {
  const s = clampMarkerScale(scale);
  if (Math.abs(s - 1) < 0.01) return rect;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const width = Math.min(1, Math.max(0.002, rect.width * s));
  const height = Math.min(1, Math.max(0.002, rect.height * s));
  return {
    x: Math.min(1 - width, Math.max(0, cx - width / 2)),
    y: Math.min(1 - height, Math.max(0, cy - height / 2)),
    width,
    height,
  };
}

function defaultCategoryColorForKey(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const idx = Math.abs(hash) % CATEGORY_COLOR_PALETTE.length;
  return CATEGORY_COLOR_PALETTE[idx]!;
}

/**
 * Color for a category key — operator override first, else stable hash of the
 * normalized key (FNV-1a). Same label always maps to the same default color.
 */
export function categoryColorForKey(key: string): string {
  if (activeColorProjectId) {
    const override = colorOverridesByProject.get(activeColorProjectId)?.get(key);
    if (override) return override;
  }
  return defaultCategoryColorForKey(key);
}

/** Display label + grouping key for one candidate. */
export function categoryLabelForCandidate(
  c: Pick<AnalyzeRegionCandidateDto, "label_suggestions" | "color_layer" | "status">
): string {
  return c.label_suggestions[0]?.label?.trim() || defaultSymbolTypeForCandidate(c);
}

/**
 * Group CONFIRMED candidates into operator categories (by normalized label).
 * Sorted by count descending so the biggest positions surface first.
 */
export function groupConfirmedByCategory(
  candidates: AnalyzeRegionCandidateDto[]
): TakeoffCategory[] {
  const byKey = new Map<string, TakeoffCategory>();
  for (const c of candidates) {
    if (c.status !== "confirmed") continue;
    const label = categoryLabelForCandidate(c);
    const key = categoryKeyForLabel(label);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label,
        symbolType: defaultSymbolTypeForCandidate(c),
        color: categoryColorForKey(key),
        candidates: [],
      };
      byKey.set(key, group);
    }
    group.candidates.push(c);
  }
  return [...byKey.values()].sort((a, b) => b.candidates.length - a.candidates.length);
}
