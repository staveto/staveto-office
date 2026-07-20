/**
 * Canonical Firestore path builders for the SK catalog contract.
 * Public offers and workspace offers are NEVER co-located.
 *
 * Rules for these paths are deferred until Phase 2B (first write) —
 * unmatched paths stay deny-by-default.
 */

export function catalogMarketProfessionPath(
  marketCode: string,
  professionCode: string
): string {
  return `catalogMarkets/${marketCode}/professions/${professionCode}`;
}

export function catalogMarketCategoryPath(
  marketCode: string,
  categoryId: string
): string {
  return `catalogMarkets/${marketCode}/categories/${categoryId}`;
}

export function catalogMarketProductPath(
  marketCode: string,
  productId: string
): string {
  return `catalogMarkets/${marketCode}/products/${productId}`;
}

export function catalogMarketSupplierPath(
  marketCode: string,
  supplierId: string
): string {
  return `catalogMarkets/${marketCode}/suppliers/${supplierId}`;
}

export function catalogMarketPublicOfferPath(
  marketCode: string,
  offerId: string
): string {
  return `catalogMarkets/${marketCode}/publicOffers/${offerId}`;
}

export function workspaceSupplierOfferPath(
  workspaceKey: string,
  offerId: string
): string {
  return `workspaces/${workspaceKey}/supplierOffers/${offerId}`;
}

export function workspaceCatalogItemPath(
  workspaceKey: string,
  catalogItemId: string
): string {
  return `workspaces/${workspaceKey}/catalogItems/${catalogItemId}`;
}

/** True when path is a market public offer (never workspace-private). */
export function isPublicOfferPath(path: string): boolean {
  return /^catalogMarkets\/[^/]+\/publicOffers\/[^/]+$/.test(path);
}

/** True when path is a workspace-private supplier offer. */
export function isWorkspaceOfferPath(path: string): string | null {
  const m = path.match(/^workspaces\/([^/]+)\/supplierOffers\/[^/]+$/);
  return m?.[1] ?? null;
}

/**
 * Isolation contract: org A workspace key cannot equal org B.
 * Solo uses uid; company uses orgId (see getWorkspaceStorageKey).
 */
export function canWorkspaceReadOffer(
  readerWorkspaceKey: string,
  offerWorkspaceKey: string
): boolean {
  return readerWorkspaceKey === offerWorkspaceKey;
}

/** Market catalog client writes are forbidden until server-only import exists. */
export const MARKET_CATALOG_CLIENT_WRITE_ALLOWED = false;
