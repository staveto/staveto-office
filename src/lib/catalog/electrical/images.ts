import type { BucoRawProduct, ElectricalCatalogProduct } from "./types";

/** Known BUCO thumbnail pattern when scraper left obrazok_url empty. */
export function bucoThumbUrlFromSku(sku: string): string | null {
  const code = sku.trim();
  if (!code || !/^\d{3,}$/.test(code)) return null;
  return `https://www.buco.sk/assets/images/produkty/thumb/${code}.jpg`;
}

/** Prefer scraper image; fall back to SKU thumb URL. */
export function resolveBucoImageUrl(raw: Pick<BucoRawProduct, "obrazok_url" | "kod">): string | null {
  const direct = raw.obrazok_url?.trim();
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  return bucoThumbUrlFromSku(String(raw.kod ?? ""));
}

/**
 * Resolve display image for a catalog product.
 * Works for older Firestore docs that predate the imageUrl field.
 */
export function resolveCatalogProductImageUrl(
  product: Pick<ElectricalCatalogProduct, "imageUrl" | "supplierSku">
): string | null {
  const stored = product.imageUrl?.trim();
  if (stored && /^https?:\/\//i.test(stored)) return stored;
  return bucoThumbUrlFromSku(product.supplierSku ?? "");
}

/** Session cache of CDN URLs that 404 — avoids repeat requests while browsing. */
const failedImageUrls = new Set<string>();

export function markCatalogImageFailed(url: string): void {
  if (url) failedImageUrls.add(url);
}

export function isCatalogImageFailed(url: string): boolean {
  return failedImageUrls.has(url);
}
