import { describe, expect, it } from "vitest";
import {
  getSeedAssemblyTemplates,
  getSeedKnowledgePacks,
  getSeedLaborRules,
  getSeedSymbolEntries,
} from "./knowledgeRepository";
import { toLibraryEntry, toCompanyMapping } from "./knowledgeSymbolResolver";
import { toElectricalAssemblyTemplate, applyLaborRules } from "./assemblyMapper";
import { createProductSearchIntents, toProductPreference } from "./productMatcher";
import { formatKnowledgeContext } from "./estimatorKnowledgeContextBuilder";
import { resolveDrawingSymbol } from "@/lib/ai/symbolResolver";
import { mapSymbolsToAssemblies } from "@/lib/ai/mapSymbolsToAssemblies";
import { findAssemblyTemplate } from "@/lib/ai/electricalAssemblyTemplates";
import type { CustomSymbolMapping } from "@/types/estimatorKnowledge";

const CTX = { countryCode: "SK", trade: "electrical" as const };

describe("seed knowledge", () => {
  it("loads packs, symbols, assemblies and labor rules", () => {
    expect(getSeedKnowledgePacks().length).toBe(3);
    expect(getSeedSymbolEntries().length).toBeGreaterThanOrEqual(10);
    expect(getSeedAssemblyTemplates().length).toBeGreaterThanOrEqual(8);
    expect(getSeedLaborRules().length).toBeGreaterThanOrEqual(8);
  });

  it("contains no protected symbol graphics — metadata/aliases only", () => {
    for (const s of getSeedSymbolEntries()) {
      expect(["internal_sample", "metadata_only", "company_defined"]).toContain(
        s.licenseStatus
      );
      expect(s.aliases.length).toBeGreaterThan(0);
    }
  });

  it("every seeded symbol has a known normalizedPoint", () => {
    for (const s of getSeedSymbolEntries()) {
      expect(s.normalizedPoint).not.toBe("unknown");
    }
  });
});

describe("symbol resolution via knowledge backend", () => {
  const library = getSeedSymbolEntries().map(toLibraryEntry);

  it("resolves SK aliases to normalizedPoint", () => {
    const cases: Array<[string, string]> = [
      ["zásuvka silnoprúdová", "socket_point"],
      ["2x zásuvka", "double_socket_point"],
      ["striedavý spínač", "switch_point"],
      ["stropné svietidlo", "light_output"],
      ["LED pás v svetelnej lište", "led_strip_point"],
      ["inštalačná krabica", "installation_box"],
      ["CYKY", "cable_route"],
      ["rozvádzač RZ", "distribution_board"],
      ["výkonový vypínač", "breaker"],
      ["ochranné uzemnenie", "grounding"],
    ];
    for (const [text, point] of cases) {
      const resolved = resolveDrawingSymbol(
        { title: text },
        { standardLibrary: library, countryCode: "SK" }
      );
      expect(resolved.normalizedPoint, text).toBe(point);
    }
  });

  it("unknown symbol never becomes a fixed quote line", () => {
    const resolved = resolveDrawingSymbol(
      { title: "xyzzy-neznáma-značka-42" },
      { standardLibrary: library, countryCode: "SK" }
    );
    expect(resolved.normalizedPoint).toBe("unknown");
    expect(resolved.needsReview).toBe(true);

    const result = mapSymbolsToAssemblies(
      [{ id: "s1", title: "xyzzy-neznáma-značka-42", quantity: 3, unit: "ks" }],
      { standardLibrary: library, countryCode: "SK", includeTestingRevision: false }
    );
    expect(result.reviewOnlySymbols.length).toBe(1);
    expect(result.blocksFixedQuote).toBe(true);
  });

  it("user-confirmed company mapping wins over AI guess", () => {
    const mapping: CustomSymbolMapping = {
      id: "m1",
      orgId: "org1",
      trade: "electrical",
      countryCode: "SK",
      detectedText: "ŠPZ-7",
      normalizedPoint: "socket_point",
      createdBy: "u1",
      source: "user_confirmed",
    };
    const resolved = resolveDrawingSymbol(
      { title: "ŠPZ-7", aiGuessType: "led_strip" },
      {
        standardLibrary: library,
        userConfirmedMappings: [toCompanyMapping(mapping)],
        countryCode: "SK",
      }
    );
    expect(resolved.normalizedPoint).toBe("socket_point");
    expect(resolved.sourceType).toBe("user_confirmed");
  });

  it("project legend always wins", () => {
    const resolved = resolveDrawingSymbol(
      { symbolLabel: "13", title: "13" },
      {
        projectLegendEntries: [
          { symbolLabel: "13", symbolDescription: "LED pás v svetelnej lište" },
        ],
        standardLibrary: library,
        countryCode: "SK",
      }
    );
    expect(resolved.sourceType).toBe("project_legend");
    expect(resolved.normalizedPoint).toBe("led_strip_point");
  });
});

