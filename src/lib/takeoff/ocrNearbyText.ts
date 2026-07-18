/**
 * Phase 3B — nearby OCR text selection (pure logic, no OCR engine here).
 *
 * OCR is CONTEXT ONLY: these helpers attach a short nearbyText string to
 * symbol candidates for operator review. They never touch status, labels,
 * confidence, confirmedSymbols, takeoffItems or quote quantities.
 */

import type { NormalizedRect } from "@/types/drawingTakeoff";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";

/** One recognized text line in normalized (0..1) page coordinates. */
export type OcrTextLine = {
  text: string;
  /** Normalized page bbox of the line. */
  bbox: NormalizedRect;
  /** Engine confidence 0..1 (best effort). */
  confidence: number;
};

export type OcrRegionResult = {
  fullText: string;
  lines: OcrTextLine[];
};

export type NearbyTextOptions = {
  /** Max gap between candidate and line, as a multiple of the candidate's larger side. */
  maxGapFactor?: number;
  /** Absolute normalized-distance ceiling (legend text is typically far). */
  maxGapAbsolute?: number;
  /** Max joined text length stored on the candidate (Firestore stays small). */
  maxTextLength?: number;
  /** Max number of lines joined. */
  maxLines?: number;
  /** Minimum OCR confidence for a line to count. */
  minConfidence?: number;
};

const DEFAULTS: Required<NearbyTextOptions> = {
  maxGapFactor: 3,
  maxGapAbsolute: 0.06,
  maxTextLength: 120,
  maxLines: 3,
  minConfidence: 0.35,
};

/** Shortest gap between two normalized rects (0 when they touch/overlap). */
export function normalizedRectGap(a: NormalizedRect, b: NormalizedRect): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.hypot(dx, dy);
}

/**
 * Dimension-like strings ("2400", "1.200", "350 x 200", "Ø 60") carry little
 * review value on their own — ignore pure measurements without letters.
 */
export function isDimensionLikeText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 4) return false;
  return /^[\d\s.,:×xX+\-–—Øø⌀°%/()]+$/.test(trimmed) && /\d/.test(trimmed);
}

function cleanLineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Pick short review-relevant text near a candidate bbox. Far text (legend
 * blocks, title rows) and bare dimension strings are ignored.
 */
export function selectNearbyText(
  candidateBbox: NormalizedRect,
  lines: OcrTextLine[],
  options?: NearbyTextOptions
): string | null {
  const opts = { ...DEFAULTS, ...options };
  const reach = Math.min(
    opts.maxGapAbsolute,
    Math.max(candidateBbox.width, candidateBbox.height) * opts.maxGapFactor
  );

  const scored = lines
    .map((line) => ({ line, gap: normalizedRectGap(candidateBbox, line.bbox) }))
    .filter(({ line, gap }) => {
      const text = cleanLineText(line.text);
      if (!text) return false;
      if (line.confidence < opts.minConfidence) return false;
      if (gap > reach) return false;
      if (isDimensionLikeText(text)) return false;
      return true;
    })
    .sort((a, b) => a.gap - b.gap)
    .slice(0, opts.maxLines);

  if (scored.length === 0) return null;

  let joined = "";
  for (const { line } of scored) {
    const text = cleanLineText(line.text);
    const next = joined ? `${joined} · ${text}` : text;
    if (next.length > opts.maxTextLength) break;
    joined = next;
  }
  return joined || null;
}

/**
 * Attach nearbyText to candidates. Confirmed/rejected candidates are left
 * untouched (OCR must never overwrite user-reviewed data), and candidates
 * without nearby text stay valid with nearby_text = null.
 */
export function attachNearbyTextToCandidates(
  candidates: AnalyzeRegionCandidateDto[],
  ocr: OcrRegionResult | null,
  options?: NearbyTextOptions
): AnalyzeRegionCandidateDto[] {
  if (!ocr || ocr.lines.length === 0) return candidates;
  return candidates.map((c) => {
    if (c.status === "confirmed" || c.status === "rejected") return c;
    const text = selectNearbyText(c.normalized_position, ocr.lines, options);
    if (!text) return c;
    return { ...c, nearby_text: c.nearby_text ? c.nearby_text : text };
  });
}

/** Fraction of the candidate's own area that sits inside an OCR line's bbox. */
function containmentRatio(candidateBbox: NormalizedRect, lineBbox: NormalizedRect): number {
  const ix = Math.max(
    0,
    Math.min(candidateBbox.x + candidateBbox.width, lineBbox.x + lineBbox.width) -
      Math.max(candidateBbox.x, lineBbox.x)
  );
  const iy = Math.max(
    0,
    Math.min(candidateBbox.y + candidateBbox.height, lineBbox.y + lineBbox.height) -
      Math.max(candidateBbox.y, lineBbox.y)
  );
  const inter = ix * iy;
  const area = candidateBbox.width * candidateBbox.height;
  return area > 0 ? inter / area : 0;
}

/** OCR text containing at least one letter (numeric callouts stay candidates). */
function hasLetters(text: string): boolean {
  return /[A-Za-zÀ-ž]/.test(text);
}

export type OverlapsTextFilterOptions = {
  /** Min fraction of the candidate's own area inside a text line to reject it. */
  minContainment?: number;
  minConfidence?: number;
};

const OVERLAPS_TEXT_DEFAULTS: Required<OverlapsTextFilterOptions> = {
  minContainment: 0.5,
  minConfidence: 0.35,
};

/**
 * Drop raster/mixed symbol_candidates that sit mostly inside a real OCR text
 * line (a colored word/label, not a symbol). Never touches confirmed/rejected
 * candidates, manual marks, or template_match candidates (those come from a
 * confirmed reference shape, not raw color pixels) — only used as an extra
 * raster-noise filter, and OCR stays context-only: no quantities/statuses of
 * the *kept* candidates are altered here.
 */
export function filterCandidatesOverlappingOcrText(
  candidates: AnalyzeRegionCandidateDto[],
  ocr: OcrRegionResult | null,
  options?: OverlapsTextFilterOptions
): { candidates: AnalyzeRegionCandidateDto[]; rejectedIds: string[] } {
  if (!ocr || ocr.lines.length === 0) return { candidates, rejectedIds: [] };
  const opts = { ...OVERLAPS_TEXT_DEFAULTS, ...options };
  const rejectedIds: string[] = [];

  const kept = candidates.filter((c) => {
    if (c.status === "confirmed" || c.status === "rejected") return true;
    if (c.source === "manual" || c.source === "template_match" || c.source === "mixed") {
      return true;
    }
    if (c.kind !== "symbol_candidate") return true;

    const overlapsText = ocr.lines.some((line) => {
      const text = cleanLineText(line.text);
      if (!text || !hasLetters(text)) return false;
      if (line.confidence < opts.minConfidence) return false;
      return containmentRatio(c.normalized_position, line.bbox) >= opts.minContainment;
    });
    if (overlapsText) {
      rejectedIds.push(c.id);
      return false;
    }
    return true;
  });

  return { candidates: kept, rejectedIds };
}
