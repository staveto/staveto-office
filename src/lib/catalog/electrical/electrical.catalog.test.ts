import { describe, expect, it } from "vitest";
import { cleanProductName, isCorruptedName, normalizeCatalogName } from "./normalizeName";
import { parseEuroToCents, validatePricePair } from "./prices";
import { classifyElectricalProduct } from "./category-rules";
import { buildBucoProductId } from "./ids";
import { buildElectricalCatalogFromProducts } from "./buildCatalog";
import { extractBrand, extractSeries } from "./brands";

describe("electrical catalog normalizeName", () => {
  it("cleans corrupted Valena title preferring URL slug", () => {
    const raw = "1.VALENA LIFE 1-rámček, BIELA1,41 €1,20 € s DPH";
    const url =
      "https://www.buco.sk/valena-life-1-ramcek-biela-752501-12345";
    expect(isCorruptedName(raw)).toBe(true);
    const name = cleanProductName(raw, url);
    expect(name.toLowerCase()).toContain("valena");
    expect(name).not.toMatch(/€/);
    expect(name.toLowerCase()).not.toContain("dph");
  });

  it("normalizes search text", () => {
    expect(normalizeCatalogName("Vypínač č. 1")).toContain("vypinac");
  });
});

describe("electrical catalog prices", () => {
  it("parses European decimals to cents", () => {
    expect(parseEuroToCents("4,24")).toBe(424);
    expect(parseEuroToCents("1.234,56")).toBe(123456);
  });

  it("flags net > gross as needs_review without inventing prices", () => {
    const r = validatePricePair(500, 400);
    expect(r.priceStatus).toBe("needs_review");
    expect(r.netCents).toBe(500);
    expect(r.grossCents).toBe(400);
  });

  it("accepts plausible 20% VAT pair", () => {
    const r = validatePricePair(1000, 1200);
    expect(r.priceStatus).toBe("valid");
  });
});

describe("electrical catalog classifier", () => {
  it("maps switch c1 / frames / RCD / CYKY", () => {
    expect(
      classifyElectricalProduct({
        name: "Vypínač č.1 Valena",
        url: "https://www.buco.sk/vypinac-c1",
      }).childSlug
    ).toBe("vypinac-c1");

    expect(
      classifyElectricalProduct({
        name: "Rámček biely",
        url: "https://www.buco.sk/ramcek-biely",
      }).childSlug
    ).toBe("ramceky-a-kryty");

    expect(
      classifyElectricalProduct({
        name: "Prúdový chránič 40A",
        url: "https://www.buco.sk/prudovy-chranic",
      }).childSlug
    ).toBe("prudove-chranice");

    expect(
      classifyElectricalProduct({
        name: "CYKY 3x2,5",
        url: "https://www.buco.sk/cyky-3x25",
      }).topSlug
    ).toBe("kable-a-vodice");
  });

  it("sends unmatched to Ostatné elektro with needs_review path", () => {
    const hit = classifyElectricalProduct({
      name: "Neznámy xyz gadget",
      url: "https://www.buco.sk/neznamy-xyz-gadget-999",
    });
    expect(hit.unmatched).toBe(true);
    expect(hit.topSlug).toBe("ostatne-elektro");
  });
});

describe("electrical catalog brands / ids", () => {
  it("extracts Legrand Valena Life", () => {
    expect(extractBrand("Valena Life rámček", "https://buco.sk/valena-life")).toBe(
      "Legrand"
    );
    expect(extractSeries("Valena Life rámček", "")).toBe("Valena Life");
  });

  it("builds stable product ids", () => {
    expect(buildBucoProductId("5401980", "https://x")).toBe("buco_5401980");
    expect(buildBucoProductId("", "https://www.buco.sk/foo")).toMatch(/^buco_url_/);
  });
});

describe("buildElectricalCatalogFromProducts", () => {
  it("assigns category and stable id to every product", () => {
    const { products, importDoc } = buildElectricalCatalogFromProducts({
      products: [
        {
          nazov: "Istič 10A",
          kod: "111",
          cena_s_dph: "12,00",
          cena_bez_dph: "10,00",
          sklad: "5",
          url: "https://www.buco.sk/istic-10a-111",
        },
        {
          nazov: "1.VALENA LIFE 1-rámček, BIELA1,41 €1,20 € s DPH",
          kod: "222",
          cena_s_dph: "1,41",
          cena_bez_dph: "1,20",
          sklad: "0",
          url: "https://www.buco.sk/valena-life-1-ramcek-biela-222",
        },
      ],
      sourceFile: "test.json",
      importId: "test_import",
    });

    expect(products).toHaveLength(2);
    expect(products.every((p) => p.categoryId && p.id.startsWith("buco_"))).toBe(true);
    expect(importDoc.productsFound).toBe(2);
    expect(products.find((p) => p.id === "buco_222")?.name.toLowerCase()).toContain(
      "valena"
    );
  });
});