describe("assembly mapping", () => {
  const library = getSeedSymbolEntries().map(toLibraryEntry);
  const templates = getSeedAssemblyTemplates().map(toElectricalAssemblyTemplate);

  it("normalizedPoint maps to an assembly template for every seeded point", () => {
    for (const s of getSeedSymbolEntries()) {
      const backend = templates.find((t) => t.normalizedPoint === s.normalizedPoint);
      const fallback = findAssemblyTemplate(s.normalizedPoint);
      expect(backend ?? fallback, s.normalizedPoint).toBeTruthy();
    }
  });

  it("assembly expands into material and labor items with product intents", () => {
    const result = mapSymbolsToAssemblies(
      [{ id: "s1", title: "zásuvka silnoprúdová", quantity: 4, unit: "ks" }],
      {
        standardLibrary: library,
        assemblyTemplates: templates,
        countryCode: "SK",
        includeTestingRevision: false,
      }
    );
    expect(result.assemblies.length).toBe(1);
    const a = result.assemblies[0];
    expect(a.assemblyTemplateId).toBe("socket_point_standard");
    expect(a.materialLines.length).toBeGreaterThan(2);
    expect(a.laborLines.length).toBeGreaterThan(0);
    expect(result.productSearchIntents.length).toBeGreaterThan(0);
  });

  it("missing cable lengths create needsReview, price is never invented as 0", () => {
    const result = mapSymbolsToAssemblies(
      [{ id: "s1", title: "zásuvka", quantity: 2, unit: "ks" }],
      {
        standardLibrary: library,
        assemblyTemplates: templates,
        countryCode: "SK",
        includeTestingRevision: false,
      }
    );
    const cable = result.assemblies[0].materialLines.find((m) => m.category === "cable");
    expect(cable?.needsReview).toBe(true);
    expect(cable?.quantity).toBeNull();
  });

  it("labor rules adjust hours by difficulty factor", () => {
    const result = mapSymbolsToAssemblies(
      [{ id: "s1", title: "zásuvka", quantity: 4, unit: "ks" }],
      {
        standardLibrary: library,
        assemblyTemplates: templates,
        countryCode: "SK",
        includeTestingRevision: false,
      }
    );
    const withRules = applyLaborRules(
      result.assemblies[0],
      getSeedLaborRules(),
      "concrete"
    );
    // 4 ks * 30 min * 1.6 / 60 = 3.2 h
    expect(withRules.laborLines[0].hours).toBe(3.2);
  });
});

describe("product matching preferences", () => {
  it("company estimator settings influence product preference", () => {
    const prefs = toProductPreference(
      {
        preferredBrands: ["Legrand"],
        preferredSuppliers: ["Môj veľkoobchod"],
        defaultMaterialMarginPercent: 30,
        defaultLaborRate: 32,
        defaultRiskReservePercent: 8,
        allowIndicativePrices: false,
        priceTier: "premium",
      },
      CTX
    );
    expect(prefs.preferredBrands[0]).toBe("Legrand");
    expect(prefs.priceTier).toBe("premium");
    expect(prefs.defaultMaterialMarginPercent).toBe(30);
    expect(prefs.allowIndicativePrices).toBe(false);
  });

  it("creates product search intents with preferred brand keyword", () => {
    const library = getSeedSymbolEntries().map(toLibraryEntry);
    const templates = getSeedAssemblyTemplates().map(toElectricalAssemblyTemplate);
    const result = mapSymbolsToAssemblies(
      [{ id: "s1", title: "zásuvka", quantity: 2, unit: "ks" }],
      {
        standardLibrary: library,
        assemblyTemplates: templates,
        countryCode: "SK",
        includeTestingRevision: false,
      }
    );
    const intents = createProductSearchIntents(result.assemblies, {
      preferredBrands: ["ABB"],
    });
    expect(intents.length).toBeGreaterThan(0);
    expect(intents[0].keywords).toContain("ABB");
  });
});

describe("knowledge context builder", () => {
  it("builds compact context — never the whole database", () => {
    const text = formatKnowledgeContext({
      symbols: getSeedSymbolEntries(),
      assemblies: getSeedAssemblyTemplates(),
      laborRules: getSeedLaborRules(),
      customMappings: [
        {
          id: "m1",
          orgId: "org1",
          trade: "electrical",
          countryCode: "SK",
          detectedText: "ŠPZ-7",
          normalizedPoint: "socket_point",
          createdBy: "u1",
          source: "user_confirmed",
        },
      ],
    });
    expect(text).toContain("socket_point");
    expect(text).toContain("zásuvka");
    expect(text).toContain('"ŠPZ-7" => socket_point');
    expect(text.length).toBeLessThanOrEqual(4000);
  });
});
