/**
 * Conservative merge/dedup for estimator facts.
 * Never collapse room-level LED/lighting rows into generics.
 */

import type { EstimatorFactsPayload } from "./estimatorSchema";

type ExtractedItemPayload = EstimatorFactsPayload["extractedItems"][number];
type ExtractedRoomPayload = EstimatorFactsPayload["rooms"][number];
type MissingQuestionPayload = EstimatorFactsPayload["missingQuestions"][number];
type RiskWarningPayload = EstimatorFactsPayload["risks"][number];
type LegendEntryPayload = EstimatorFactsPayload["legendEntries"][number];
type SymbolOccurrencePayload = EstimatorFactsPayload["symbolOccurrences"][number];
type CompanyFocusPayload = EstimatorFactsPayload["companyFocus"][number];
type DrawingRegionPayload = EstimatorFactsPayload["drawingRegions"][number];

function legendKey(l: LegendEntryPayload): string {
  return `${norm(l.symbolLabel)}|${norm(l.symbolDescription)}|${l.normalizedType}`;
}

function symbolKey(s: SymbolOccurrencePayload): string {
  const qty = s.quantity;
  return [
    s.normalizedType,
    norm(s.title),
    norm(s.roomName),
    qty == null ? "" : String(qty),
    norm(s.unit),
    norm(s.evidence?.[0]?.fileName),
    s.evidence?.[0]?.page ?? "",
  ].join("||");
}

function focusKey(f: CompanyFocusPayload): string {
  return `${f.focusType}|${norm(f.title)}`;
}

function regionKey(r: DrawingRegionPayload): string {
  return `${r.page}|${r.regionType}|${norm(r.label)}`;
}

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function evidenceKey(item: ExtractedItemPayload): string {
  const e = item.evidence?.[0];
  return `${norm(e?.fileName)}|${e?.page ?? ""}|${norm(e?.regionLabel)}`;
}

/** Exact-ish identity for document rows — room + title + qty + unit + source. */
export function extractedItemDedupeKey(item: ExtractedItemPayload): string {
  const qty = item.computedQuantity ?? item.quantity;
  return [
    norm(item.title),
    norm(item.roomName),
    qty == null ? "" : String(qty),
    norm(item.unit),
    evidenceKey(item),
  ].join("||");
}

export function roomDedupeKey(room: ExtractedRoomPayload): string {
  return `${norm(room.name)}|${norm(room.floor)}|${room.areaM2 ?? ""}`;
}

function questionKey(q: MissingQuestionPayload): string {
  return norm(q.question);
}

function riskKey(r: RiskWarningPayload): string {
  return `${norm(r.title)}|${norm(r.description)}`;
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      if (!key) out.push(item);
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Merge multi-page / multi-file fact parts.
 * Dedupes only when title+room+qty+unit+source match (or room name+floor+area).
 * Never merges inferred into extracted.
 */
export function mergeEstimatorFactsStrict(
  sessionId: string,
  parts: EstimatorFactsPayload[]
): EstimatorFactsPayload {
  if (parts.length === 0) {
    return {
      sessionId,
      detectedDocumentTypes: ["unknown"],
      inputSummary: "",
      rooms: [],
      extractedItems: [],
      inferredItems: [],
      missingQuestions: [],
      risks: [],
      confidence: "low",
      warnings: ["No estimator facts produced."],
      drawingRegions: [],
      legendEntries: [],
      symbolOccurrences: [],
      unknownSymbols: [],
      companyFocus: [],
    };
  }

  const rooms = dedupeByKey(
    parts.flatMap((p) => p.rooms),
    roomDedupeKey
  );
  const extractedItems = dedupeByKey(
    parts.flatMap((p) => p.extractedItems),
    extractedItemDedupeKey
  );
  const inferredItems = dedupeByKey(
    parts.flatMap((p) => p.inferredItems),
    extractedItemDedupeKey
  );
  const missingQuestions = dedupeByKey(
    parts.flatMap((p) => p.missingQuestions),
    questionKey
  );
  const risks = dedupeByKey(
    parts.flatMap((p) => p.risks),
    riskKey
  );
  const legendEntries = dedupeByKey(
    parts.flatMap((p) => p.legendEntries ?? []),
    legendKey
  );
  const symbolOccurrences = dedupeByKey(
    parts.flatMap((p) => p.symbolOccurrences ?? []),
    symbolKey
  );
  const unknownSymbols = dedupeByKey(
    parts.flatMap((p) => p.unknownSymbols ?? []),
    symbolKey
  );
  const companyFocus = dedupeByKey(
    parts.flatMap((p) => p.companyFocus ?? []),
    focusKey
  );
  const drawingRegions = dedupeByKey(
    parts.flatMap((p) => p.drawingRegions ?? []),
    regionKey
  );
  const types = [...new Set(parts.flatMap((p) => p.detectedDocumentTypes))];
  const warnings = [...new Set(parts.flatMap((p) => p.warnings))];
  const confidences = parts.map((p) => p.confidence);
  const confidence =
    confidences.includes("low") ? "low" : confidences.includes("medium") ? "medium" : "high";

  return {
    sessionId,
    detectedDocumentTypes: types.length ? types : ["unknown"],
    inputSummary: parts
      .map((p) => p.inputSummary)
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000),
    rooms,
    extractedItems,
    inferredItems,
    missingQuestions,
    risks,
    confidence,
    warnings,
    drawingRegions,
    legendEntries,
    symbolOccurrences,
    unknownSymbols,
    companyFocus,
  };
}
