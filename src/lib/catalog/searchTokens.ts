/**
 * Normalized search tokens for CatalogProduct.searchTokens.
 * No external search engine — pure helpers only.
 */

import { normalizeSearchText } from "./normalize";

const MAX_TOKENS = 64;
const MAX_TOKEN_LEN = 40;
const PREFIX_MIN = 3;
const PREFIX_MAX = 8;

function tokenizeWords(text: string): string[] {
  return normalizeSearchText(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function prefixTokens(word: string): string[] {
  if (word.length < PREFIX_MIN) return [];
  const out: string[] = [];
  const max = Math.min(word.length, PREFIX_MAX);
  for (let i = PREFIX_MIN; i <= max; i++) {
    out.push(word.slice(0, i));
  }
  return out;
}

export type SearchTokenInput = {
  name?: string;
  brand?: string;
  manufacturerPartNumber?: string;
  gtin?: string;
  supplierSku?: string;
  categoryLabel?: string;
  professionLabel?: string;
};

export function buildSearchTokens(input: SearchTokenInput): string[] {
  const raw: string[] = [];

  for (const field of [
    input.name,
    input.brand,
    input.manufacturerPartNumber,
    input.gtin,
    input.supplierSku,
    input.categoryLabel,
    input.professionLabel,
  ]) {
    if (!field?.trim()) continue;
    const words = tokenizeWords(field);
    for (const w of words) {
      const clipped = w.slice(0, MAX_TOKEN_LEN);
      raw.push(clipped);
      raw.push(...prefixTokens(clipped));
    }
    // Keep compact codes (EAN / MPN) as whole tokens too.
    const compact = normalizeSearchText(field).replace(/\s+/g, "");
    if (compact.length >= 2) raw.push(compact.slice(0, MAX_TOKEN_LEN));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TOKENS) break;
  }
  return out;
}
