import { describe, expect, it } from "vitest";
import {
  applyFactsToMaterialRows,
  enrichDraftMaterialSuggestions,
  estimateFacadeAreaM2,
  sumFloorAreaM2,
  suggestMaterialQuantityFromFacts,
} from "./materialQuantityFromFacts";

describe("materialQuantityFromFacts", () => {
  const facts = {
    totalKnownAreaM2: 100,
    rooms: [
      { name: "Obývacia izba", areaM2: 24 },
      { name: "Kuchyňa", areaM2: 12 },
    ],
  };

  it("sums room areas", () => {
    expect(sumFloorAreaM2(facts)).toBe(36);
  });

  it("suggests floor covering quantity from rooms", () => {
    const hint = suggestMaterialQuantityFromFacts("Podlahové krytiny", "m2", null, facts);
    expect(hint?.quantity).toBe(36);
    expect(hint?.unit).toBe("m2");
  });

  it("suggests facade plaster from footprint", () => {
    const hint = suggestMaterialQuantityFromFacts("Fasádna omietka", "m2", null, facts);
    expect(hint?.quantity).toBe(estimateFacadeAreaM2(36));
  });

  it("enriches draft material suggestions", () => {
    const enriched = enrichDraftMaterialSuggestions({
      projectFacts: facts,
      materialSuggestions: [
        { name: "Strešná krytina", category: "roof", source: "inferred" },
        { name: "Okná", category: "windows", unit: "pcs", source: "inferred" },
      ],
    });
    expect(enriched[0]?.quantity).toBe(36);
    expect(enriched[1]?.quantity).toBeUndefined();
  });

  it("applies facts to material rows with placeholder qty", () => {
    const rows = applyFactsToMaterialRows(
      [{ name: "Podlahové krytiny", qty: 1, unit: "m2" }],
      facts
    );
    expect(rows[0]?.qty).toBe(36);
    expect(rows[0]?.sourceNote).toContain("36");
  });
});
