import { describe, expect, it } from "vitest";
import { resolveDrawingSymbol } from "./symbolResolver";
import { mapSymbolsToAssemblies, validateAssembliesForFixedQuote } from "./mapSymbolsToAssemblies";
import { findAssemblyTemplate, QUOTE_GROUP_LABELS_SK } from "./electricalAssemblyTemplates";
import { matchStarterSymbol } from "./electricalSymbolLibrary";

describe("resolveDrawingSymbol priority", () => {
  it("project legend beats standard library", () => {
    const resolved = resolveDrawingSymbol(
      {
        id: "c1",
        symbolLabel: "A1",
        textNearSymbol: "zásuvka",
        aiGuessType: "switch",
        aiGuessLabel: "vypínač",
      },
      {
        projectLegendEntries: [
          {
            id: "l1",
            symbolLabel: "A1",
            symbolDescription: "EL.zásuvka pod sebou",
            normalizedType: "socket",
          },
        ],
      }
    );
    expect(resolved.sourceType).toBe("project_legend");
    expect(resolved.normalizedPoint).toBe("socket_point");
    expect(resolved.confidence).toBe("high");
  });

  it("company mapping beats AI guess", () => {
    const resolved = resolveDrawingSymbol(
      {
        id: "c2",
        title: "X-mark orange",
        aiGuessType: "unknown",
        aiGuessLabel: "mystery",
      },
      {
        companyCustomMappings: [
          {
            pattern: "X-mark",
            normalizedPoint: "ceiling_light_point",
            displayName: "Stropný vývod (firma)",
          },
        ],
      }
    );
    expect(resolved.sourceType).toBe("company_custom");
    expect(resolved.normalizedPoint).toBe("ceiling_light_point");
  });

  it("unknown symbol preserved for review", () => {
    const resolved = resolveDrawingSymbol({
      id: "c3",
      symbolLabel: "???",
      title: "Neznámy glyph",
    });
    expect(resolved.normalizedPoint).toBe("unknown");
    expect(resolved.needsReview).toBe(true);
    expect(resolved.sourceType).toBe("unknown");
  });
});

describe("mapSymbolsToAssemblies", () => {
  it("socket symbol expands into socket assembly", () => {
    const result = mapSymbolsToAssemblies(
      [
        {
          id: "s1",
          title: "EL.zásuvka",
          quantity: 4,
          unit: "ks",
          roomName: "Kuchyňa",
          normalizedType: "socket",
        },
      ],
      {
        legendEntries: [
          { symbolLabel: "EL", symbolDescription: "EL.zásuvka", normalizedType: "socket" },
        ],
        includeTestingRevision: false,
      }
    );
    expect(result.assemblies.some((a) => a.assemblyTemplateId === "socket_point_standard")).toBe(
      true
    );
    const socket = result.assemblies.find((a) => a.assemblyTemplateId === "socket_point_standard")!;
    expect(socket.materialLines.some((m) => m.category === "socket")).toBe(true);
    expect(socket.materialLines.some((m) => m.category === "installation_box")).toBe(true);
    expect(socket.quoteGroupLabelSk).toBe(QUOTE_GROUP_LABELS_SK.sockets_switches);
  });

  it("LED symbol expands into LED system assembly", () => {
    const result = mapSymbolsToAssemblies(
      [
        {
          id: "led1",
          title: "LED pás v SDK",
          quantity: 12.8,
          unit: "m",
          normalizedType: "led_strip",
        },
      ],
      { includeTestingRevision: false }
    );
    const led = result.assemblies.find((a) => a.assemblyTemplateId === "led_strip_system");
    expect(led).toBeTruthy();
    expect(led!.materialLines.some((m) => m.category === "led_strip")).toBe(true);
    expect(led!.materialLines.some((m) => m.category === "led_profile")).toBe(true);
    expect(led!.materialLines.some((m) => m.category === "led_driver")).toBe(true);
  });

  it("assembly creates product search intents", () => {
    const result = mapSymbolsToAssemblies(
      [{ id: "s1", title: "zásuvka", quantity: 2, unit: "ks", normalizedType: "socket" }],
      { includeTestingRevision: false, preferredBrand: "ABB" }
    );
    expect(result.productSearchIntents.length).toBeGreaterThan(0);
    expect(result.productSearchIntents.some((i) => i.category === "socket")).toBe(true);
  });

  it("missing specs block fixed quote", () => {
    const result = mapSymbolsToAssemblies(
      [{ id: "led1", title: "LED pás", quantity: 10, unit: "m", normalizedType: "led_strip" }],
      { includeTestingRevision: false, knownSpecs: {} }
    );
    expect(result.blocksFixedQuote).toBe(true);
    const validation = validateAssembliesForFixedQuote(result.assemblies);
    expect(validation.ok).toBe(false);
  });

  it("customer quote groups assemblies, not raw symbols", () => {
    const result = mapSymbolsToAssemblies(
      [
        { id: "1", title: "zásuvka", quantity: 2, unit: "ks" },
        { id: "2", title: "vypínač", quantity: 1, unit: "ks" },
        { id: "3", title: "LED pás", quantity: 5, unit: "m" },
      ],
      { includeTestingRevision: true }
    );
    expect(result.quoteGroups.length).toBeGreaterThan(0);
    expect(result.quoteGroups.every((g) => typeof g.titleSk === "string")).toBe(true);
    expect(result.quoteGroups.some((g) => g.id === "sockets_switches")).toBe(true);
    expect(result.quoteGroups.some((g) => g.id === "led_systems")).toBe(true);
    // Group titles are customer-facing categories, not raw occurrence ids
    expect(result.quoteGroups.every((g) => !g.titleSk.includes("id="))).toBe(true);
  });
});

describe("starter library + templates", () => {
  it("matchStarterSymbol still works", () => {
    expect(matchStarterSymbol("EL.zásuvka")?.normalizedPoint).toBe("socket_point");
  });

  it("findAssemblyTemplate covers key points", () => {
    expect(findAssemblyTemplate("socket_point")?.id).toBe("socket_point_standard");
    expect(findAssemblyTemplate("led_strip_point")?.id).toBe("led_strip_system");
    expect(findAssemblyTemplate("unknown")).toBeUndefined();
  });
});
