/**
 * Extraction quality report for the AI estimator.
 *
 * Measures what was actually read from a real drawing (rooms, legend,
 * symbol occurrences, critical categories) and blocks a fixed quote when
 * the drawing clearly mentions sockets/switches but the takeoff has none.
 * Never hides uncertainty — missing categories become explicit warnings.
 */

import type {
  AiEstimatorFacts,
  AiExtractedItem,
  AiSymbolBBox,
} from "@/types/aiEstimator";
import type {
  AssemblyInstance,
  MapSymbolsToAssembliesResult,
} from "./mapSymbolsToAssemblies";
import type { NormalizedElectricalPoint } from "./electricalAssemblyTemplates";
import type { VisualSymbolDetection } from "@/types/visualSymbols";

export type EstimatorExtractionQualityReport = {
  roomsDetected: number;
  legendEntriesDetected: number;
  symbolOccurrencesDetected: number;
  socketsDetected: number;
  /** Total switches = text + visual (kept for backward compatibility). */
  switchesDetected: number;
  switchesDetectedFromText: number;
  switchesDetectedFromVisual: number;
  switchesDetectedTotal: number;
  lightOutputsDetected: number;
  ledItemsDetected: number;
  cableItemsDetected: number;
  unknownSymbols: number;
  needsReviewCount: number;
  visualDetectionsCount: number;
  visualDetectionsNeedsReview: number;
  missingCriticalCategories: string[];
  fixedQuoteBlocked: boolean;
};

export const QUALITY_MSG_SOCKETS_MISSING_SK =
  "Vo výkrese sa nachádzajú zásuvky, ale výkaz zásuviek nie je kompletný.";
export const QUALITY_MSG_SWITCHES_MISSING_SK =
  "Vo výkrese sa nachádzajú vypínače/spínače, ale neboli spoľahlivo spočítané.";
/** Weak evidence only (AI narrative mentions switches, no text label in drawing). */
export const QUALITY_MSG_SWITCHES_PROBABLE_SK =
  "Vypínače sú vo výkrese pravdepodobne prítomné, ale neboli spoľahlivo spočítané.";
/** Switches found only by the pixel-level visual counter — must be confirmed. */
export const QUALITY_MSG_SWITCHES_VISUAL_ONLY_SK =
  "Vypínače rozpoznané iba vizuálne — skontrolujte výrezy.";

const SOCKET_POINTS: NormalizedElectricalPoint[] = [
  "socket_point",
  "double_socket_point",
];
const SWITCH_POINTS: NormalizedElectricalPoint[] = ["switch_point", "dimmer_point"];
const LIGHT_POINTS: NormalizedElectricalPoint[] = [
  "light_output",
  "ceiling_light_point",
  "pendant_light_point",
  "wall_light_point",
  "mirror_light_output",
  "furniture_light_output",
];

const SOCKET_TEXT = /el\.?\s*zásuv|zásuvk|zasuvk|dvojzásuv/i;
const SWITCH_TEXT = /spínač|spinac|vypínač|vypinac/i;
/** Weak signal: AI narrative/summary mentions switches (any language). */
const SWITCH_TEXT_WEAK = /switch|schalter|spínač|spinac|vypínač|vypinac/i;

function itemQty(i: AiExtractedItem): number {
  const q = i.computedQuantity ?? i.quantity;
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 0;
}

function sumItems(
  items: AiExtractedItem[],
  pred: (i: AiExtractedItem) => boolean
): number {
  return items
    .filter((i) => i.included !== false && pred(i))
    .reduce((s, i) => s + itemQty(i), 0);
}

function sumAssemblies(
  assemblies: AssemblyInstance[],
  points: NormalizedElectricalPoint[]
): number {
  return assemblies
    .filter((a) => points.includes(a.normalizedPoint))
    .reduce((s, a) => s + (a.quantity ?? 0), 0);
}

/** Text actually read from the drawing — legend, occurrences, items (strong evidence). */
export function collectDrawingTextHints(facts: AiEstimatorFacts): string[] {
  return [
    ...(facts.legendEntries ?? []).map(
      (l) => `${l.symbolLabel ?? ""} ${l.symbolDescription}`
    ),
    ...(facts.symbolOccurrences ?? []).map(
      (s) => `${s.visibleLabel ?? ""} ${s.title}`
    ),
    ...(facts.unknownSymbols ?? []).map((s) => `${s.visibleLabel ?? ""} ${s.title}`),
    ...facts.extractedItems.map((i) => `${i.symbolCode ?? ""} ${i.title}`),
    ...facts.inferredItems.map((i) => i.title),
  ].filter((t) => t.trim().length > 0);
}

/** AI narrative — summary/warnings. Weaker evidence than drawing text. */
export function collectNarrativeHints(facts: AiEstimatorFacts): string[] {
  return [facts.inputSummary ?? "", ...(facts.warnings ?? [])].filter(
    (t) => t.trim().length > 0
  );
}

