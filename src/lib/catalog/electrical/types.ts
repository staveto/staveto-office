/**
 * Phase 1 — additive electrical supplier catalog documents
 * (catalogCategories / catalogProducts / catalogImports).
 * Separate from company catalogItems and Phase 2A catalogMarkets/*.
 */

export type CatalogPriceStatus = "valid" | "needs_review" | "missing";
export type CatalogAvailabilityStatus = "in_stock" | "out_of_stock" | "unknown";
export type CatalogProductStatus = "active" | "needs_review" | "rejected";
export type CatalogImportStatus = "dry_run" | "importing" | "completed" | "failed";

export type ElectricalCatalogCategory = {
  id: string;
  tradeId: string;
  parentId: string | null;
  name: string;
  normalizedName: string;
  slug: string;
  level: number;
  pathIds: string[];
  pathNames: string[];
  sourceId: "buco";
  sourcePath: string | null;
  productCount: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ElectricalProductAttributes = {
  color?: string;
  ipRating?: string;
  poleCount?: number;
  switchType?: string;
  currentA?: number;
  characteristic?: string;
  moduleCount?: number;
  cableType?: string;
  crossSectionMm2?: number;
};

export type ElectricalCatalogProduct = {
  id: string;
  tradeId: string;
  categoryId: string;
  categoryPathIds: string[];
  categoryPathNames: string[];
  name: string;
  normalizedName: string;
  supplierSku: string;
  brand: string | null;
  series: string | null;
  productType: string | null;
  unit: "ks";
  /** Product thumbnail (BUCO CDN). Optional for older imports. */
  imageUrl: string | null;
  attributes: ElectricalProductAttributes;
  supplier: {
    supplierId: "buco";
    supplierName: "BUČO";
    sourceUrl: string;
  };
  pricing: {
    currency: "EUR";
    netCents: number | null;
    grossCents: number | null;
    priceStatus: CatalogPriceStatus;
  };
  availability: {
    quantity: number | null;
    status: CatalogAvailabilityStatus;
  };
  searchTokens: string[];
  classificationConfidence: number;
  status: CatalogProductStatus;
  importId: string;
  createdAt: string;
  updatedAt: string;
};

export type ElectricalCatalogImport = {
  id: string;
  countryCode: "SK";
  tradeId: string;
  supplierId: "buco";
  sourceFile: string;
  status: CatalogImportStatus;
  categoriesFound: number;
  productsFound: number;
  productsValid: number;
  productsNeedingReview: number;
  productsRejected: number;
  startedAt: string;
  finishedAt: string | null;
};

export type BucoRawProduct = {
  nazov?: string;
  kod?: string;
  cena_s_dph?: string;
  cena_bez_dph?: string;
  sklad?: string;
  /** Absolute image URL from scraper (may be empty). */
  obrazok_url?: string;
  url: string;
  sourceCategoryPath?: string;
  sourceCategoryName?: string;
  cesta?: string[];
};

export type BucoScraperState = {
  visited?: string[];
  tree?: Record<
    string,
    {
      name?: string;
      nazov?: string;
      url?: string;
      path?: string;
      parentPath?: string | null;
      children?: string[];
      products?: string[];
    }
  >;
  products?: Record<string, BucoRawProduct>;
  meta?: Record<string, unknown>;
};

export type ClassificationHit = {
  topSlug: string;
  childSlug: string | null;
  confidence: number;
  productType: string | null;
  attributes: ElectricalProductAttributes;
  unmatched: boolean;
};
