import { describe, expect, it } from "vitest";
import {
  buildEstimatorExtractionQualityReport,
  formatExtractionSummarySk,
  normalizeSourceEvidence,
  validateAssemblyExpansion,
  QUALITY_MSG_SOCKETS_MISSING_SK,
  QUALITY_MSG_SWITCHES_MISSING_SK,
  QUALITY_MSG_SWITCHES_PROBABLE_SK,
} from "./estimatorExtractionQuality";
import { mapSymbolsToAssemblies } from "./mapSymbolsToAssemblies";
import { resolveDrawingSymbol } from "./symbolResolver";
import { composeElectricalCustomerQuote } from "./composeElectricalCustomerQuote";
import {
  getSeedAssemblyTemplates,
  getSeedSymbolEntries,
} from "@/services/estimatorKnowledge/knowledgeRepository";
import { toLibraryEntry } from "@/services/estimatorKnowledge/knowledgeSymbolResolver";
import { toElectricalAssemblyTemplate } from "@/services/estimatorKnowledge/assemblyMapper";
import type { AiEstimatorFacts, AiExtractedItem } from "@/types/aiEstimator";
import type { InternalTakeoffRow } from "./electricalQuoteTypes";

const library = getSeedSymbolEntries().map(toLibraryEntry);
const templates = getSeedAssemblyTemplates().map(toElectricalAssemblyTemplate);
const MAP_OPTS = {
  standardLibrary: library,
  assemblyTemplates: templates,
  countryCode: "SK",
  includeTestingRevision: false,
} as const;

function factsWith(partial: Partial<AiEstimatorFacts>): AiEstimatorFacts {
  return {
    sessionId: "test-session",
    detectedDocumentTypes: ["electrical_marking"],
    inputSummary: "",
    rooms: [],
    extractedItems: [],
    inferredItems: [],
    missingQuestions: [],
    risks: [],
    confidence: "medium",
    warnings: [],
    ...partial,
  };
}

function item(partial: Partial<AiExtractedItem> & Pick<AiExtractedItem, "id" | "title" | "category">): AiExtractedItem {
  return {
    origin: "from_document",
    evidence: [],
    confidence: "medium",
    needsReview: false,
    quantity: 1,
    unit: "ks",
    ...partial,
  };
}

// 1.–3. SK electrical symbol resolution through seed knowledge
describe("SK symbol resolution (seed knowledge)", () => {
  it("resolves 'zásuvka silnoprúdová' to socket_point", () => {
    const r = resolveDrawingSymbol(
      { title: "zásuvka silnoprúdová" },
      { standardLibrary: library, countryCode: "SK" }
    );
    expect(r.normalizedPoint).toBe("socket_point");
  });

  it("resolves 'spínač' to switch_point", () => {
    const r = resolveDrawingSymbol(
      { title: "spínač" },
      { standardLibrary: library, countryCode: "SK" }
    );
    expect(r.normalizedPoint).toBe("switch_point");
  });

  it("resolves 'svetelný vývod' to light_output", () => {
    const r = resolveDrawingSymbol(
      { title: "svetelný vývod" },
      { standardLibrary: library, countryCode: "SK" }
    );
    expect(r.normalizedPoint).toBe("light_output");
  });
});

// 4.–6. Assembly expansion for the critical points
describe("assembly expansion", () => {
  it("socket_point expands to socket assembly components (material + labor)", () => {
    const res = mapSymbolsToAssemblies(
      [{ id: "s1", title: "zásuvka silnoprúdová", quantity: 6, unit: "ks" }],
      MAP_OPTS
    );
    const a = res.assemblies[0];
    expect(a.assemblyTemplateId).toBe("socket_point_standard");
    const titles = a.materialLines.map((m) => m.title.toLowerCase()).join(" | ");
    expect(titles).toMatch(/zásuv/);
    expect(titles).toMatch(/krabic/);
    expect(a.laborLines.length).toBeGreaterThan(0);
    expect(res.productSearchIntents.length).toBeGreaterThan(0);
  });

  it("switch_point expands to switch assembly components", () => {
    const res = mapSymbolsToAssemblies(
      [{ id: "s1", title: "vypínač", quantity: 3, unit: "ks" }],
      MAP_OPTS
    );
    const a = res.assemblies[0];
    expect(a.normalizedPoint).toBe("switch_point");
    expect(a.materialLines.length).toBeGreaterThan(1);
    expect(a.laborLines.length).toBeGreaterThan(0);
    const check = validateAssemblyExpansion(res);
    expect(check.ok).toBe(true);
  });

  it("light_output expands to light output assembly with supply question", () => {
    const res = mapSymbolsToAssemblies(
      [{ id: "s1", title: "svetelný vývod", quantity: 8, unit: "ks" }],
      MAP_OPTS
    );
    const a = res.assemblies[0];
    expect(a.normalizedPoint).toBe("light_output");
    expect(a.materialLines.length).toBeGreaterThan(0);
    expect(a.laborLines.length).toBeGreaterThan(0);
    expect(a.requiredQuestions.join(" ")).toMatch(/sviet|dodáva|dodavk|dodávk/i);
  });

  it("led_strip_point expands to LED system with spec questions", () => {
    const res = mapSymbolsToAssemblies(
      [{ id: "s1", title: "LED pás v SDK", quantity: 5, unit: "m" }],
      MAP_OPTS
    );
    const a = res.assemblies[0];
    expect(a.normalizedPoint).toBe("led_strip_point");
    const titles = a.materialLines.map((m) => m.title.toLowerCase()).join(" | ");
    expect(titles).toMatch(/led/);
    expect(a.requiredQuestions.length).toBeGreaterThan(0);
  });
});

