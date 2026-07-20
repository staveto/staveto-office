import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG_PROFESSION_CODES,
  canAutoImportMatch,
  canWorkspaceReadOffer,
  catalogMarketProductPath,
  catalogMarketPublicOfferPath,
  createCatalogCategory,
  createCompanyCatalogItemsAdapter,
  buildQuotePriceSnapshot,
  buildQuoteProductSnapshot,
  buildSearchTokens,
  getSkCatalogMarketDefaults,
  getSkProfessionLabel,
  isHistoricalQuoteItemReadable,
  isPublicOfferPath,
  isSkProductCatalogEnabled,
  isWorkspaceOfferPath,
  listSkCatalogProfessions,
  MARKET_CATALOG_CLIENT_WRITE_ALLOWED,
  matchCatalogProduct,
  normalizeGtin,
  normalizeManufacturerPartNumber,
  parseQuoteItemSnapshots,
  serializeQuoteItemSnapshots,
  validateCatalogCategoryTree,
  validateCatalogProduct,
  validateSupplierOffer,
  workspaceCatalogItemPath,
  workspaceSupplierOfferPath,
} from "./index";
import type { CatalogProduct } from "./types";
import { SK_MARKET_CODE } from "./marketDefaults";

describe("SK catalog professions", () => {
  it("has unique profession codes", () => {
    expect(new Set(CATALOG_PROFESSION_CODES).size).toBe(CATALOG_PROFESSION_CODES.length);
  });

  it("has Slovak labels for every profession", () => {
    for (const p of listSkCatalogProfessions()) {
      expect(p.labels["sk-SK"]).toBeTruthy();
      expect(getSkProfessionLabel(p.code)).toBe(p.labels["sk-SK"]);
    }
  });
});

describe("SK catalog market defaults", () => {
  it("uses SK / sk-SK / EUR", () => {
    const d = getSkCatalogMarketDefaults();
    expect(d.marketCode).toBe("SK");
    expect(d.locale).toBe("sk-SK");
    expect(d.currency).toBe("EUR");
  });
});

describe("catalog categories", () => {
  it("accepts parent in same market/profession tree", () => {
    const parent = createCatalogCategory({
      code: "cables",
      marketCode: SK_MARKET_CODE,
      professionCode: "electrical",
      labelSk: "Káble",
    });
    const child = createCatalogCategory({
      code: "power_cables",
      marketCode: SK_MARKET_CODE,
      professionCode: "electrical",
      parentId: parent.id,
      labelSk: "Silové káble",
    });
    expect(validateCatalogCategoryTree([parent, child])).toEqual({ ok: true });
  });

  it("rejects parent from another profession", () => {
    const parent = createCatalogCategory({
      code: "pipes",
      marketCode: SK_MARKET_CODE,
      professionCode: "plumbing",
      labelSk: "Rúry",
    });
    const child = createCatalogCategory({
      code: "cables",
      marketCode: SK_MARKET_CODE,
      professionCode: "electrical",
      parentId: parent.id,
      labelSk: "Káble",
    });
    const res = validateCatalogCategoryTree([parent, child]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.error === "parent_profession_mismatch")).toBe(true);
    }
  });
});

