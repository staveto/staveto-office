import { describe, expect, it } from "vitest";
import { searchElectricalProducts } from "./searchSuggest";
import type { ElectricalCatalogProduct } from "./types";

function product(partial: Partial<ElectricalCatalogProduct> & { id: string; name: string }): ElectricalCatalogProduct {
  return {
    tradeId: "electrical",
    categoryId: "electrical__vypinace-a-ovladace",
    categoryPathIds: ["electrical__vypinace-a-ovladace"],
    categoryPathNames: ["Vypínače a ovládače"],
    normalizedName: partial.name.toLowerCase(),
    supplierSku: "",
    brand: null,
    series: null,
    productType: null,
    unit: "ks",
    attributes: {},
    supplier: { supplierId: "buco", supplierName: "BUČO", sourceUrl: "https://x" },
    pricing: { currency: "EUR", netCents: 100, grossCents: 120, priceStatus: "valid" },
    availability: { quantity: 1, status: "in_stock" },
    searchTokens: [],
    classificationConfidence: 0.9,
    status: "active",
    importId: "t",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("searchElectricalProducts", () => {
  const catalog = [
    product({
      id: "1",
      name: "Valena Life rámček biely",
      supplierSku: "752501",
      brand: "Legrand",
      series: "Valena Life",
      searchTokens: ["valena", "life", "ramcek", "biely", "legrand", "752501"],
    }),
    product({
      id: "2",
      name: "Istič 10A",
      supplierSku: "111",
      categoryId: "electrical__istice-a-ochranne-pristroje",
      categoryPathIds: ["electrical__istice-a-ochranne-pristroje"],
      searchTokens: ["istic", "10a"],
    }),
  ];

  it("suggests by name fragment", () => {
    const hits = searchElectricalProducts(catalog, "valena");
    expect(hits[0]?.product.id).toBe("1");
  });

  it("suggests by SKU", () => {
    const hits = searchElectricalProducts(catalog, "752501");
    expect(hits[0]?.product.id).toBe("1");
  });

  it("respects category filter", () => {
    const hits = searchElectricalProducts(catalog, "istic", {
      categoryId: "electrical__istice-a-ochranne-pristroje",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.product.id).toBe("2");
  });
});
