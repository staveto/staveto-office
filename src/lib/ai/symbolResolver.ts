/**
 * resolveDrawingSymbol — priority-based symbol meaning resolver.
 * Project legend always wins; AI never overrides legend.
 */

import {
  ELECTRICAL_STARTER_SYMBOL_PROFILE,
  SYMBOL_SOURCE_PRIORITY,
  matchStarterSymbol,
  toNormalizedElectricalPoint,
  type SymbolLibraryEntry,
  type SymbolSourceType,
} from "./electricalSymbolLibrary";
import type { NormalizedElectricalPoint } from "./electricalAssemblyTemplates";

export type DrawingSymbolCandidate = {
  id?: string;
  /** Visible mark / code on the drawing */
  symbolLabel?: string;
  /** Nearby OCR / legend text */
  textNearSymbol?: string;
  title?: string;
  /** AI visual guess (lowest priority) */
  aiGuessType?: string;
  aiGuessLabel?: string;
  overlapped?: boolean;
  page?: number;
  roomName?: string;
  quantity?: number;
  unit?: string;
};

export type LegendLike = {
  id?: string;
  symbolLabel?: string;
  symbolDescription: string;
  normalizedType?: string;
};

export type CompanySymbolMapping = {
  pattern: string;
  normalizedPoint: NormalizedElectricalPoint;
  displayName: string;
  sourceType?: "company_custom" | "user_confirmed";
};

export type ResolveDrawingSymbolContext = {
  projectLegendEntries?: LegendLike[];
  companyCustomMappings?: CompanySymbolMapping[];
  userConfirmedMappings?: CompanySymbolMapping[];
  countryCode?: string;
  trade?: "electrical" | "plumbing" | "hvac" | "general";
  /** Optional licensed pack entries when connected */
  licensedPackEntries?: SymbolLibraryEntry[];
  standardLibrary?: SymbolLibraryEntry[];
};

