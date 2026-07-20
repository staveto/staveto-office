/**
 * Feature flag for SK product catalog read path (Phase 2A).
 * Default OFF — no production catalog content yet.
 * Does not change UI in this phase.
 */

export function isSkProductCatalogEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SK_PRODUCT_CATALOG === "1";
}