// 7. Unknown symbols are preserved and block a fixed quote
describe("unknown symbols", () => {
  it("unknown symbol is preserved, excluded from quote groups and blocks fixed quote", () => {
    const res = mapSymbolsToAssemblies(
      [
        { id: "s1", title: "zásuvka", quantity: 2, unit: "ks" },
        { id: "s2", title: "úplne neznáma značka Q7-X", quantity: 1, unit: "ks" },
      ],
      MAP_OPTS
    );
    expect(res.reviewOnlySymbols.length).toBe(1);
    expect(res.blocksFixedQuote).toBe(true);
    const groupedIds = new Set(res.quoteGroups.flatMap((g) => g.assemblyIds));
    const unknownInGroups = res.assemblies.filter(
      (a) => a.normalizedPoint === "unknown" && groupedIds.has(a.id)
    );
    expect(unknownInGroups.length).toBe(0);
    expect(validateAssemblyExpansion(res).ok).toBe(true);

    const { report } = buildEstimatorExtractionQualityReport({
      facts: factsWith({}),
      mapped: res,
    });
    expect(report.unknownSymbols).toBe(1);
    expect(report.fixedQuoteBlocked).toBe(true);
  });
});

// 8.–9. Quality gate fails for missing sockets/switches
describe("extraction quality gate", () => {
  it("fails when drawing text contains zásuvka but takeoff has no sockets", () => {
    const facts = factsWith({
      legendEntries: [
        {
          id: "l1",
          trade: "electrical",
          symbolLabel: "5",
          symbolDescription: "EL.zásuvka 230V",
          normalizedType: "socket",
          defaultQuoteCategory: "material_and_labor",
          evidence: [],
          confidence: "high",
          needsReview: false,
        },
      ],
      extractedItems: [item({ id: "i1", title: "Stropné svietidlo", category: "lighting", quantity: 4 })],
    });
    const { report, criticalWarnings } = buildEstimatorExtractionQualityReport({ facts });
    expect(report.socketsDetected).toBe(0);
    expect(report.missingCriticalCategories).toContain("sockets");
    expect(report.fixedQuoteBlocked).toBe(true);
    expect(criticalWarnings).toContain(QUALITY_MSG_SOCKETS_MISSING_SK);
  });

  it("fails when drawing text contains spínač/vypínač but takeoff has no switches", () => {
    const facts = factsWith({
      symbolOccurrences: [
        {
          id: "o1",
          page: 1,
          normalizedType: "switch",
          title: "sériový spínač pri dverách",
          origin: "from_document",
          evidence: [],
          confidence: "medium",
          needsReview: false,
        },
      ],
      extractedItems: [item({ id: "i1", title: "Zásuvka 230V", category: "socket", quantity: 10 })],
    });
    const { report, criticalWarnings } = buildEstimatorExtractionQualityReport({ facts });
    expect(report.switchesDetected).toBe(0);
    expect(report.missingCriticalCategories).toContain("switches");
    expect(report.fixedQuoteBlocked).toBe(true);
    expect(criticalWarnings).toContain(QUALITY_MSG_SWITCHES_MISSING_SK);
  });

  it("flags probable switches when only AI narrative mentions them (no drawing text label)", () => {
    const facts = factsWith({
      inputSummary: "Electrical plan showing lighting, sockets, switches and LED strips.",
      extractedItems: [
        item({ id: "i1", title: "Zásuvka 230V", category: "socket", quantity: 10 }),
        item({ id: "i2", title: "Stropné svietidlo", category: "lighting", quantity: 6 }),
      ],
    });
    const { report, criticalWarnings } = buildEstimatorExtractionQualityReport({ facts });
    expect(report.switchesDetected).toBe(0);
    expect(report.missingCriticalCategories).toContain("switches");
    expect(report.fixedQuoteBlocked).toBe(true);
    expect(criticalWarnings).toContain(QUALITY_MSG_SWITCHES_PROBABLE_SK);
  });

  it("passes when sockets and switches are both in the takeoff", () => {
    const facts = factsWith({
      inputSummary: "EL.zásuvka, vypínač",
      extractedItems: [
        item({ id: "i1", title: "Zásuvka 230V", category: "socket", quantity: 12 }),
        item({ id: "i2", title: "Vypínač č.1", category: "switch", quantity: 5 }),
      ],
    });
    const { report, criticalWarnings } = buildEstimatorExtractionQualityReport({ facts });
    expect(report.socketsDetected).toBe(12);
    expect(report.switchesDetected).toBe(5);
    expect(report.missingCriticalCategories).toEqual([]);
    expect(criticalWarnings).toEqual([]);
  });

  it("produces the compact SK summary with legend and occurrences separated", () => {
    const facts = factsWith({
      rooms: [
        {
          id: "r1",
          name: "Kuchyňa",
          evidence: [],
          confidence: "high",
          needsReview: false,
        },
      ],
      legendEntries: [],
      extractedItems: [item({ id: "i1", title: "Zásuvka", category: "socket" })],
    });
    const { report } = buildEstimatorExtractionQualityReport({ facts });
    const summary = formatExtractionSummarySk(report);
    expect(summary).toMatch(
      /^Našli sme: 1 miestností, \d+ položiek legendy, \d+ značiek vo výkrese, \d+ bodov na kontrolu\.$/
    );
  });
});

