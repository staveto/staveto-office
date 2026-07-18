/**
 * Analyze Region v2 A1 — merge raster/color candidates with template-match
 * candidates from the project's symbolTemplates library.
 *
 * Pure logic only: no Firestore, no Storage, no quantity writes. Overlapping
 * matches of the SAME color layer are combined into one "mixed" candidate
 * (best confidence wins, label suggestions are unioned). Overlapping matches
 * of DIFFERENT color layers (e.g. a red switch next to a green socket) are
 * always kept separate — color layer is a hard boundary for merging.
 */

import { normalizedRectOverlapRatio } from "@/lib/takeoff/candidateReview";
import type { AnalyzeRegionCandidateDto, LabelSuggestion } from "@/types/pdfTakeoff";

/** IoU threshold above which two same-color candidates are treated as one symbol. */
export const CANDIDATE_MERGE_IOU = 0.35;

export type MergeCandidatesResult = {
  /** Final candidates — raster-only, template-only and merged ("mixed"). */
  candidates: AnalyzeRegionCandidateDto[];
  /** Raw template matches before self-dedupe/merge (debug only). */
  templateMatchesBeforeDedupe: AnalyzeRegionCandidateDto[];
  /** How many template matches were merged into an existing raster candidate. */
  mergedWithRasterCount: number;
  /** How many template matches were dropped as duplicates of another template match. */
  dedupedTemplateCount: number;
};

function dedupeLabelSuggestions(list: LabelSuggestion[]): LabelSuggestion[] {
  const byLabel = new Map<string, LabelSuggestion>();
  for (const l of list) {
    const existing = byLabel.get(l.label);
    if (!existing || l.confidence > existing.confidence) byLabel.set(l.label, l);
  }
  return [...byLabel.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Merge raster/color candidates (source = "opencv") with template-match
 * candidates (source = "template_match") for the same analyzed region.
 */
export function mergeRasterAndTemplateCandidates(params: {
  rasterCandidates: AnalyzeRegionCandidateDto[];
  templateCandidates: AnalyzeRegionCandidateDto[];
  iouThreshold?: number;
}): MergeCandidatesResult {
  const {
    rasterCandidates,
    templateCandidates,
    iouThreshold = CANDIDATE_MERGE_IOU,
  } = params;

  const templateMatchesBeforeDedupe = templateCandidates;

  // 1) Dedupe template matches against each other first (same color layer,
  // overlapping) — keep the highest-confidence one, merge its labels.
  const sortedTemplates = [...templateCandidates].sort(
    (a, b) => b.confidence - a.confidence
  );
  const dedupedTemplates: AnalyzeRegionCandidateDto[] = [];
  let dedupedTemplateCount = 0;
  for (const t of sortedTemplates) {
    const dupIdx = dedupedTemplates.findIndex(
      (d) =>
        d.color_layer === t.color_layer &&
        normalizedRectOverlapRatio(d.normalized_position, t.normalized_position) >=
          iouThreshold
    );
    if (dupIdx >= 0) {
      const existing = dedupedTemplates[dupIdx]!;
      dedupedTemplates[dupIdx] = {
        ...existing,
        label_suggestions: dedupeLabelSuggestions([
          ...existing.label_suggestions,
          ...t.label_suggestions,
        ]),
      };
      dedupedTemplateCount++;
      continue;
    }
    dedupedTemplates.push(t);
  }

  // 2) Merge with raster candidates: same color layer + overlap ⇒ "mixed".
  const usedRasterIdx = new Set<number>();
  const merged: AnalyzeRegionCandidateDto[] = [];
  let mergedWithRasterCount = 0;

  for (const t of dedupedTemplates) {
    const matchIdx = rasterCandidates.findIndex(
      (r, idx) =>
        !usedRasterIdx.has(idx) &&
        r.color_layer === t.color_layer &&
        normalizedRectOverlapRatio(r.normalized_position, t.normalized_position) >=
          iouThreshold
    );
    if (matchIdx < 0) {
      merged.push(t);
      continue;
    }
    const r = rasterCandidates[matchIdx]!;
    usedRasterIdx.add(matchIdx);
    mergedWithRasterCount++;
    const bestConfidence = Number(Math.max(r.confidence, t.confidence).toFixed(3));
    // Prefer the geometry of whichever detector was more confident — both
    // already describe (roughly) the same symbol on the page.
    const base = t.confidence >= r.confidence ? t : r;
    merged.push({
      ...base,
      id: r.id, // keep the raster id stable — it may already be persisted
      label_suggestions: dedupeLabelSuggestions([
        ...r.label_suggestions,
        ...t.label_suggestions,
      ]),
      confidence: bestConfidence,
      source: "mixed",
      status: bestConfidence >= 0.55 ? "probable" : "candidate",
    });
  }

  for (let idx = 0; idx < rasterCandidates.length; idx++) {
    if (usedRasterIdx.has(idx)) continue;
    merged.push(rasterCandidates[idx]!);
  }

  return {
    candidates: merged,
    templateMatchesBeforeDedupe,
    mergedWithRasterCount,
    dedupedTemplateCount,
  };
}