export type ResolvedDrawingSymbol = {
  candidateId?: string;
  matchedText: string;
  displayName: string;
  normalizedPoint: NormalizedElectricalPoint;
  sourceType: SymbolSourceType | "unknown";
  libraryEntryId?: string;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  reviewReason?: string;
  ambiguousAlternatives?: string[];
  roomName?: string;
  quantity?: number;
  unit?: string;
  page?: number;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function textBlob(c: DrawingSymbolCandidate): string {
  return [c.symbolLabel, c.textNearSymbol, c.title, c.aiGuessLabel]
    .filter(Boolean)
    .join(" ");
}

function matchMapping(
  blob: string,
  mappings: CompanySymbolMapping[] | undefined
): CompanySymbolMapping | null {
  if (!mappings?.length) return null;
  const hay = norm(blob);
  for (const m of mappings) {
    if (hay.includes(norm(m.pattern))) return m;
  }
  return null;
}

function matchLegend(
  candidate: DrawingSymbolCandidate,
  legend: LegendLike[] | undefined
): LegendLike | null {
  if (!legend?.length) return null;
  const label = norm(candidate.symbolLabel ?? "");
  const blob = norm(textBlob(candidate));
  for (const row of legend) {
    const legLabel = norm(row.symbolLabel ?? "");
    const desc = norm(row.symbolDescription);
    if (label && legLabel && (label === legLabel || label.includes(legLabel) || legLabel.includes(label))) {
      return row;
    }
    if (desc && blob.includes(desc)) return row;
    if (legLabel && blob.includes(legLabel)) return row;
  }
  return null;
}

function filterByCountry(
  entries: SymbolLibraryEntry[],
  countryCode?: string
): SymbolLibraryEntry[] {
  if (!countryCode) return entries;
  const cc = countryCode.toUpperCase();
  return entries.filter(
    (e) =>
      e.countryCodes.map((x) => x.toUpperCase()).includes(cc) ||
      e.countries.map((x) => x.toUpperCase()).includes(cc)
  );
}

function sourceRank(s: SymbolSourceType | "unknown"): number {
  if (s === "unknown") return 999;
  const i = SYMBOL_SOURCE_PRIORITY.indexOf(s);
  return i < 0 ? 50 : i;
}

/**
 * Resolve a drawing mark to a normalized electrical point.
 * Never drops unknowns — returns needsReview instead.
 */
export function resolveDrawingSymbol(
  candidate: DrawingSymbolCandidate,
  context: ResolveDrawingSymbolContext = {}
): ResolvedDrawingSymbol {
  const blob = textBlob(candidate);
  const base = {
    candidateId: candidate.id,
    roomName: candidate.roomName,
    quantity: candidate.quantity,
    unit: candidate.unit,
    page: candidate.page,
  };

  const ambiguous: string[] = [];
  let needsReview = Boolean(candidate.overlapped);
  let reviewReason: string | undefined = candidate.overlapped
    ? "Značka je prekrytá / nejednoznačná na výkrese."
    : undefined;

  // 1. Project legend
  const legendHit = matchLegend(candidate, context.projectLegendEntries);
  if (legendHit) {
    const fromDesc = matchStarterSymbol(legendHit.symbolDescription);
    const point =
      fromDesc?.normalizedPoint ??
      toNormalizedElectricalPoint(legendHit.normalizedType ?? "unknown");
    if (point === "unknown") {
      needsReview = true;
      reviewReason = reviewReason ?? "Legenda má riadok, ale typ nie je spoľahlivo mapovaný.";
    }
    return {
      ...base,
      matchedText: legendHit.symbolDescription,
      displayName: legendHit.symbolDescription,
      normalizedPoint: point,
      sourceType: "project_legend",
      libraryEntryId: fromDesc?.id,
      confidence: point === "unknown" ? "low" : "high",
      needsReview: needsReview || point === "unknown",
      reviewReason,
    };
  }

  // 2. User confirmed
  const userHit = matchMapping(blob, context.userConfirmedMappings);
  if (userHit) {
    return {
      ...base,
      matchedText: userHit.pattern,
      displayName: userHit.displayName,
      normalizedPoint: userHit.normalizedPoint,
      sourceType: "user_confirmed",
      confidence: "high",
      needsReview: needsReview,
      reviewReason,
    };
  }

  // 3. Company custom
  const companyHit = matchMapping(blob, context.companyCustomMappings);
  if (companyHit) {
    return {
      ...base,
      matchedText: companyHit.pattern,
      displayName: companyHit.displayName,
      normalizedPoint: companyHit.normalizedPoint,
      sourceType: "company_custom",
      confidence: "high",
      needsReview: needsReview,
      reviewReason,
    };
  }

  // 4. Licensed pack
  const licensed = filterByCountry(
    context.licensedPackEntries ?? [],
    context.countryCode
  );
  for (const e of licensed) {
    if (e.aliases.some((a) => norm(blob).includes(norm(a)))) {
      return {
        ...base,
        matchedText: e.displayName,
        displayName: e.displayName,
        normalizedPoint: e.normalizedPoint,
        sourceType: "licensed_standard_pack",
        libraryEntryId: e.id,
        confidence: "high",
        needsReview,
        reviewReason,
      };
    }
  }

  // 5. Standard metadata / starter aliases — most specific (longest) alias wins.
  const library = filterByCountry(
    context.standardLibrary ?? ELECTRICAL_STARTER_SYMBOL_PROFILE,
    context.countryCode
  );
  const hay = norm(blob);
  const scored = library
    .map((e) => {
      const matched = [...e.aliases, ...e.textPatterns].filter((a) =>
        hay.includes(norm(a))
      );
      const score = matched.reduce((max, a) => Math.max(max, norm(a).length), 0);
      return { entry: e, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const metaHits = scored.map((s) => s.entry);
  if (metaHits.length > 1) {
    const points = [...new Set(metaHits.map((h) => h.normalizedPoint))];
    // Only ambiguous when the best matches are equally specific but disagree.
    if (points.length > 1 && scored[0].score === scored[1].score &&
        scored[0].entry.normalizedPoint !== scored[1].entry.normalizedPoint) {
      needsReview = true;
      reviewReason = "Viaceré možné významy — treba potvrdiť.";
      ambiguous.push(...metaHits.map((h) => h.displayName));
    }
  }
  if (metaHits[0]) {
    const hit = metaHits[0];
    return {
      ...base,
      matchedText: hit.displayName,
      displayName: hit.displayName,
      normalizedPoint: hit.normalizedPoint,
      sourceType: "standard_reference_metadata",
      libraryEntryId: hit.id,
      confidence: needsReview ? "medium" : "medium",
      needsReview,
      reviewReason,
      ambiguousAlternatives: ambiguous.length ? ambiguous : undefined,
    };
  }

  // 6. AI inferred (never overrides above)
  if (candidate.aiGuessType || candidate.aiGuessLabel) {
    const guessText = candidate.aiGuessLabel || candidate.aiGuessType || "";
    const fromGuess = matchStarterSymbol(guessText);
    const point =
      fromGuess?.normalizedPoint ??
      toNormalizedElectricalPoint(candidate.aiGuessType ?? "unknown");
    return {
      ...base,
      matchedText: guessText,
      displayName: fromGuess?.displayName || guessText || "AI odhad",
      normalizedPoint: point,
      sourceType: "ai_inferred",
      libraryEntryId: fromGuess?.id,
      confidence: "low",
      needsReview: true,
      reviewReason:
        reviewReason ??
        "Význam z AI odhadu — potvrďte podľa legendy alebo ručne.",
    };
  }

  // 7. Unknown — never drop
  return {
    ...base,
    matchedText: blob || candidate.symbolLabel || "Neznáma značka",
    displayName: candidate.title || candidate.symbolLabel || "Neznáma značka",
    normalizedPoint: "unknown",
    sourceType: "unknown",
    confidence: "low",
    needsReview: true,
    reviewReason: reviewReason ?? "Značku sa nepodarilo spoľahlivo identifikovať.",
  };
}

export function compareSourcePriority(
  a: SymbolSourceType | "unknown",
  b: SymbolSourceType | "unknown"
): number {
  return sourceRank(a) - sourceRank(b);
}
