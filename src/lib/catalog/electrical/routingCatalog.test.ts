import { describe, expect, it } from "vitest";
import type {
  ElectricalCatalogCategory,
  ElectricalCatalogProduct,
} from "./types";
import {
  filterRoutingElectricalProducts,
  routingTopCategoryIds,
} from "./routingCatalog";

function cat(
  partial: Partial<ElectricalCatalogCategory> &
    Pick<ElectricalCatalogCategory, "id" | "slug" | "level">
): ElectricalCatalogCategory {
  return {
    tradeId: "electrical",
    parentId: null,
    name: partial.slug,
    normalizedName: partial.slug,
    pathIds: [partial.id],
    pathNames: [partial.slug],
    sourceId: "buco",
    sourcePath: null,
    productCount: 0,
    isActive: true,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function product(
  partial: Partial<ElectricalCatalogProduct> &
    Pick<ElectricalCatalogProduct, "id" | "categoryPathIds">
): ElectricalCatalogProduct {
  return {
    tradeId: "electrical",
    categoryId: partial.categoryPathIds[0] ?? "x",
    categoryPathNames: [],
    name: partial.id,
    normalizedName: partial.id,
    supplierSku: "",
    brand: null,
    series: null,
    productType: null,
    unit: "ks",
    imageUrl: null,
    attributes: {},
    supplier: {
      supplierId: "buco",
      supplierName: "BUČO",
      sourceUrl: "",
    },
    pricing: {
      currency: "EUR",
      netCents: null,
      grossCents: null,
      priceStatus: "missing",
    },
    availability: { quantity: null, status: "unknown" },
    searchTokens: [],
    classificationConfidence: 1,
    status: "active",
    importId: "i",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("routingCatalog", () => {
  const categories = [
    cat({ id: "cables", slug: "kable-a-vodice", level: 0 }),
    cat({ id: "routes", slug: "rurky-listy-a-kablove-trasy", level: 0 }),
    cat({ id: "sockets", slug: "zasuvky-a-vypinace", level: 0 }),
  ];

  it("resolves routing top category ids", () => {
    const ids = routingTopCategoryIds(categories);
    expect([...ids].sort()).toEqual(["cables", "routes"]);
  });

  it("keeps only products under routing tops", () => {
    const products = [
      product({ id: "cyky", categoryPathIds: ["cables", "instalacne"] }),
      product({ id: "conduit", categoryPathIds: ["routes", "rurky"] }),
      product({ id: "switch", categoryPathIds: ["sockets", "vypinace"] }),
    ];
    const filtered = filterRoutingElectricalProducts(products, categories);
    expect(filtered.map((p) => p.id).sort()).toEqual(["conduit", "cyky"]);
  });
});
