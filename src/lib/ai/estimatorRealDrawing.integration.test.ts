/**
 * End-to-end validation against a real analyzed electrical drawing
 * (08_Znacenie_elektrika_2.pdf). Runs stored estimator facts through the
 * knowledge backend: resolve → assemble → quality report → customer quote.
 *
 * The fixture is fetched locally via scripts/fetch-estimator-session.mjs and
 * is not required in CI — the suite skips itself when the file is absent.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEstimatorExtractionQualityReport,
  validateAssemblyExpansion,
} from "./estimatorExtractionQuality";
import { mapSymbolsToAssemblies } from "./mapSymbolsToAssemblies";
import { foldLegendIntoEstimatorFacts } from "./foldLegendIntoEstimatorFacts";
import {
  composeElectricalCustomerQuote,
  takeoffFromMaterialLikeRows,
} from "./composeElectricalCustomerQuote";
import {
  getSeedAssemblyTemplates,
  getSeedSymbolEntries,
} from "@/services/estimatorKnowledge/knowledgeRepository";
import { toLibraryEntry } from "@/services/estimatorKnowledge/knowledgeSymbolResolver";
import { toElectricalAssemblyTemplate } from "@/services/estimatorKnowledge/assemblyMapper";
import type { AiEstimatorFacts } from "@/types/aiEstimator";

const FIXTURE = join(process.cwd(), "fixtures/ai-estimator/session-facts.json");
const hasFixture = existsSync(FIXTURE);

describe.skipIf(!hasFixture)("real drawing — knowledge backend end-to-end", () => {
  const raw = hasFixture
    ? (JSON.parse(readFileSync(FIXTURE, "utf8")) as AiEstimatorFacts)
    : null;
  const facts = raw ? foldLegendIntoEstimatorFacts(raw) : null;
  const library = getSeedSymbolEntries().map(toLibraryEntry);
  const templates = getSeedAssemblyTemplates().map(toElectricalAssemblyTemplate);

  function mapped() {
    const occurrences = (facts!.symbolOccurrences ?? []).map((s) => ({
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
    return mapSymbolsToAssemblies(occurrences, {
      legendEntries: (facts!.legendEntries ?? []).map((l) => ({
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
  }

  it("reads rooms, legend and symbol occurrences from the drawing", () => {
    expect(facts!.rooms.length).toBeGreaterThan(0);
    expect(facts!.legendEntries?.length ?? 0).toBeGreaterThan(0);
    expect(facts!.symbolOccurrences?.length ?? 0).toBeGreaterThan(0);
  });

  it("resolves occurrences and expands assemblies with material + labor", () => {
    const m = mapped();
    expect(m.assemblies.length).toBeGreaterThan(0);
    const expansion = validateAssemblyExpansion(m);
    expect(expansion.problems).toEqual([]);
    expect(m.productSearchIntents.length).toBeGreaterThan(0);
    expect(m.quoteGroups.length).toBeGreaterThan(0);
  });

  it("quality report counts critical categories or flags them as missing", () => {
    const m = mapped();
    const { report, criticalWarnings } = buildEstimatorExtractionQualityReport({
      facts: facts!,
      mapped: m,
    });
    expect(report.roomsDetected).toBeGreaterThan(0);
    expect(report.legendEntriesDetected).toBeGreaterThan(0);
    expect(report.symbolOccurrencesDetected).toBeGreaterThan(0);

    // Sockets/switches are either counted or explicitly flagged — never silent.
    if (report.socketsDetected === 0) {
      expect(report.missingCriticalCategories).toContain("sockets");
      expect(criticalWarnings.length).toBeGreaterThan(0);
    }
    if (report.switchesDetected === 0) {
      expect(report.missingCriticalCategories).toContain("switches");
    }
    // Light outputs / LED must be visible in a lighting-heavy drawing.
    expect(report.lightOutputsDetected + report.ledItemsDetected).toBeGreaterThan(0);
  });

  it("blocks the fixed customer quote while data is incomplete", () => {
    const m = mapped();
    const { report } = buildEstimatorExtractionQualityReport({ facts: facts!, mapped: m });

    const takeoff = takeoffFromMaterialLikeRows(
      [...facts!.extractedItems, ...facts!.inferredItems]
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
      legendTexts: (facts!.legendEntries ?? []).map((l) => l.symbolDescription),
    });

    // Real drawing has open points (cable lengths, prices) — no "ready" quote.
    if (report.fixedQuoteBlocked) {
      expect(quote.status).not.toBe("ready");
    }
    // Never a raw dump: everything customer-visible sits in grouped sections.
    expect(quote.sections.length).toBeGreaterThan(1);
    for (const line of quote.sections.flatMap((s) => s.lines)) {
      if (line.priceMissing) expect(line.unitPrice ?? null).not.toBe(0);
    }
  });
});
