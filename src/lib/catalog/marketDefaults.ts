/**
 * Market defaults for the SK product catalog contract (Phase 2A).
 * Tax rates are NOT hard-coded here — use existing workspace/VAT helpers when needed.
 */

import { resolveCountryConfig } from "@/lib/workspace/countryConfig";

export const CATALOG_SCHEMA_VERSION = 1 as const;

/** First supported market. */
export const SK_MARKET_CODE = "SK" as const;

export type CatalogMarketCode = typeof SK_MARKET_CODE | string;

export type CatalogMarketDefaults = {
  marketCode: CatalogMarketCode;
  locale: string;
  currency: string;
  schemaVersion: number;
};

export function getSkCatalogMarketDefaults(): CatalogMarketDefaults {
  const country = resolveCountryConfig(SK_MARKET_CODE);
  return {
    marketCode: SK_MARKET_CODE,
    locale: "sk-SK",
    currency: country.currency,
    schemaVersion: CATALOG_SCHEMA_VERSION,
  };
}