// Phase 5 — evidence is never undefined
describe("source evidence", () => {
  it("never returns undefined source/page/confidence", () => {
    const e = normalizeSourceEvidence(undefined, undefined);
    expect(e.fileName).toBe("unknown-file");
    expect(e.page).toBe(1);
    expect(e.sourceType).toBe("ai_inferred");
    expect(e.confidence).toBe("medium");
    expect(typeof e.needsReview).toBe("boolean");
    expect(e.bbox).toBeNull();
    // Firestore sanitation: JSON round-trip keeps every key defined.
    const roundTrip = JSON.parse(JSON.stringify(e));
    expect(Object.values(roundTrip)).not.toContain(undefined);
  });

  it("keeps real evidence values and marks legend source as reviewed", () => {
    const e = normalizeSourceEvidence(
      {
        fileName: "08_Znacenie_elektrika_2.pdf",
        page: 3,
        sourceText: "EL.zásuvka",
        sourceType: "project_legend",
        confidence: "high",
        needsReview: false,
      },
      "fallback.pdf"
    );
    expect(e.fileName).toBe("08_Znacenie_elektrika_2.pdf");
    expect(e.page).toBe(3);
    expect(e.sourceType).toBe("project_legend");
    expect(e.needsReview).toBe(false);
  });
});

// 10. Customer quote never uses raw extraction rows directly
describe("customer quote composition", () => {
  it("builds grouped customer quote from internal takeoff, never a raw dump", () => {
    const takeoff: InternalTakeoffRow[] = [
      {
        id: "t1",
        title: "Zásuvka 230V",
        category: "socket",
        quantity: 12,
        unit: "ks",
        source: "symbol_occurrence",
        confidence: "high",
        needsReview: false,
        included: true,
      },
      {
        id: "t2",
        title: "Vypínač",
        category: "switch",
        quantity: 5,
        unit: "ks",
        source: "project_legend",
        confidence: "high",
        needsReview: false,
        included: true,
      },
    ];
    const quote = composeElectricalCustomerQuote({ takeoff, language: "sk" });

    // Grouped sections, not raw rows: sockets and switches share one section.
    const socketSection = quote.sections.find((s) => s.id === "sockets_switches");
    expect(socketSection).toBeTruthy();
    expect(socketSection!.titleSk).toBe("Zásuvky a vypínače");

    // Labor and testing sections are always composed on top of the raw rows.
    expect(quote.sections.some((s) => s.id === "testing")).toBe(true);

    // Missing material prices never surface as 0 € — priceMissing + not ready.
    const allLines = quote.sections.flatMap((s) => s.lines);
    for (const line of allLines) {
      if (line.priceMissing) expect(line.unitPrice ?? null).not.toBe(0);
    }
    expect(quote.status).not.toBe("ready");
    expect(quote.warnings.join(" ")).toMatch(/predbežná|zablokovaná/i);
  });
});