describe("CatalogProduct validation", () => {
  const base: CatalogProduct = {
    id: "p1",
    schemaVersion: 1,
    marketCode: "SK",
    professionCode: "electrical",
    categoryId: "sk_electrical_cables",
    name: "CYKY 3x2.5",
    baseUnit: "m",
    packageQuantity: 100,
    searchTokens: [],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("requires packageQuantity > 0", () => {
    expect(validateCatalogProduct({ ...base, packageQuantity: 0 }).ok).toBe(false);
    expect(validateCatalogProduct(base).ok).toBe(true);
  });

  it("forbids authoritative price fields on product", () => {
    expect(
      validateCatalogProduct({ ...base, unitPrice: 1.2 } as CatalogProduct & {
        unitPrice: number;
      }).ok
    ).toBe(false);
  });
});

describe("SupplierOffer validation", () => {
  const base = {
    priceBasisQuantity: 1,
    packageQuantity: 1,
    status: "current" as const,
  };

  it("requires priceBasisQuantity > 0 and packageQuantity > 0", () => {
    expect(
      validateSupplierOffer({ ...base, priceNet: 1, priceBasisQuantity: 0 }).ok
    ).toBe(false);
    expect(
      validateSupplierOffer({ ...base, priceNet: 1, packageQuantity: 0 }).ok
    ).toBe(false);
  });

  it("accepts net-only and gross-only offers", () => {
    expect(validateSupplierOffer({ ...base, priceNet: 4.5 }).ok).toBe(true);
    expect(validateSupplierOffer({ ...base, priceGross: 5.4 }).ok).toBe(true);
  });

  it("rejects offer without net/gross unless status missing", () => {
    expect(validateSupplierOffer({ ...base }).ok).toBe(false);
    expect(validateSupplierOffer({ ...base, status: "missing" }).ok).toBe(true);
  });

  it("does not encode missing price as zero", () => {
    expect(
      validateSupplierOffer({ ...base, status: "missing", priceNet: 0 }).ok
    ).toBe(false);
  });
});

describe("normalization + matching", () => {
  it("normalizes GTIN to digits", () => {
    expect(normalizeGtin("858-1234-567890")).toBe("8581234567890");
  });

  it("exact GTIN match", () => {
    const res = matchCatalogProduct(
      { gtin: "8594012345678" },
      [
        { productId: "a", gtin: "8594012345678" },
        { productId: "b", gtin: "1111111111111" },
      ]
    );
    expect(res.kind).toBe("exact");
    expect(res.productId).toBe("a");
    expect(canAutoImportMatch(res)).toBe(true);
  });

  it("conflicts on duplicate GTIN", () => {
    const res = matchCatalogProduct(
      { gtin: "8594012345678" },
      [
        { productId: "a", gtin: "8594012345678" },
        { productId: "b", gtin: "8594012345678" },
      ]
    );
    expect(res.kind).toBe("conflict");
  });

  it("exact brand + MPN match", () => {
    expect(normalizeManufacturerPartNumber("AB-12.3")).toBe("AB123");
    const res = matchCatalogProduct(
      { brand: "ABB", manufacturerPartNumber: "S201-C16" },
      [
        {
          productId: "x",
          brand: "abb",
          manufacturerPartNumber: "S201 C16",
        },
      ]
    );
    expect(res).toMatchObject({ kind: "exact", productId: "x", reason: "brand_mpn" });
  });

  it("supplier SKU match only within supplier", () => {
    const catalog = [
      {
        productId: "p1",
        supplierSkus: [{ supplierId: "supA", supplierSku: "SKU-1" }],
      },
      {
        productId: "p2",
        supplierSkus: [{ supplierId: "supB", supplierSku: "SKU-1" }],
      },
    ];
    expect(
      matchCatalogProduct({ supplierId: "supA", supplierSku: "sku1" }, catalog)
    ).toMatchObject({ kind: "exact", productId: "p1" });
    expect(
      matchCatalogProduct({ supplierId: "supB", supplierSku: "SKU-1" }, catalog)
    ).toMatchObject({ kind: "exact", productId: "p2" });
  });

  it("name never yields exact merge for auto-import", () => {
    const res = matchCatalogProduct(
      { name: "Zásuvka 230V" },
      [{ productId: "z", name: "Zásuvka 230V" }]
    );
    expect(res.kind).toBe("probable");
    expect(canAutoImportMatch(res)).toBe(false);
  });
});

describe("search tokens", () => {
  it("normalizes diacritics and deduplicates", () => {
    const tokens = buildSearchTokens({
      name: "Zásuvka zásuvka",
      brand: "ABB",
      gtin: "8594012345678",
      professionLabel: "Elektroinštalácie",
    });
    expect(tokens).toContain("zasuvka");
    expect(tokens.filter((t) => t === "zasuvka").length).toBe(1);
    expect(tokens.some((t) => t.includes("8594012345678"))).toBe(true);
  });
});

describe("quote snapshots", () => {
  it("historical quoteItem without snapshot remains readable", () => {
    expect(
      isHistoricalQuoteItemReadable({
        name: "Práca",
        qty: 1,
        unit: "hod",
        unitPrice: 25,
      })
    ).toBe(true);
  });

  it("round-trips product + price snapshots", () => {
    const productSnap = buildQuoteProductSnapshot({
      id: "prod1",
      name: "CYKY 3x2.5",
      brand: "NKT",
      professionCode: "electrical",
      categoryId: "c1",
    });
    const priceSnap = buildQuotePriceSnapshot({
      offer: {
        id: "off1",
        sourceType: "csv",
        observedAt: "2026-07-01T00:00:00.000Z",
        priceType: "list",
        priceNet: 0.8,
        currency: "EUR",
        priceUnit: "m",
        priceBasisQuantity: 1,
        packageQuantity: 100,
      },
      saleUnitNet: 1.2,
      currency: "EUR",
      unit: "m",
    });
    const serialized = serializeQuoteItemSnapshots({
      productSnapshot: productSnap,
      priceSnapshot: priceSnap,
    });
    const parsed = parseQuoteItemSnapshots(serialized);
    expect(parsed.productSnapshot?.productId).toBe("prod1");
    expect(parsed.priceSnapshot?.saleUnitNet).toBe(1.2);
    expect(parsed.priceSnapshot?.purchaseUnitNet).toBe(0.8);
  });
});

describe("public / workspace offer path separation", () => {
  it("separates public and workspace offer paths", () => {
    const pub = catalogMarketPublicOfferPath("SK", "o1");
    const wsA = workspaceSupplierOfferPath("orgA", "o1");
    const wsB = workspaceSupplierOfferPath("orgB", "o1");
    expect(isPublicOfferPath(pub)).toBe(true);
    expect(isWorkspaceOfferPath(wsA)).toBe("orgA");
    expect(isPublicOfferPath(wsA)).toBe(false);
    expect(canWorkspaceReadOffer("orgA", "orgA")).toBe(true);
    expect(canWorkspaceReadOffer("orgA", "orgB")).toBe(false);
    expect(wsA).not.toBe(wsB);
    expect(workspaceCatalogItemPath("orgA", "c1")).toContain("catalogItems");
    expect(catalogMarketProductPath("SK", "p1")).toBe("catalogMarkets/SK/products/p1");
  });

  it("forbids client writes to market catalog until server import", () => {
    expect(MARKET_CATALOG_CLIENT_WRITE_ALLOWED).toBe(false);
  });
});

describe("feature flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults OFF", () => {
    expect(isSkProductCatalogEnabled()).toBe(false);
  });

  it("enables only when explicitly 1", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SK_PRODUCT_CATALOG", "1");
    expect(isSkProductCatalogEnabled()).toBe(true);
  });
});

describe("company catalog adapter (interface proof)", () => {
  it("searches workspace catalogItems without mock market prices", async () => {
    const adapter = createCompanyCatalogItemsAdapter({
      listItems: async (key) =>
        key === "org1"
          ? [{ id: "c1", name: "Montáž", unitPrice: 20, currency: "EUR", kind: "work" }]
          : [],
    });
    const hits = await adapter.searchProducts("mont", {
      marketCode: "SK",
      workspaceKey: "org1",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.sourceType).toBe("manual");
    const other = await adapter.searchProducts("mont", {
      marketCode: "SK",
      workspaceKey: "org2",
    });
    expect(other).toHaveLength(0);
  });
});
