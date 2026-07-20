/**
 * Provider abstraction for future catalog sources (Phase 2A — interface only).
 * No internet scrapers or fake online adapters in production code.
 */

import type { CatalogMarketCode } from "./marketDefaults";
import type { CatalogProfessionCode } from "./professions";

export type CatalogSourceContext = {
  marketCode: CatalogMarketCode;
  professionCode?: CatalogProfessionCode;
  categoryId?: string;
  workspaceKey?: string;
};

export type CatalogSearchResult = {
  externalId: string;
  productId?: string;
  name: string;
  brand?: string;
  manufacturerPartNumber?: string;
  gtin?: string;
  /** Offer id if the hit includes a price — never invent mock prices here. */
  supplierOfferId?: string;
  supplierId?: string;
  /** Present only when a real offer was resolved — not authoritative product field. */
  indicativePriceNet?: number;
  currency?: string;
  sourceType: string;
};

export interface CatalogSourceAdapter {
  readonly id: string;
  readonly sourceType: string;

  searchProducts(
    query: string,
    context: CatalogSourceContext
  ): Promise<CatalogSearchResult[]>;

  getProduct?(
    externalId: string,
    context: CatalogSourceContext
  ): Promise<CatalogSearchResult | null>;
}

/**
 * Proof-of-interface adapter for company catalogItems (templates).
 * Inject listFn so unit tests stay Firestore-free.
 * Does not invent market prices — maps sell unitPrice as company list only.
 */
export function createCompanyCatalogItemsAdapter(deps: {
  listItems: (workspaceKey: string) => Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      unitPrice: number;
      currency: string;
      kind: string;
    }>
  >;
}): CatalogSourceAdapter {
  return {
    id: "company_catalog_items",
    sourceType: "manual",
    async searchProducts(query, context) {
      if (!context.workspaceKey) return [];
      const q = query.trim().toLowerCase();
      const items = await deps.listItems(context.workspaceKey);
      return items
        .filter((i) => !q || i.name.toLowerCase().includes(q))
        .map((i) => ({
          externalId: i.id,
          name: i.name,
          sourceType: "manual",
          indicativePriceNet: i.unitPrice,
          currency: i.currency,
        }));
    },
    async getProduct(externalId, context) {
      if (!context.workspaceKey) return null;
      const items = await deps.listItems(context.workspaceKey);
      const hit = items.find((i) => i.id === externalId);
      if (!hit) return null;
      return {
        externalId: hit.id,
        name: hit.name,
        sourceType: "manual",
        indicativePriceNet: hit.unitPrice,
        currency: hit.currency,
      };
    },
  };
}
