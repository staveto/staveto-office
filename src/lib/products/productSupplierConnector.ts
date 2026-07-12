/**
 * Supplier connector abstraction — pluggable sources for product search/prices.
 * Do not scrape sites illegally; use APIs, feeds, or uploaded pricebooks.
 */

import type { ProductCandidate, ProductSearchIntent } from "./productSourcingTypes";

export type ProductSupplierConnector = {
  id: string;
  name: string;
  countryCodes: string[];
  supportsSearch: boolean;
  supportsPrice: boolean;
  supportsAvailability: boolean;
  searchProducts: (intent: ProductSearchIntent) => Promise<ProductCandidate[]>;
};

export function rankCandidates(
  candidates: ProductCandidate[],
  preferredBrands: string[],
  preferredSuppliers: string[],
  priceTier: "economy" | "standard" | "premium"
): ProductCandidate[] {
  const brandSet = preferredBrands.map((b) => b.toLowerCase());
  const supplierSet = preferredSuppliers.map((s) => s.toLowerCase());

  const scored = candidates.map((c) => {
    let score = 0;
    const brand = (c.brand ?? "").toLowerCase();
    const supplier = (c.supplierName ?? "").toLowerCase();
    if (brand && brandSet.some((b) => brand.includes(b) || b.includes(brand))) score += 40;
    if (supplier && supplierSet.some((s) => supplier.includes(s))) score += 20;
    if (c.confidence === "confirmed") score += 25;
    else if (c.confidence === "indicative") score += 10;
    if (c.sourceType === "uploaded_pricebook") score += 30;
    else if (c.sourceType === "supplier_api") score += 28;
    else if (c.sourceType === "company_catalog") score += 22;
    else if (c.sourceType === "manual_entry") score += 15;
    else if (c.sourceType === "ai_suggestion") score += 2;
    if (c.priceTier === priceTier) score += 12;
    else if (priceTier === "economy" && c.priceTier === "standard") score += 4;
    else if (priceTier === "premium" && c.priceTier === "standard") score += 4;
    if (typeof c.netUnitPrice === "number" && c.netUnitPrice > 0) score += 15;
    else score -= 50;
    return { c, score };
  });

  return scored.sort((a, b) => b.score - a.score).map((x) => x.c);
}
