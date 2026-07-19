/**
 * Phase 3A — "Find similar" from one confirmed symbol.
 *
 * Pure logic only: turn raster template matches into probable symbol
 * candidates for human review. Never confirms, never touches quantities.
 *
 * Exclusions:
 *  - matches overlapping existing confirmed symbols (already counted)
 *  - matches overlapping existing candidates (already suggested/rejected)
 *  - overlapping duplicate matches from the same run (keep best score)
 *  - degenerate long/thin boxes (lines / dimensions)
 */

import type { NormalizedRect } from "@/types/drawingTakeoff";
import type {
  AnalyzeRegionCandidateDto,
  SymbolColorLayer,
} from "@/types/pdfTakeoff";
import {
  defaultLabelForSymbolType,
  normalizedRectCoverageRatio,
  normalizedRectOverlapRatio,
} from "@/lib/takeoff/candidateReview";
import { normalizedRectToBBoxPdf } from "@/lib/takeoff/regionAnalyzer";

export type SimilarMatchInput = {
  pageNumber: number;
  normalizedPosition: NormalizedRect;
  /** Similarity score 0..1 (NCC or shape score). */
  matchScore: number;
};

export type ExistingRect = {
  pageNumber: number;
  normalizedPosition: NormalizedRect;
  /** Only for candidates — confirmed symbols block regardless of status. */
  status?: string;
};

export const FIND_SIMILAR_DEFAULT_THRESHOLD = 0.75;
export const FIND_SIMILAR_MAX_RESULTS = 100;
const EXCLUSION_IOU = 0.3;
const DEDUPE_IOU = 0.5;
const MAX_LINE_ASPECT = 6;

function overlapsAny(
  match: SimilarMatchInput,
  existing: ExistingRect[],
  coverage = EXCLUSION_IOU
): boolean {
  // Coverage (intersection over the smaller rect) instead of IoU: an
  // existing small point mark inside a bigger proposed box must block the
  // proposal even though their IoU is tiny.
  return existing.some(
    (e) =>
      e.pageNumber === match.pageNumber &&
      normalizedRectCoverageRatio(e.normalizedPosition, match.normalizedPosition) >= coverage
  );
}

/**
 * Filter raw template matches against threshold, exclusions and self-overlap,
 * then build probable candidate DTOs (source = template_match).
 */
export function buildSimilarCandidates(params: {
  matches: SimilarMatchInput[];
  sourceSymbol: {
    id: string;
    symbolType: string;
    colorLayer: SymbolColorLayer;
    pageNumber: number;
    normalizedPosition: NormalizedRect;
  };
  confirmedSymbols: ExistingRect[];
  existingCandidates: ExistingRect[];
  /** Legacy manual marks (drawingOccurrences) — also block proposals. */
  existingOccurrences?: ExistingRect[];
  threshold?: number;
  maxResults?: number;
  /** PDF page size in points — bbox_pdf is emitted in points when known. */
  pageWidthPt?: number;
  pageHeightPt?: number;
}): AnalyzeRegionCandidateDto[] {
  const {
    matches,
    sourceSymbol,
    confirmedSymbols,
    existingCandidates,
    existingOccurrences = [],
    threshold = FIND_SIMILAR_DEFAULT_THRESHOLD,
    maxResults = FIND_SIMILAR_MAX_RESULTS,
    pageWidthPt,
    pageHeightPt,
  } = params;

  const label = defaultLabelForSymbolType(sourceSymbol.symbolType);
  const sourceRect: ExistingRect = {
    pageNumber: sourceSymbol.pageNumber,
    normalizedPosition: sourceSymbol.normalizedPosition,
  };

  const accepted: SimilarMatchInput[] = [];
  const sorted = [...matches].sort((a, b) => b.matchScore - a.matchScore);

  for (const m of sorted) {
    if (m.matchScore < threshold) continue;
    const { width, height } = m.normalizedPosition;
    if (width <= 0 || height <= 0) continue;
    const aspect = Math.max(width, height) / Math.min(width, height);
    if (aspect > MAX_LINE_ASPECT) continue;
    if (overlapsAny(m, [sourceRect], 0.4)) continue;
    if (overlapsAny(m, confirmedSymbols)) continue;
    if (overlapsAny(m, existingCandidates)) continue;
    if (overlapsAny(m, existingOccurrences)) continue;
    // Dedupe against already-accepted (higher-score) matches.
    if (
      accepted.some(
        (a) =>
          a.pageNumber === m.pageNumber &&
          normalizedRectOverlapRatio(a.normalizedPosition, m.normalizedPosition) >=
            DEDUPE_IOU
      )
    ) {
      continue;
    }
    accepted.push(m);
    if (accepted.length >= maxResults) break;
  }

  const usePoints =
    typeof pageWidthPt === "number" &&
    pageWidthPt > 0 &&
    typeof pageHeightPt === "number" &&
    pageHeightPt > 0;

  return accepted.map((m, i) => {
    const confidence = Number(Math.min(0.95, Math.max(0, m.matchScore)).toFixed(3));
    return {
      id: `cand_sim_${sourceSymbol.id}_${m.pageNumber}_${i}`,
      page_number: m.pageNumber,
      bbox_pdf: usePoints
        ? normalizedRectToBBoxPdf(m.normalizedPosition, pageWidthPt!, pageHeightPt!)
        : [
            m.normalizedPosition.x,
            m.normalizedPosition.y,
            m.normalizedPosition.x + m.normalizedPosition.width,
            m.normalizedPosition.y + m.normalizedPosition.height,
          ],
      bbox_px: [0, 0, 0, 0],
      color_layer: sourceSymbol.colorLayer,
      kind: "symbol_candidate" as const,
      label_suggestions: [{ label, confidence }],
      nearby_text: null,
      confidence,
      source: "template_match" as const,
      status: "probable" as const,
      preview_image_url: null,
      normalized_position: m.normalizedPosition,
    };
  });
}
