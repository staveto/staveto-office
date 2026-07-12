import { describe, expect, it } from "vitest";
import { resolveSetupMaterialRows } from "@/components/projects/setup/aiSetupHelpers";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import type { MaterialSuggestionDoc, ProjectMaterialDoc } from "@/services/materials/types";

describe("resolveSetupMaterialRows", () => {
  it("falls back to project materials when quote rows have empty names", () => {
    const quoteItems = [
      {
        id: "q1",
        projectId: "p1",
        category: "material",
        name: "",
        qty: 1,
        unit: "ks",
        unitPrice: 0,
      },
    ] as QuoteDraftItemDoc[];
    const projectMaterials = [
      {
        id: "m1",
        projectId: "p1",
        name: "Vypínač (z legendy)",
        quantity: 1,
        unit: "ks",
      },
    ] as ProjectMaterialDoc[];

    const rows = resolveSetupMaterialRows(quoteItems, [], projectMaterials);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Vypínač (z legendy)");
  });

  it("keeps named quote materials and merges AI extras", () => {
    const quoteItems = [
      {
        id: "q1",
        projectId: "p1",
        category: "material",
        name: "Kabeláž",
        qty: 10,
        unit: "m",
        unitPrice: 0,
      },
    ] as QuoteDraftItemDoc[];
    const suggestions = [
      {
        id: "s1",
        projectId: "p1",
        name: "Zásuvka",
        suggestedQuantity: 4,
        unit: "ks",
        status: "planned",
      },
    ] as MaterialSuggestionDoc[];

    const rows = resolveSetupMaterialRows(quoteItems, suggestions, []);
    expect(rows.map((r) => r.name)).toEqual(["Kabeláž", "Zásuvka"]);
  });
});
