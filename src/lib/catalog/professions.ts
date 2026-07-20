/**
 * Catalog professions — deterministic in-code taxonomy (not auto-seeded to Firestore).
 * No products or prices are attached.
 */

import { CATALOG_SCHEMA_VERSION, SK_MARKET_CODE, type CatalogMarketCode } from "./marketDefaults";

export const CATALOG_PROFESSION_CODES = [
  "electrical",
  "low_voltage",
  "plumbing",
  "heating",
  "gas",
  "hvac",
  "cooling",
  "masonry",
  "concrete",
  "drywall",
  "plastering",
  "painting",
  "tiling",
  "flooring",
  "insulation",
  "facade",
  "roofing",
  "carpentry",
  "sheet_metal",
  "windows_doors",
  "metalwork",
  "earthworks",
  "exterior",
] as const;

export type CatalogProfessionCode = (typeof CATALOG_PROFESSION_CODES)[number];

export type CatalogProfession = {
  code: CatalogProfessionCode;
  marketCode: CatalogMarketCode;
  /** Localized display labels by locale tag (sk-SK first). */
  labels: Record<string, string>;
  active: boolean;
  sortOrder: number;
  schemaVersion: number;
};

const SK_LABELS: Record<CatalogProfessionCode, string> = {
  electrical: "Elektroinštalácie",
  low_voltage: "Slaboprúd",
  plumbing: "Voda a kanalizácia",
  heating: "Kúrenie",
  gas: "Plyn",
  hvac: "Vzduchotechnika",
  cooling: "Chladenie",
  masonry: "Murárske práce",
  concrete: "Betónovanie",
  drywall: "Sadrokartón",
  plastering: "Omietky",
  painting: "Maľovanie",
  tiling: "Obklady a dlažby",
  flooring: "Podlahy",
  insulation: "Izolácie",
  facade: "Fasády",
  roofing: "Strechy",
  carpentry: "Tesárstvo",
  sheet_metal: "Klampiarstvo",
  windows_doors: "Okná a dvere",
  metalwork: "Zámočníctvo",
  earthworks: "Zemné práce",
  exterior: "Exteriér",
};

/**
 * Deterministic profession list for SK.
 * Idempotent: calling repeatedly returns the same data.
 * Never auto-run at app startup — import explicitly when needed.
 */
export function listSkCatalogProfessions(): CatalogProfession[] {
  return CATALOG_PROFESSION_CODES.map((code, index) => ({
    code,
    marketCode: SK_MARKET_CODE,
    labels: { "sk-SK": SK_LABELS[code] },
    active: true,
    sortOrder: index + 1,
    schemaVersion: CATALOG_SCHEMA_VERSION,
  }));
}

export function isCatalogProfessionCode(value: string): value is CatalogProfessionCode {
  return (CATALOG_PROFESSION_CODES as readonly string[]).includes(value);
}

export function getSkProfessionLabel(code: CatalogProfessionCode, locale = "sk-SK"): string {
  const row = listSkCatalogProfessions().find((p) => p.code === code);
  return row?.labels[locale] ?? row?.labels["sk-SK"] ?? code;
}
