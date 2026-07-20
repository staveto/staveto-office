/**
 * Core SK product catalog data contract (Phase 2A).
 * PRODUCT ≠ PRICE — CatalogProduct is technical identity; SupplierOffer is priced offer.
 */

import type { CatalogMarketCode } from "./marketDefaults";
import type { CatalogProfessionCode } from "./professions";

export type CatalogProduct = {
  id: string;
  schemaVersion: number;

  marketCode: CatalogMarketCode;
  professionCode: CatalogProfessionCode;
  categoryId: string;

  name: string;
  description?: string;

  brand?: string;
  manufacturerPartNumber?: string;

  gtin?: string;
  normalizedGtin?: string;
  normalizedManufacturerPartNumber?: string;
  normalizedBrand?: string;

  /** Sell / stock unit (ks, m, …) — not a price. */
  baseUnit: string;
  /** Units per package; must be > 0. */
  packageQuantity: number;

  attributes?: Record<string, string | number | boolean>;

  imageUrl?: string;
  datasheetUrl?: string;

  searchTokens: string[];

  active: boolean;

  createdAt: string;
  updatedAt: string;
};

export type CatalogSupplier = {
  id: string;
  marketCode: CatalogMarketCode;
  name: string;
  legalName?: string;
  websiteUrl?: string;
  active: boolean;
  identifiers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type SupplierOfferPriceType =
  | "list"
  | "contract"
  | "promotion"
  | "project"
  | "quote"
  | "manual"
  | "public";

export type SupplierOfferAvailability =
  | "in_stock"
  | "limited"
  | "on_order"
  | "out_of_stock"
  | "unknown";

export type SupplierOfferSourceType =
  | "csv"
  | "xlsx"
  | "api"
  | "supplier_feed"
  | "manual"
  | "public_url";

export type SupplierOfferStatus = "current" | "stale" | "indicative" | "missing";

/**
 * Shared offer shape for public market offers and workspace-private offers.
 * Money: number major units (EUR) — matches existing app convention.
 */
export type SupplierOfferBase = {
  id: string;
  schemaVersion: number;

  productId: string;
  supplierId: string;
  marketCode: CatalogMarketCode;

  supplierSku?: string;

  priceType: SupplierOfferPriceType;

  priceNet?: number;
  priceGross?: number;
  priceIncludesVat: boolean;
  vatRate?: number;

  currency: string;

  priceUnit: string;
  priceBasisQuantity: number;
  packageQuantity: number;
  minimumOrderQuantity?: number;

  validFrom?: string;
  validTo?: string;
  /** When the price was observed / imported — separate from validity window. */
  observedAt: string;

  stockQuantity?: number;
  availabilityStatus?: SupplierOfferAvailability;

  sourceType: SupplierOfferSourceType;
  sourceReference?: string;
  sourceUrl?: string;

  status: SupplierOfferStatus;

  createdAt: string;
  updatedAt: string;
};

/** Public / indicative market offer (catalogMarkets/.../publicOffers). */
export type PublicSupplierOffer = SupplierOfferBase & {
  visibility: "public";
};

/** Workspace-private offer (workspaces/.../supplierOffers). */
export type WorkspaceSupplierOffer = SupplierOfferBase & {
  visibility: "workspace";
  workspaceKey: string;
};

export type QuoteProductSnapshot = {
  schemaVersion: number;

  productId: string;
  productName: string;

  brand?: string;
  manufacturerPartNumber?: string;
  gtin?: string;

  professionCode?: string;
  categoryId?: string;

  supplierId?: string;
  supplierName?: string;
  supplierSku?: string;
};

export type QuotePriceSnapshot = {
  schemaVersion: number;

  supplierOfferId?: string;

  sourceType: string;
  sourceReference?: string;
  sourceUrl?: string;

  observedAt?: string;
  validTo?: string;

  priceType: string;

  purchaseUnitNet?: number;
  purchaseUnitGross?: number;

  /** Sale price that lands on the quote line (existing unitPrice). */
  saleUnitNet: number;
  saleUnitGross?: number;

  vatRate?: number;
  currency: string;

  unit: string;
  priceBasisQuantity: number;
  packageQuantity: number;

  wastePercent?: number;
};

/**
 * Optional back-refs on company catalogItems (workspaces/.../catalogItems).
 * All fields optional — no migration required.
 */
export type CatalogItemMarketRefs = {
  professionCode?: CatalogProfessionCode;
  categoryId?: string;
  marketProductId?: string;
  preferredSupplierOfferId?: string;
};
