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
 * Stable color for a category key — same label always maps to the same
 * color, regardless of insertion order or which page loaded first (FNV-1a
 * over the normalized key). Two categories may share a color once there are
 * more categories than palette entries; the label chip disambiguates.
 */
export function categoryColorForKey(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const idx = Math.abs(hash) % CATEGORY_COLOR_PALETTE.length;
  return CATEGORY_COLOR_PALETTE[idx]!;
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
