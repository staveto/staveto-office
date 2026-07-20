/**
 * Optional product/price snapshots for quoteItems — additive, backward compatible.
 */

import { CATALOG_SCHEMA_VERSION } from "./marketDefaults";
import type { QuotePriceSnapshot, QuoteProductSnapshot, SupplierOfferBase } from "./types";
import type { CatalogProduct } from "./types";

export function isQuoteProductSnapshot(value: unknown): value is QuoteProductSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === "number" &&
    typeof v.productId === "string" &&
    typeof v.productName === "string"
  );
}

export function isQuotePriceSnapshot(value: unknown): value is QuotePriceSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === "number" &&
    typeof v.sourceType === "string" &&
    typeof v.priceType === "string" &&
    typeof v.saleUnitNet === "number" &&
    typeof v.currency === "string" &&
    typeof v.unit === "string" &&
    typeof v.priceBasisQuantity === "number" &&
    typeof v.packageQuantity === "number"
  );
}

/** Parse optional snapshots from a Firestore quoteItem payload. */
export function parseQuoteItemSnapshots(data: Record<string, unknown>): {
  productSnapshot?: QuoteProductSnapshot;
  priceSnapshot?: QuotePriceSnapshot;
} {
  const productSnapshot = isQuoteProductSnapshot(data.productSnapshot)
    ? data.productSnapshot
    : undefined;
  const priceSnapshot = isQuotePriceSnapshot(data.priceSnapshot)
    ? data.priceSnapshot
    : undefined;
  return { productSnapshot, priceSnapshot };
}

/** Strip undefined for Firestore-safe serialization. */
export function serializeQuoteItemSnapshots(input: {
  productSnapshot?: QuoteProductSnapshot;
  priceSnapshot?: QuotePriceSnapshot;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.productSnapshot) {
    out.productSnapshot = stripUndefinedDeep(input.productSnapshot);
  }
  if (input.priceSnapshot) {
    out.priceSnapshot = stripUndefinedDeep(input.priceSnapshot);
  }
  return out;
}

function stripUndefinedDeep<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export function buildQuoteProductSnapshot(
  product: Pick<
    CatalogProduct,
    | "id"
    | "name"
    | "brand"
    | "manufacturerPartNumber"
    | "gtin"
    | "professionCode"
    | "categoryId"
  >,
  supplier?: { id: string; name: string; supplierSku?: string }
): QuoteProductSnapshot {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    productId: product.id,
    productName: product.name,
    brand: product.brand,
    manufacturerPartNumber: product.manufacturerPartNumber,
    gtin: product.gtin,
    professionCode: product.professionCode,
    categoryId: product.categoryId,
    supplierId: supplier?.id,
    supplierName: supplier?.name,
    supplierSku: supplier?.supplierSku,
  };
}

/**
 * Build a price snapshot from an offer + the sale unit price that will sit on the quote line.
 * Snapshot is frozen — later offer changes must not mutate it.
 */
export function buildQuotePriceSnapshot(input: {
  offer?: Pick<
    SupplierOfferBase,
    | "id"
    | "sourceType"
    | "sourceReference"
    | "sourceUrl"
    | "observedAt"
    | "validTo"
    | "priceType"
    | "priceNet"
    | "priceGross"
    | "vatRate"
    | "currency"
    | "priceUnit"
    | "priceBasisQuantity"
    | "packageQuantity"
  >;
  saleUnitNet: number;
  saleUnitGross?: number;
  currency: string;
  unit: string;
  wastePercent?: number;
}): QuotePriceSnapshot {
  const offer = input.offer;
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    supplierOfferId: offer?.id,
    sourceType: offer?.sourceType ?? "manual",
    sourceReference: offer?.sourceReference,
    sourceUrl: offer?.sourceUrl,
    observedAt: offer?.observedAt,
    validTo: offer?.validTo,
    priceType: offer?.priceType ?? "manual",
    purchaseUnitNet: offer?.priceNet,
    purchaseUnitGross: offer?.priceGross,
    saleUnitNet: input.saleUnitNet,
    saleUnitGross: input.saleUnitGross,
    vatRate: offer?.vatRate,
    currency: input.currency,
    unit: input.unit,
    priceBasisQuantity: offer?.priceBasisQuantity ?? 1,
    packageQuantity: offer?.packageQuantity ?? 1,
    wastePercent: input.wastePercent,
  };
}

/** Historical quote lines without snapshots remain valid. */
export function isHistoricalQuoteItemReadable(item: {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  productSnapshot?: unknown;
  priceSnapshot?: unknown;
}): boolean {
  return (
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    typeof item.qty === "number" &&
    typeof item.unit === "string" &&
    typeof item.unitPrice === "number"
  );
}
