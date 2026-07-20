/**
 * Hierarchical catalog categories — data-driven (not TS enums that require rebuilds).
 * Full SK taxonomy is out of scope for 2A; fixtures live in tests only.
 */

import { CATALOG_SCHEMA_VERSION, type CatalogMarketCode } from "./marketDefaults";
import type { CatalogProfessionCode } from "./professions";

export type CatalogCategory = {
  id: string;
  code: string;
  marketCode: CatalogMarketCode;
  professionCode: CatalogProfessionCode;
  /** null = top-level under profession */
  parentId: string | null;
  labels: Record<string, string>;
  active: boolean;
  sortOrder: number;
  schemaVersion: number;
};

export type CatalogCategoryValidationError =
  | "missing_id"
  | "missing_code"
  | "unknown_profession"
  | "parent_not_found"
  | "parent_market_mismatch"
  | "parent_profession_mismatch"
  | "self_parent";

export function validateCatalogCategoryTree(
  categories: CatalogCategory[]
): { ok: true } | { ok: false; errors: Array<{ id: string; error: CatalogCategoryValidationError }> } {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const errors: Array<{ id: string; error: CatalogCategoryValidationError }> = [];

  for (const cat of categories) {
    if (!cat.id.trim()) {
      errors.push({ id: cat.id || "(empty)", error: "missing_id" });
      continue;
    }
    if (!cat.code.trim()) {
      errors.push({ id: cat.id, error: "missing_code" });
    }
    if (cat.parentId == null) continue;
    if (cat.parentId === cat.id) {
      errors.push({ id: cat.id, error: "self_parent" });
      continue;
    }
    const parent = byId.get(cat.parentId);
    if (!parent) {
      errors.push({ id: cat.id, error: "parent_not_found" });
      continue;
    }
    if (parent.marketCode !== cat.marketCode) {
      errors.push({ id: cat.id, error: "parent_market_mismatch" });
    }
    if (parent.professionCode !== cat.professionCode) {
      errors.push({ id: cat.id, error: "parent_profession_mismatch" });
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Build a category id from market + profession + code (deterministic helper). */
export function buildCatalogCategoryId(
  marketCode: string,
  professionCode: string,
  code: string
): string {
  return `${marketCode}_${professionCode}_${code}`.toLowerCase();
}

export function createCatalogCategory(input: {
  code: string;
  marketCode: CatalogMarketCode;
  professionCode: CatalogProfessionCode;
  parentId?: string | null;
  labelSk: string;
  sortOrder?: number;
  active?: boolean;
}): CatalogCategory {
  const id = buildCatalogCategoryId(input.marketCode, input.professionCode, input.code);
  return {
    id,
    code: input.code,
    marketCode: input.marketCode,
    professionCode: input.professionCode,
    parentId: input.parentId ?? null,
    labels: { "sk-SK": input.labelSk },
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
    schemaVersion: CATALOG_SCHEMA_VERSION,
  };
}
