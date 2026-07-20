/**
 * Normalization helpers for GTIN / brand / MPN / supplier SKU matching.
 */

/** Strip diacritics for search/match (Slovak). */
export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeBrand(brand: string | undefined | null): string | undefined {
  if (!brand?.trim()) return undefined;
  return stripDiacritics(brand).trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * MPN normalization: uppercase, strip spaces/dashes/dots that are separators,
 * keep alphanumeric significance. Tested so we don't over-strip.
 */
export function normalizeManufacturerPartNumber(
  mpn: string | undefined | null
): string | undefined {
  if (!mpn?.trim()) return undefined;
  return stripDiacritics(mpn)
    .trim()
    .toUpperCase()
    .replace(/[\s.\-_]/g, "");
}

/**
 * GTIN/EAN: digits only. Preserves leading zeros by keeping digit string.
 * Invalid (non-digit heavy) input returns undefined.
 */
export function normalizeGtin(gtin: string | undefined | null): string | undefined {
  if (!gtin?.trim()) return undefined;
  const digits = gtin.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return undefined;
  return digits;
}

export function normalizeSupplierSku(sku: string | undefined | null): string | undefined {
  if (!sku?.trim()) return undefined;
  // Align with MPN: drop common separators so "SKU-1" === "sku1".
  return stripDiacritics(sku)
    .trim()
    .toUpperCase()
    .replace(/[\s.\-_]/g, "");
}

export function normalizeSearchText(value: string): string {
  return stripDiacritics(value).toLowerCase().trim();
}