export type ExtractionQualityResult = {
  report: EstimatorExtractionQualityReport;
  /** Exact SK warnings for the "Na kontrolu" view. */
  criticalWarnings: string[];
};

/**
 * Build the quality report from estimator facts, optionally enriched with
 * knowledge-backend mapping output (resolved symbols → assemblies).
 */
export function buildEstimatorExtractionQualityReport(input: {
  facts: AiEstimatorFacts;
  mapped?: MapSymbolsToAssembliesResult | null;
  /** Pixel-level detections (already merged with OCR occurrences upstream). */
  visualDetections?: VisualSymbolDetection[] | null;
}): ExtractionQualityResult {
  const { facts, mapped } = input;
  const visualDetections = input.visualDetections ?? facts.visualDetections ?? [];
  const items = [...facts.extractedItems, ...facts.inferredItems];
  const assemblies = mapped?.assemblies ?? [];

  const socketsDetected = Math.max(
    sumItems(items, (i) => i.category === "socket"),
    sumAssemblies(assemblies, SOCKET_POINTS)
  );
  const switchesDetectedFromText = Math.max(
    sumItems(items, (i) => i.category === "switch"),
    sumAssemblies(assemblies, SWITCH_POINTS)
  );
  const visualSwitchDetections = visualDetections.filter(
    (d) => d.normalizedPoint === "switch_point"
  );
  const switchesDetectedFromVisual = visualSwitchDetections.length;
  const switchesDetected = switchesDetectedFromText + switchesDetectedFromVisual;
  const lightOutputsDetected = Math.max(
    sumItems(
      items,
      (i) => i.category === "lighting" && !/led/i.test(i.title)
    ),
    sumAssemblies(assemblies, LIGHT_POINTS)
  );
  const ledItemsDetected = Math.max(
    sumItems(items, (i) => i.category === "led_strip"),
    sumAssemblies(assemblies, ["led_strip_point"])
  );
  const cableItemsDetected = Math.max(
    sumItems(items, (i) => i.category === "cable"),
    assemblies.filter((a) => a.normalizedPoint === "cable_route").length
  );

  const unknownSymbols = Math.max(
    facts.unknownSymbols?.length ?? 0,
    mapped?.reviewOnlySymbols.length ?? 0
  );

  const visualDetectionsNeedsReview = visualDetections.filter(
    (d) => d.needsReview
  ).length;

  const needsReviewCount =
    items.filter((i) => i.included !== false && i.needsReview).length +
    (facts.symbolOccurrences ?? []).filter((s) => s.needsReview).length +
    unknownSymbols +
    visualDetectionsNeedsReview +
    facts.missingQuestions.filter(
      (q) => q.blocksFixedQuote || q.importance === "critical"
    ).length;

  // Phase 3 — explicit socket/switch validation against drawing text.
  // Strong evidence = text read from the drawing (legend/occurrences/items).
  // Weak evidence = AI narrative only (switch symbols often carry no text label).
  const hints = collectDrawingTextHints(facts).join("\n");
  const narrative = collectNarrativeHints(facts).join("\n");
  const missingCriticalCategories: string[] = [];
  const criticalWarnings: string[] = [];

  if ((SOCKET_TEXT.test(hints) || SOCKET_TEXT.test(narrative)) && socketsDetected === 0) {
    missingCriticalCategories.push("sockets");
    criticalWarnings.push(QUALITY_MSG_SOCKETS_MISSING_SK);
  }
  if (switchesDetected === 0) {
    if (SWITCH_TEXT.test(hints)) {
      missingCriticalCategories.push("switches");
      criticalWarnings.push(QUALITY_MSG_SWITCHES_MISSING_SK);
    } else if (SWITCH_TEXT_WEAK.test(narrative) || lightOutputsDetected > 0) {
      // Lights without any switches, or narrative mentions — probably present.
      missingCriticalCategories.push("switches");
      criticalWarnings.push(QUALITY_MSG_SWITCHES_PROBABLE_SK);
    }
  } else if (
    switchesDetectedFromText === 0 &&
    switchesDetectedFromVisual > 0 &&
    visualSwitchDetections.some((d) => d.needsReview)
  ) {
    // Visual-only switch candidates — fixed quote stays blocked until confirmed.
    missingCriticalCategories.push("switches");
    criticalWarnings.push(QUALITY_MSG_SWITCHES_VISUAL_ONLY_SK);
  }

  const fixedQuoteBlocked =
    missingCriticalCategories.length > 0 ||
    unknownSymbols > 0 ||
    Boolean(mapped?.blocksFixedQuote) ||
    facts.missingQuestions.some((q) => q.blocksFixedQuote);

  return {
    report: {
      roomsDetected: facts.rooms.length,
      legendEntriesDetected: facts.legendEntries?.length ?? 0,
      symbolOccurrencesDetected: facts.symbolOccurrences?.length ?? 0,
      socketsDetected,
      switchesDetected,
      switchesDetectedFromText,
      switchesDetectedFromVisual,
      switchesDetectedTotal: switchesDetected,
      lightOutputsDetected,
      ledItemsDetected,
      cableItemsDetected,
      unknownSymbols,
      needsReviewCount,
      visualDetectionsCount: visualDetections.length,
      visualDetectionsNeedsReview,
      missingCriticalCategories,
      fixedQuoteBlocked,
    },
    criticalWarnings,
  };
}

