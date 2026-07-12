/**
 * Parse supplier pricebook CSV (simple, no XLSX dependency required).
 * Columns: brand,productName,productCode,category,unit,netPrice,grossPrice,currency,vatPercent,validFrom,supplierName
 */

import type { ProductCandidate, ProductCategory } from "./productSourcingTypes";

const CATEGORIES = new Set<ProductCategory>([
  "socket",
  "switch",
  "cable",
  "conduit",
  "installation_box",
  "led_strip",
  "led_profile",
  "led_driver",
  "light_fixture",
  "distribution_board",
  "breaker",
  "terminal",
  "mounting_material",
  "other",
]);

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toCategory(raw: string): ProductCategory {
  const n = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (CATEGORIES.has(n as ProductCategory)) return n as ProductCategory;
  if (/zásuv|zasuv|socket|steck/i.test(raw)) return "socket";
  if (/vypína|vypina|switch|schalter/i.test(raw)) return "switch";
  if (/led.*pás|led.*pas|led.?strip/i.test(raw)) return "led_strip";
  if (/profil|lišta|lista/i.test(raw)) return "led_profile";
  if (/driver|zdroj/i.test(raw)) return "led_driver";
  if (/kábel|kabel|cyky|cable/i.test(raw)) return "cable";
  if (/krabica|box/i.test(raw)) return "installation_box";
  if (/rozvád|verteiler|distribution/i.test(raw)) return "distribution_board";
  return "other";
}

function toUnit(raw: string): ProductCandidate["unit"] {
  const n = raw.trim().toLowerCase();
  if (n === "ks" || n === "pcs" || n === "stk") return "ks";
  if (n === "m" || n === "bm") return "m";
  if (n === "bal" || n === "pack") return "bal";
  if (n === "set" || n === "sada") return "set";
  if (n === "pausal" || n === "paušál") return "pausal";
  return "unknown";
}

export type PricebookParseResult = {
  products: ProductCandidate[];
  errors: string[];
};

export function parseSupplierPricebookCsv(csvText: string): PricebookParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { products: [], errors: ["CSV je prázdny alebo chýba hlavička."] };
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const required = ["productname", "netprice"];
  const errors: string[] = [];
  for (const r of required) {
    if (idx(r) < 0 && idx(r.replace("productname", "product_name")) < 0) {
      // allow productName variants
    }
  }
  const nameIdx = Math.max(idx("productname"), idx("product_name"), idx("name"));
  const netIdx = Math.max(idx("netprice"), idx("net_price"), idx("price"));
  if (nameIdx < 0 || netIdx < 0) {
    return {
      products: [],
      errors: ["CSV musí obsahovať stĺpce productName a netPrice."],
    };
  }

  const products: ProductCandidate[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const productName = cols[nameIdx]?.trim();
    const net = Number(String(cols[netIdx] ?? "").replace(",", "."));
    if (!productName) {
      errors.push(`Riadok ${i + 1}: chýba productName`);
      continue;
    }
    if (!Number.isFinite(net) || net <= 0) {
      errors.push(`Riadok ${i + 1}: neplatná netPrice`);
      continue;
    }
    const brand = cols[idx("brand")]?.trim();
    const productCode = cols[Math.max(idx("productcode"), idx("product_code"), idx("sku"))]?.trim();
    const category = toCategory(cols[idx("category")] ?? "other");
    const unit = toUnit(cols[idx("unit")] ?? "ks");
    const currency = (cols[idx("currency")] ?? "EUR").trim() || "EUR";
    const vat = Number(cols[Math.max(idx("vatpercent"), idx("vat"))] ?? "20");
    const validFrom = cols[Math.max(idx("validfrom"), idx("valid_from"))]?.trim();
    const supplierName = cols[Math.max(idx("suppliername"), idx("supplier"))]?.trim();
    const gross = Number(String(cols[Math.max(idx("grossprice"), idx("gross"))] ?? "").replace(",", "."));

    products.push({
      id: `pb_${productCode || i}_${productName.slice(0, 12)}`,
      sourceType: "uploaded_pricebook",
      supplierName: supplierName || undefined,
      brand: brand || undefined,
      productName,
      productCode: productCode || undefined,
      category,
      unit,
      netUnitPrice: net,
      grossUnitPrice: Number.isFinite(gross) && gross > 0 ? gross : undefined,
      currency,
      vatPercent: Number.isFinite(vat) ? vat : 20,
      priceValidAt: validFrom || new Date().toISOString(),
      confidence: "confirmed",
      needsReview: false,
      matchReason: "Importovaný cenník",
    });
  }

  return { products, errors };
}
