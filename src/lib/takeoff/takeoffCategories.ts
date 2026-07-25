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

/** Per-project operator color overrides (persisted in localStorage). */
const colorOverridesByProject = new Map<string, Map<string, string>>();
let activeColorProjectId: string | null = null;

const COLOR_STORAGE_PREFIX = "takeoff.categoryColors.";

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