/** Compact SK summary — legend rows and drawing occurrences reported separately. */
export function formatExtractionSummarySk(
  report: EstimatorExtractionQualityReport,
  _itemCount?: number
): string {
  return `Našli sme: ${report.roomsDetected} miestností, ${report.legendEntriesDetected} položiek legendy, ${report.symbolOccurrencesDetected} značiek vo výkrese, ${report.needsReviewCount} bodov na kontrolu.`;
}

// ---------------------------------------------------------------------------
// Phase 4 — assembly expansion validation
// ---------------------------------------------------------------------------

export type AssemblyExpansionValidation = {
  ok: boolean;
  problems: string[];
};

/**
 * Every resolved (non-unknown) symbol must expand through a template into
 * material + labor components; unknown symbols must never join quote groups.
 */
export function validateAssemblyExpansion(
  mapped: MapSymbolsToAssembliesResult
): AssemblyExpansionValidation {
  const problems: string[] = [];

  for (const resolved of mapped.resolvedSymbols) {
    if (resolved.normalizedPoint === "unknown") continue;
    const assembly = mapped.assemblies.find(
      (a) => a.sourceSymbolId === (resolved.candidateId ?? "unknown")
    );
    if (!assembly) {
      problems.push(
        `Bod ${resolved.normalizedPoint} („${resolved.displayName}“) nemá zostavu (assembly template).`
      );
      continue;
    }
    if (assembly.materialLines.length === 0) {
      problems.push(`${assembly.assemblyTitle}: zostava nemá materiálové položky.`);
    }
    if (assembly.laborLines.length === 0) {
      problems.push(`${assembly.assemblyTitle}: zostava nemá položky práce.`);
    }
  }

  const groupedIds = new Set(mapped.quoteGroups.flatMap((g) => g.assemblyIds));
  for (const a of mapped.assemblies) {
    if (
      a.normalizedPoint === "unknown" &&
      a.assemblyTemplateId !== "testing_revision" &&
      groupedIds.has(a.id)
    ) {
      problems.push(
        `Neznáma značka „${a.recognizedAs}“ sa dostala do ponukovej skupiny — nesmie tvoriť pevnú položku.`
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------
// Phase 5 — source evidence (no undefined source/page/confidence)
// ---------------------------------------------------------------------------

export type EstimatorEvidenceSourceType =
  | "project_legend"
  | "drawing_text"
  | "symbol_library"
  | "ai_inferred"
  | "user_confirmed";

export type EstimatorSourceEvidence = {
  fileName: string;
  page: number;
  sourceText: string | null;
  sourceType: EstimatorEvidenceSourceType;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
  /** Placeholder for future visual review — null until real crops exist. */
  bbox: AiSymbolBBox | null;
};

/**
 * Normalize evidence so Firestore never stores undefined source/page/confidence.
 * Unknown values become explicit defaults, not missing fields.
 */
export function normalizeSourceEvidence(
  partial: Partial<EstimatorSourceEvidence> | undefined,
  fallbackFileName?: string
): EstimatorSourceEvidence {
  const sourceType: EstimatorEvidenceSourceType =
    partial?.sourceType &&
    ["project_legend", "drawing_text", "symbol_library", "ai_inferred", "user_confirmed"].includes(
      partial.sourceType
    )
      ? partial.sourceType
      : "ai_inferred";
  return {
    fileName: partial?.fileName?.trim() || fallbackFileName?.trim() || "unknown-file",
    page:
      typeof partial?.page === "number" && Number.isFinite(partial.page) && partial.page > 0
        ? partial.page
        : 1,
    sourceText: partial?.sourceText?.trim() || null,
    sourceType,
    confidence:
      partial?.confidence === "high" || partial?.confidence === "low"
        ? partial.confidence
        : "medium",
    needsReview: partial?.needsReview ?? sourceType === "ai_inferred",
    bbox: partial?.bbox ?? null,
  };
}

/** Map resolver source types onto evidence source types. */
export function evidenceSourceTypeFromResolver(
  resolverSource: string
): EstimatorEvidenceSourceType {
  switch (resolverSource) {
    case "project_legend":
      return "project_legend";
    case "user_confirmed":
      return "user_confirmed";
    case "company_custom":
      return "user_confirmed";
    case "licensed_standard_pack":
    case "standard_reference_metadata":
      return "symbol_library";
    case "ai_inferred":
      return "ai_inferred";
    default:
      return "ai_inferred";
  }
}
