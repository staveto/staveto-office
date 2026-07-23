/**
 * Client: catalog-first price match, then AI web lookup (Gemini grounding).
 */

import { waitForAuthUser } from "@/lib/firebase";
import type {
  ProductPriceLookupRequest,
  ProductPriceLookupResult,
} from "@/lib/ai/productPriceLookup";
import { searchElectricalProducts } from "@/lib/catalog/electrical/searchSuggest";
import {
  loadElectricalCatalog,
  productUnitPriceEur,
} from "@/services/catalog/electricalCatalogReadService";

export async function findCatalogPriceForProduct(
  productName: string
): Promise<ProductPriceLookupResult | null> {
  const q = productName.trim();
  if (q.length < 2) return null;
  try {
    const { products } = await loadElectricalCatalog();
    const hits = searchElectricalProducts(products, q, { limit: 5 });
    const best = hits[0]?.product;
    if (!best) return null;
    const unitPrice = productUnitPriceEur(best);
    if (unitPrice <= 0) return null;
    const noteParts = [
      best.brand,
      best.supplierSku ? `kód ${best.supplierSku}` : null,
      best.supplier.supplierName,
    ].filter(Boolean);
    return {
      found: true,
      source: "electrical_catalog",
      productName: q,
      matchedName: best.name,
      unitPrice,
      currency: best.pricing.currency || "EUR",
      unit: best.unit || "ks",
      summary: noteParts.length ? noteParts.join(" · ") : "Firemný / dodávateľský katalóg",
      supplierName: best.supplier.supplierName,
      sourceUrls: best.supplier.sourceUrl
        ? [{ title: best.supplier.supplierName, url: best.supplier.sourceUrl }]
        : [],
      indicative: false,
      confidence: "high",
    };
  } catch {
    return null;
  }
}

export async function lookupProductPriceOnWeb(
  input: ProductPriceLookupRequest
): Promise<ProductPriceLookupResult> {
  const user = await waitForAuthUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  const token = await user.getIdToken();
  const res = await fetch("/api/ai/lookup-product-price", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      productName: input.productName,
      brand: input.brand,
      sku: input.sku,
      countryCode: input.countryCode ?? "SK",
      currency: input.currency ?? "EUR",
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (body.error === "GEMINI_NOT_CONFIGURED" || body.message?.includes("GEMINI_API_KEY")) {
      throw new Error("GEMINI_NOT_CONFIGURED");
    }
    throw new Error(body.message || body.error || `Price lookup failed (${res.status})`);
  }

  const data = (await res.json()) as { result: ProductPriceLookupResult };
  return data.result;
}

/**
 * Prefer local electrical catalog; fall back to AI web search.
 */
export async function lookupProductPrice(
  input: ProductPriceLookupRequest
): Promise<ProductPriceLookupResult> {
  const fromCatalog = await findCatalogPriceForProduct(input.productName);
  if (fromCatalog?.found) return fromCatalog;
  return lookupProductPriceOnWeb(input);
}
