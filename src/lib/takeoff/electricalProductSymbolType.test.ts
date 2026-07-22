import { describe, expect, it } from "vitest";
import type { ElectricalCatalogProduct } from "@/lib/catalog/electrical/types";
import { symbolTypeFromElectricalProduct } from "./electricalProductSymbolType";

function product(
  partial: Partial<ElectricalCatalogProduct> & Pick<ElectricalCatalogProduct, "name">
): ElectricalCatalogProduct {
  return {
    id: "p1",
    tradeId: "electrical",
    categoryId: "c1",
    categoryPathIds: ["c1"],
    categoryPathNames: ["Test"],
    normalizedName: partial.name.toLowerCase(),
    supplierSku: "SKU",
    brand: null,
    series: null,
    productType: null,
    unit: "ks",
    attributes: {},
    supplier: {
      supplierId: "buco",
      supplierName: "BUČO",
      sourceUrl: "https://example.com",
    },
    pricing: {
      currency: "EUR",
      netCents: 100,
      grossCents: 120,
      priceStatus: "valid",
    },
    availability: { quantity: 1, status: "in_stock" },
    searchTokens: [],
    classificationConfidence: 1,
    status: "active",
    importId: "imp1",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("symbolTypeFromElectricalProduct", () => {
  it("maps sockets and switches from productType", () => {
    expect(
      symbolTypeFromElectricalProduct(product({ name: "A", productType: "double_socket" }))
    ).toBe("socket");
    expect(
      symbolTypeFromElectricalProduct(product({ name: "A", productType: "switch_5" }))
    ).toBe("switch");
  });

  it("maps luminaires and boards", () => {
    expect(
      symbolTypeFromElectricalProduct(product({ name: "A", productType: "luminaire" }))
    ).toBe("light");
    expect(
      symbolTypeFromElectricalProduct(
        product({ name: "A", productType: "distribution_board" })
      )
    ).toBe("distribution_board");
  });

  it("falls back to generic", () => {
    expect(
      symbolTypeFromElectricalProduct(product({ name: "WAGO svorka", productType: "wago" }))
    ).toBe("generic");
  });
});
