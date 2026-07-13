/**
 * Acceptance report for the real electrical drawing PDF.
 *
 * Input (preferred): reports/ai-estimator/fresh-session-facts.json — produced
 * by `npm run test:ai-estimator-electrical-pdf` (fresh Gemini extraction from
 * fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf via scripts/run-electrical-pdf-analysis.mjs).
 *
 * Fallback (marked, weaker): fixtures/ai-estimator/session-facts.json —
 * Firestore replay of a previous in-app analysis. Never presented as fresh.
 *
 * Output: reports/ai-estimator/electrical-pdf-report.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEstimatorExtractionQualityReport,
  normalizeSourceEvidence,
  evidenceSourceTypeFromResolver,
  validateAssemblyExpansion,
  type EstimatorSourceEvidence,
} from "./estimatorExtractionQuality";
import { mapSymbolsToAssemblies } from "./mapSymbolsToAssemblies";
import { foldLegendIntoEstimatorFacts } from "./foldLegendIntoEstimatorFacts";
import {
  composeElectricalCustomerQuote,
  takeoffFromMaterialLikeRows,
} from "./composeElectricalCustomerQuote";
import type { NormalizedElectricalPoint } from "./electricalAssemblyTemplates";
import {
  getSeedAssemblyTemplates,
  getSeedKnowledgePacks,
  getSeedSymbolEntries,
} from "@/services/estimatorKnowledge/knowledgeRepository";
import { toLibraryEntry } from "@/services/estimatorKnowledge/knowledgeSymbolResolver";
import { toElectricalAssemblyTemplate } from "@/services/estimatorKnowledge/assemblyMapper";
import type { AiEstimatorFacts, AiSymbolOccurrence } from "@/types/aiEstimator";

const ROOT = process.cwd();
const FRESH = join(ROOT, "reports/ai-estimator/fresh-session-facts.json");
const REPLAY = join(ROOT, "fixtures/ai-estimator/session-facts.json");
const OUT = join(ROOT, "reports/ai-estimator/electrical-pdf-report.json");

type FreshFile = {
  meta: {
    extractionMode: string;
    fileName: string;
    pagesInPdf: number;
    pagesProcessed: number;
    knowledgePackIds: string[];
    model: string;
    analyzedAt: string;
  };
  facts: AiEstimatorFacts;
};

function loadInput(): {
  facts: AiEstimatorFacts;
  extractionMode: "fresh_pdf_extraction" | "firestore_replay_fallback";
  fileName: string;
  pagesProcessed: number;
  knowledgePackIds: string[];
} | null {
  if (existsSync(FRESH)) {
    const parsed = JSON.parse(readFileSync(FRESH, "utf8")) as FreshFile;
    return {
      facts: parsed.facts,
      extractionMode: "fresh_pdf_extraction",
      fileName: parsed.meta.fileName,
      pagesProcessed: parsed.meta.pagesProcessed,
      knowledgePackIds: parsed.meta.knowledgePackIds,
    };
  }
  if (existsSync(REPLAY)) {
    return {
      facts: JSON.parse(readFileSync(REPLAY, "utf8")) as AiEstimatorFacts,
      extractionMode: "firestore_replay_fallback",
      fileName: "08_Znacenie_elektrika 2.pdf",
      pagesProcessed: 1,
      knowledgePackIds: getSeedKnowledgePacks().map((p) => p.id),
    };
  }
  return null;
}

const input = loadInput();

const SOCKET_POINTS: NormalizedElectricalPoint[] = ["socket_point", "double_socket_point"];
const SWITCH_POINTS: NormalizedElectricalPoint[] = ["switch_point", "dimmer_point"];
const LIGHT_POINTS: NormalizedElectricalPoint[] = [
  "light_output",
  "ceiling_light_point",
  "pendant_light_point",
  "wall_light_point",
  "mirror_light_output",
  "furniture_light_output",
];

describe.skipIf(!input)("electrical PDF acceptance report", () => {
  it("builds the acceptance report with evidence and quote safety", () => {
    const facts = foldLegendIntoEstimatorFacts(input!.facts);
    const library = getSeedSymbolEntries().map(toLibraryEntry);
    const templates = getSeedAssemblyTemplates().map(toElectricalAssemblyTemplate);

    const occurrences = (facts.symbolOccurrences ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      visibleLabel: s.visibleLabel,
      roomName: s.roomName,
      quantity: s.quantity,
      unit: s.unit,
      page: s.page,
      normalizedType: s.normalizedType,
      legendEntryId: s.legendEntryId,
      needsReview: s.needsReview,
      reviewReason: s.reviewReason,
    }));
    const mapped = mapSymbolsToAssemblies(occurrences, {
      legendEntries: (facts.legendEntries ?? []).map((l) => ({
        id: l.id,
        symbolLabel: l.symbolLabel,
        symbolDescription: l.symbolDescription,
        normalizedType: l.normalizedType,
      })),
      countryCode: "SK",
      includeTestingRevision: true,
      standardLibrary: library,
      assemblyTemplates: templates,
    });

    const { report, criticalWarnings } = buildEstimatorExtractionQualityReport({
      facts,
      mapped,
    });
    const expansion = validateAssemblyExpansion(mapped);

    // Phase 3 — evidence per category. A count without evidence is invalid.
    const occurrenceById = new Map<string, AiSymbolOccurrence>(
      (facts.symbolOccurrences ?? []).map((o) => [o.id, o] as const)
    );
    const evidenceFor = (points: NormalizedElectricalPoint[]): EstimatorSourceEvidence[] =>
      mapped.resolvedSymbols
        .filter((r) => points.includes(r.normalizedPoint))
        .slice(0, 25)
        .map((r) => {
          const occ = r.candidateId ? occurrenceById.get(r.candidateId) : undefined;
          return normalizeSourceEvidence(
            {
              fileName: occ?.evidence?.[0]?.fileName ?? input!.fileName,
              page: occ?.page ?? occ?.evidence?.[0]?.page,
              sourceText: r.matchedText,
              sourceType: evidenceSourceTypeFromResolver(r.sourceType),
              confidence: r.confidence,
              needsReview: r.needsReview,
              bbox: occ?.bbox ?? null,
            },
            input!.fileName
          );
        });

    const categoryEvidence = {
      sockets: evidenceFor(SOCKET_POINTS),
      switches: evidenceFor(SWITCH_POINTS),
      lightOutputs: evidenceFor(LIGHT_POINTS),
      ledItems: evidenceFor(["led_strip_point"]),
      cableItems: evidenceFor(["cable_route"]),
    };

    // Evidence integrity — no undefined page/source/confidence anywhere.
    for (const list of Object.values(categoryEvidence)) {
      for (const e of list) {
        expect(e.fileName).toBeTruthy();
        expect(e.page).toBeGreaterThan(0);
        expect(e.sourceType).toBeTruthy();
        expect(["high", "medium", "low"]).toContain(e.confidence);
      }
    }
    // A nonzero count is only accepted with evidence behind it.
    if (report.socketsDetected > 0) expect(categoryEvidence.sockets.length).toBeGreaterThan(0);
    if (report.switchesDetected > 0) expect(categoryEvidence.switches.length).toBeGreaterThan(0);
    if (report.lightOutputsDetected > 0) expect(categoryEvidence.lightOutputs.length).toBeGreaterThan(0);
    if (report.ledItemsDetected > 0) expect(categoryEvidence.ledItems.length).toBeGreaterThan(0);

    // Phase 5 — separate sources, never one flat list.
    const sourceBreakdown = {
      legendEntries: facts.legendEntries?.length ?? 0,
      scheduleQuantities: [...facts.extractedItems].filter(
        (i) => i.quantitySource === "schedule" || i.quantityFromSchedule != null
      ).length,
      drawingOccurrences: facts.symbolOccurrences?.length ?? 0,
      aiInferred: facts.inferredItems.length,
    };

    // Phase 6 — visual review placeholders for uncertain symbols.
    const visualReview = [
      ...(facts.unknownSymbols ?? []),
      ...(facts.symbolOccurrences ?? []).filter((s) => s.needsReview || s.confidence === "low"),
    ]
      .slice(0, 40)
      .map((s, i) => ({
        page: s.page ?? s.evidence?.[0]?.page ?? 1,
        bbox: s.bbox ?? null,
        cropId: `crop_placeholder_${i + 1}`,
        roomName: s.roomName ?? null,
        detectedText: s.visibleLabel || s.title,
        possibleMeaning: s.normalizedType ?? "unknown",
        confidence: s.confidence,
      }));

    // Phase 7 — customer quote safety on top of the same facts.
    const takeoff = takeoffFromMaterialLikeRows(
      [...facts.extractedItems, ...facts.inferredItems]
        .filter((i) => i.included !== false)
        .map((i) => ({
          id: i.id,
          name: i.title,
          qty: i.computedQuantity ?? i.quantity ?? 0,
          unit: i.unit ?? "ks",
          confidence: i.confidence,
          sourceNote: i.reviewReason,
        }))
    );
    const quote = composeElectricalCustomerQuote({
      takeoff,
      language: "sk",
      legendTexts: (facts.legendEntries ?? []).map((l) => l.symbolDescription),
      documentTextHints: [facts.inputSummary ?? ""],
    });
    expect(quote.sections.length).toBeGreaterThan(1);
    for (const line of quote.sections.flatMap((s) => s.lines)) {
      if (line.priceMissing) expect(line.unitPrice ?? null).not.toBe(0);
    }
    if (report.fixedQuoteBlocked) expect(quote.status).not.toBe("ready");

    const acceptanceReport = {
      extractionMode: input!.extractionMode,
      isFreshPdfExtraction: input!.extractionMode === "fresh_pdf_extraction",
      generatedAt: new Date().toISOString(),
      fileName: input!.fileName,
      pagesProcessed: input!.pagesProcessed,
      knowledgePackId: input!.knowledgePackIds.join(", "),
      roomsDetected: report.roomsDetected,
      legendEntriesDetected: report.legendEntriesDetected,
      symbolOccurrencesDetected: report.symbolOccurrencesDetected,
      socketsDetected: report.socketsDetected,
      switchesDetected: report.switchesDetected,
      switchesDetectedFromText: report.switchesDetectedFromText,
      switchesDetectedFromVisual: report.switchesDetectedFromVisual,
      switchesDetectedTotal: report.switchesDetectedTotal,
      visualDetectionsCount: report.visualDetectionsCount,
      visualDetectionsNeedsReview: report.visualDetectionsNeedsReview,
      lightOutputsDetected: report.lightOutputsDetected,
      ledItemsDetected: report.ledItemsDetected,
      cableItemsDetected: report.cableItemsDetected,
      unknownSymbols: report.unknownSymbols,
      needsReviewCount: report.needsReviewCount,
      missingCriticalCategories: report.missingCriticalCategories,
      fixedQuoteBlocked: report.fixedQuoteBlocked,
      assemblyItemsCount: mapped.assemblies.length,
      productSearchIntentsCount: mapped.productSearchIntents.length,
      quoteGroupsCreated: mapped.quoteGroups.map((g) => g.titleSk),
      customerQuoteStatus: quote.status,
      warnings: [...criticalWarnings, ...(facts.warnings ?? [])].slice(0, 20),
      assemblyExpansion: expansion,
      sourceBreakdown,
      categoryEvidence,
      visualReview,
      limitations: [
        "bbox/crop visual evidence is a placeholder — real symbol crops are not extracted yet.",
        "Switch symbols without text labels are not visually counted — flagged for review instead.",
      ],
    };

    mkdirSync(join(ROOT, "reports/ai-estimator"), { recursive: true });
    writeFileSync(OUT, JSON.stringify(acceptanceReport, null, 2), "utf8");

    // Phase 9 acceptance assertions.
    expect(input!.knowledgePackIds.length).toBeGreaterThan(0);
    expect(report.roomsDetected).toBeGreaterThan(0);
    expect(report.legendEntriesDetected).toBeGreaterThan(0);
    expect(report.symbolOccurrencesDetected).toBeGreaterThan(0);
    // Sockets/switches: detected or explicitly flagged — never silent.
    expect(
      report.socketsDetected > 0 || report.missingCriticalCategories.includes("sockets")
    ).toBe(true);
    expect(
      report.switchesDetected > 0 || report.missingCriticalCategories.includes("switches")
    ).toBe(true);
    expect(mapped.assemblies.length).toBeGreaterThan(0);
    expect(mapped.productSearchIntents.length).toBeGreaterThan(0);
    expect(expansion.problems).toEqual([]);
    if (report.missingCriticalCategories.length > 0) {
      expect(report.fixedQuoteBlocked).toBe(true);
    }
  });

  it("states clearly whether this is fresh extraction or replay", () => {
    // The report must never claim fresh extraction without the fresh facts file.
    const isFresh = existsSync(FRESH);
    expect(input!.extractionMode).toBe(
      isFresh ? "fresh_pdf_extraction" : "firestore_replay_fallback"
    );
  });
});

describe.skipIf(Boolean(input))("electrical PDF acceptance report (no input)", () => {
  it("fails acceptance with a clear message when the fixture is missing", () => {
    expect.fail(
      "Missing fixture: fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf — place the real drawing there and run `npm run test:ai-estimator-electrical-pdf`."
    );
  });
});
