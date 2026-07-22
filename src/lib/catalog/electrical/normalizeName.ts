import { stripDiacritics } from "../normalize";

const PRICE_FRAGMENT =
  /\d{1,5}(?:[.,]\d{1,2})?\s*€(?:\s*s\s*DPH)?/gi;
const LEADING_INDEX = /^\s*\d{1,4}[.)]\s*/;
const STUCK_PRICE_IN_WORD = /([A-Za-zÀ-ž])(\d{1,5}[.,]\d{2})/g;

/** Normalize for matching / tokens (lowercase, no diacritics). */
export function normalizeCatalogName(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugifyCatalog(value: string): string {
  return normalizeCatalogName(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Prefer a clean name from the product URL slug when the raw title is corrupted
 * (stuck prices, leading list index, "s DPH", etc.).
 */
export function cleanProductName(rawName: string, sourceUrl: string): string {
  const fromUrl = nameFromProductUrl(sourceUrl);
  const cleanedRaw = cleanRawName(rawName);
  const rawLooksCorrupted = isCorruptedName(rawName);

  if (rawLooksCorrupted && fromUrl) return titleCaseProduct(fromUrl);
  if (cleanedRaw.length >= 3) return titleCaseProduct(cleanedRaw);
  if (fromUrl) return titleCaseProduct(fromUrl);
  return cleanedRaw || rawName.trim() || "Neznámy produkt";
}

export function cleanRawName(raw: string): string {
  let s = (raw ?? "").trim();
  s = s.replace(LEADING_INDEX, "");
  s = s.replace(PRICE_FRAGMENT, " ");
  s = s.replace(STUCK_PRICE_IN_WORD, "$1 ");
  s = s.replace(/\bs\s*DPH\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Drop trailing orphaned currency digits
  s = s.replace(/\s+\d{1,5}([.,]\d{1,2})?$/, "").trim();
  return s;
}

export function isCorruptedName(raw: string): boolean {
  if (!raw?.trim()) return true;
  if (/€/.test(raw)) return true;
  if (/\bs\s*DPH\b/i.test(raw)) return true;
  if (STUCK_PRICE_IN_WORD.test(raw)) return true;
  // Reset lastIndex after global test
  STUCK_PRICE_IN_WORD.lastIndex = 0;
  if (/^\d+[.)]\S/.test(raw.trim())) return true;
  // Letters immediately followed by price-like digits
  if (/[A-Za-zÀ-ž]\d{1,2}[.,]\d{2}/.test(raw)) return true;
  return false;
}

export function nameFromProductUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let slug = u.pathname.replace(/\/+$/, "").split("/").pop() || "";
    if (!slug) return null;
    // Drop trailing SKU-like numeric segment when present
    slug = slug.replace(/-\d{5,}$/i, "");
    const words = slug
      .split("-")
      .filter(Boolean)
      .filter((w) => !/^\d+$/.test(w) || w.length <= 4);
    if (words.length < 2) return null;
    return words.join(" ");
  } catch {
    return null;
  }
}

/** Light title-case preserving known brand/series tokens. */
export function titleCaseProduct(name: string): string {
  const keepUpper = new Set([
    "usb",
    "ip44",
    "ip55",
    "ip65",
    "ip67",
    "afdd",
    "rcd",
    "rcbo",
    "led",
    "tv",
    "sat",
    "cyky",
    "nky",
    "ayd",
  ]);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (keepUpper.has(lower)) return lower.toUpperCase();
      if (/^\d/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
