/**
 * AI / catalog product price lookup — indicative until the user confirms.
 * Web prices come from Gemini Grounding with Google Search (official API),
 * not from site scraping.
 */

export type ProductPriceLookupSource =
  | "electrical_catalog"
  | "web_search_ai"
  | "not_found";

export type ProductPriceLookupResult = {
  found: boolean;
  source: ProductPriceLookupSource;
  productName: string;
  matchedName?: string;
  /** Net-ish unit price in major currency units (EUR). */
  unitPrice: number | null;
  currency: string;
  unit: string;
  /** Short explanation for the operator. */
  summary?: string;
  /** Supplier / shop name when known. */
  supplierName?: string;
  /** Grounding / catalog URLs the operator can verify. */
  sourceUrls: Array<{ title: string; url: string }>;
  /** Always true for web_search_ai — must confirm before apply. */
  indicative: boolean;
  confidence: "high" | "medium" | "low" | "none";
};

export type ProductPriceLookupRequest = {
  productName: string;
  brand?: string;
  sku?: string;
  countryCode?: string;
  currency?: string;
};

const PRICE_JSON_RE = /\{[\s\S]*\}/;

export function buildProductPriceLookupPrompt(input: ProductPriceLookupRequest): string {
  const country = input.countryCode?.trim() || "SK";
  const currency = input.currency?.trim() || "EUR";
  const brand = input.brand?.trim();
  const sku = input.sku?.trim();
  return [
    "You are helping a Slovak construction estimator find a realistic retail/wholesale unit price.",
    `Country: ${country}. Prefer prices in ${currency} without VAT (net) when clearly stated; otherwise say gross.`,
    "Use Google Search. Prefer electrical wholesalers / official distributors in SK/CZ/EU (e.g. BUČO, Rexel, local shops).",
    "Do NOT invent a price. If you cannot find a credible price, set found=false and unitPrice=null.",
    "Return ONLY a JSON object (no markdown) with this shape:",
    '{ "found": boolean, "matchedName": string|null, "unitPrice": number|null, "currency": "EUR", "unit": "ks", "priceKind": "net"|"gross"|"unknown", "supplierName": string|null, "summary": string, "confidence": "high"|"medium"|"low" }',
    "",
    `Product name: ${input.productName.trim()}`,
    brand ? `Brand: ${brand}` : null,
    sku ? `SKU / code: ${sku}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseProductPriceLookupText(
  text: string,
  productName: string,
  sourceUrls: Array<{ title: string; url: string }> = []
): ProductPriceLookupResult {
  const fallback: ProductPriceLookupResult = {
    found: false,
    source: "not_found",
    productName,
    unitPrice: null,
    currency: "EUR",
    unit: "ks",
    sourceUrls,
    indicative: true,
    confidence: "none",
    summary: text.slice(0, 280) || undefined,
  };

  const match = text.match(PRICE_JSON_RE);
  if (!match) return fallback;

  try {
    const parsed = JSON.parse(match[0]) as {
      found?: boolean;
      matchedName?: string | null;
      unitPrice?: number | null;
      currency?: string;
      unit?: string;
      summary?: string;
      supplierName?: string | null;
      confidence?: "high" | "medium" | "low";
    };
    const unitPrice =
      typeof parsed.unitPrice === "number" &&
      Number.isFinite(parsed.unitPrice) &&
      parsed.unitPrice > 0
        ? Math.round(parsed.unitPrice * 100) / 100
        : null;
    const found = parsed.found === true && unitPrice != null;
    return {
      found,
      source: found ? "web_search_ai" : "not_found",
      productName,
      matchedName: parsed.matchedName?.trim() || undefined,
      unitPrice,
      currency: parsed.currency?.trim() || "EUR",
      unit: parsed.unit?.trim() || "ks",
      summary: parsed.summary?.trim() || undefined,
      supplierName: parsed.supplierName?.trim() || undefined,
      sourceUrls,
      indicative: true,
      confidence: found ? parsed.confidence ?? "medium" : "none",
    };
  } catch {
    return fallback;
  }
}

export function extractGroundingUrls(data: unknown): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  try {
    const candidates = (data as {
      candidates?: Array<{
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>;
        };
      }>;
    }).candidates;
    const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      const url = chunk.web?.uri?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ title: chunk.web?.title?.trim() || url, url });
      if (out.length >= 6) break;
    }
  } catch {
    /* ignore malformed grounding payload */
  }
  return out;
}
