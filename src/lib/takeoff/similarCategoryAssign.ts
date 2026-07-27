import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";
import {
  defaultLabelForSymbolType,
  defaultSymbolTypeForCandidate,
} from "@/lib/takeoff/candidateReview";
import { categoryKeyForLabel, categoryLabelForCandidate } from "@/lib/takeoff/takeoffCategories";

/**
 * True when the mark still carries only the generic type name
 * ("zásuvka" / "vypínač" / …) rather than an operator-chosen product name.
 */
export function isGenericTypeLabel(label: string, symbolType: string): boolean {
  const key = categoryKeyForLabel(label);
  const generic = categoryKeyForLabel(defaultLabelForSymbolType(symbolType));
  return key === generic;
}

/**
 * Confirmed marks that should join the reference product category:
 * same symbol type, still on the generic type label ("zásuvka"), not already
 * on the target. Covers leftover template/AI hits from an earlier search.
 */
export function findConfirmedPeersToAssign(params: {
  candidates: AnalyzeRegionCandidateDto[];
  targetLabel: string;
  /** Symbol type of the reference mark (socket / switch / …). */
  symbolType: string;
  /** Optional — skip this candidate id (the reference mark itself). */
  excludeCandidateId?: string;
}): AnalyzeRegionCandidateDto[] {
  const targetKey = categoryKeyForLabel(params.targetLabel);
  const refType = params.symbolType;
  if (!params.targetLabel.trim()) return [];
  if (isGenericTypeLabel(params.targetLabel, refType)) return [];

  return params.candidates.filter((c) => {
    if (params.excludeCandidateId && c.id === params.excludeCandidateId) return false;
    if (c.status !== "confirmed") return false;
    if (defaultSymbolTypeForCandidate(c) !== refType) return false;
    const label = categoryLabelForCandidate(c);
    if (categoryKeyForLabel(label) === targetKey) return false;
    return isGenericTypeLabel(label, refType);
  });
}
