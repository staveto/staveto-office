/**
 * Exact product matching — name never auto-merges.
 *
 * Priority:
 * 1. normalized GTIN
 * 2. normalized brand + normalized MPN
 * 3. supplierId + normalized supplierSku
 */

import {
  normalizeBrand,
  normalizeGtin,
  normalizeManufacturerPartNumber,
  normalizeSupplierSku,
} from "./normalize";

export type CatalogMatchKind = "exact" | "probable" | "conflict" | "none";

export type CatalogMatchCandidate = {
  productId: string;
  gtin?: string;
  normalizedGtin?: string;
  brand?: string;
  manufacturerPartNumber?: string;
  normalizedBrand?: string;
  normalizedManufacturerPartNumber?: string;
  /** Optional supplier-scoped SKU rows for priority 3. */
  supplierSkus?: Array<{ supplierId: string; supplierSku: string }>;
  name?: string;
};

export type CatalogMatchQuery = {
  gtin?: string;
  brand?: string;
  manufacturerPartNumber?: string;
  supplierId?: string;
  supplierSku?: string;
  /** Name is suggestion-only — never yields `exact`. */
  name?: string;
};

export type CatalogMatchResult = {
  kind: CatalogMatchKind;
  productId?: string;
  reason: string;
  /** When kind === conflict */
  conflictingProductIds?: string[];
};

function gtinOf(c: CatalogMatchCandidate): string | undefined {
  return c.normalizedGtin ?? normalizeGtin(c.gtin);
}

function brandOf(c: CatalogMatchCandidate): string | undefined {
  return c.normalizedBrand ?? normalizeBrand(c.brand);
}

function mpnOf(c: CatalogMatchCandidate): string | undefined {
  return (
    c.normalizedManufacturerPartNumber ??
    normalizeManufacturerPartNumber(c.manufacturerPartNumber)
  );
}

export function matchCatalogProduct(
  query: CatalogMatchQuery,
  catalog: CatalogMatchCandidate[]
): CatalogMatchResult {
  const qGtin = normalizeGtin(query.gtin);
  if (qGtin) {
    const hits = catalog.filter((c) => gtinOf(c) === qGtin);
    if (hits.length === 1) {
      return { kind: "exact", productId: hits[0]!.productId, reason: "gtin" };
    }
    if (hits.length > 1) {
      return {
        kind: "conflict",
        reason: "conflicting_gtin",
        conflictingProductIds: hits.map((h) => h.productId),
      };
    }
  }

  const qBrand = normalizeBrand(query.brand);
  const qMpn = normalizeManufacturerPartNumber(query.manufacturerPartNumber);
  if (qBrand && qMpn) {
    const hits = catalog.filter((c) => brandOf(c) === qBrand && mpnOf(c) === qMpn);
    if (hits.length === 1) {
      return { kind: "exact", productId: hits[0]!.productId, reason: "brand_mpn" };
    }
    if (hits.length > 1) {
      return {
        kind: "conflict",
        reason: "conflicting_brand_mpn",
        conflictingProductIds: hits.map((h) => h.productId),
      };
    }
  }

  const qSupplierId = query.supplierId?.trim();
  const qSku = normalizeSupplierSku(query.supplierSku);
  if (qSupplierId && qSku) {
    const hits = catalog.filter((c) =>
      (c.supplierSkus ?? []).some(
        (row) =>
          row.supplierId === qSupplierId &&
          normalizeSupplierSku(row.supplierSku) === qSku
      )
    );
    if (hits.length === 1) {
      return {
        kind: "exact",
        productId: hits[0]!.productId,
        reason: "supplier_sku",
      };
    }
    if (hits.length > 1) {
      return {
        kind: "conflict",
        reason: "conflicting_supplier_sku",
        conflictingProductIds: hits.map((h) => h.productId),
      };
    }
  }

  // Name may only suggest — never exact merge for auto-import.
  const nameQ = query.name?.trim().toLowerCase();
  if (nameQ && nameQ.length >= 3) {
    const hits = catalog.filter(
      (c) => c.name?.trim().toLowerCase() === nameQ
    );
    if (hits.length === 1) {
      return {
        kind: "probable",
        productId: hits[0]!.productId,
        reason: "name_suggestion_only",
      };
    }
  }

  return { kind: "none", reason: "no_match" };
}

/** Auto-import may only proceed on exact matches. */
export function canAutoImportMatch(result: CatalogMatchResult): boolean {
  return result.kind === "exact" && Boolean(result.productId);
}
