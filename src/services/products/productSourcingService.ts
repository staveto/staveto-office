/**
 * Product sourcing service — match takeoff → candidates → selection → costs.
 */

import { createMockSupplierConnector } from "@/lib/products/connectors/mockSupplierConnector";
import {
  createCompanyCatalogConnector,
  createPricebookConnector,
} from "@/lib/products/connectors/pricebookConnector";
import { buildProductSearchIntents } from "@/lib/products/productMatching";
import { isProductSourcingEnabled } from "@/lib/products/productSourcingFeature";
import type {
  CompanyProductPreference,
  MaterialProductSelection,
  ProductCandidate,
  ProductPriceConfidence,
  ProductSearchIntent,
  PurchaseListLine,
} from "@/lib/products/productSourcingTypes";
import { DEFAULT_COMPANY_PRODUCT_PREFERENCE } from "@/lib/products/productSourcingTypes";
import {
  rankCandidates,
  type ProductSupplierConnector,
} from "@/lib/products/productSupplierConnector";

export type MatchProductsInput = {
  materials: Array<{ id: string; name: string; qty: number; unit: string; included?: boolean }>;
  preferences?: Partial<CompanyProductPreference>;
  pricebookProducts?: ProductCandidate[];
  companyCatalog?: ProductCandidate[];
  currency?: string;
  countryCode?: string;
};

export type MatchProductsResult = {
  selections: MaterialProductSelection[];
  missingTitles: string[];
  warnings: string[];
};

function ageIndicatesStale(iso: string | undefined, maxAgeDays: number): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  const ageMs = Date.now() - t;
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

function resolveConfidence(
  product: ProductCandidate | undefined,
  prefs: CompanyProductPreference
): ProductPriceConfidence {
  if (!product) return "missing";
  if (!(typeof product.netUnitPrice === "number" && product.netUnitPrice > 0)) {
    return product.sourceType === "ai_suggestion" ? "needs_review" : "missing";
  }
  if (product.sourceType === "ai_suggestion") return "needs_review";
  if (product.confidence === "confirmed" && !ageIndicatesStale(product.priceValidAt, prefs.priceMaxAgeDays)) {
    return "confirmed";
  }
  if (!prefs.allowIndicativePrices && product.confidence !== "confirmed") return "needs_review";
  return "indicative";
}

export function calculateProductCosts(params: {
  requiredQuantity: number;
  netUnitPrice: number;
  wastePercent: number;
  marginPercent: number;
}): {
  quantityToBuy: number;
  totalMaterialCost: number;
  totalMaterialSellPrice: number;
} {
  const qty = Math.max(0, params.requiredQuantity);
  const waste = Math.max(0, params.wastePercent) / 100;
  const quantityToBuy = Math.round(qty * (1 + waste) * 1000) / 1000;
  const totalMaterialCost = Math.round(quantityToBuy * params.netUnitPrice * 100) / 100;
  const totalMaterialSellPrice =
    Math.round(totalMaterialCost * (1 + Math.max(0, params.marginPercent) / 100) * 100) / 100;
  return { quantityToBuy, totalMaterialCost, totalMaterialSellPrice };
}

function buildConnectors(input: MatchProductsInput): ProductSupplierConnector[] {
  const connectors: ProductSupplierConnector[] = [];
  if (input.pricebookProducts?.length) {
    connectors.push(createPricebookConnector(input.pricebookProducts));
  }
  if (input.companyCatalog?.length) {
    connectors.push(createCompanyCatalogConnector(input.companyCatalog));
  }
  // Mock supplier last among automated sources — still before pure AI guesses.
  connectors.push(createMockSupplierConnector());
  return connectors;
}

async function searchAcross(
  connectors: ProductSupplierConnector[],
  intent: ProductSearchIntent,
  prefs: CompanyProductPreference
): Promise<ProductCandidate[]> {
  const all: ProductCandidate[] = [];
  for (const c of connectors) {
    if (!c.supportsSearch) continue;
    if (
      prefs.countryCode &&
      c.countryCodes.length > 0 &&
      !c.countryCodes.map((x) => x.toUpperCase()).includes(prefs.countryCode.toUpperCase())
    ) {
      // still allow mock/global
      if (c.id !== "mock_elektro" && c.id !== "uploaded_pricebook" && c.id !== "company_catalog") {
        continue;
      }
    }
    try {
      const found = await c.searchProducts(intent);
      all.push(...found);
    } catch {
      // connector failure must not break the flow
    }
  }
  return rankCandidates(all, prefs.preferredBrands, prefs.preferredSuppliers, prefs.priceTier);
}

function selectionFromIntent(
  intent: ProductSearchIntent,
  ranked: ProductCandidate[],
  prefs: CompanyProductPreference
): MaterialProductSelection {
  const preferredBrand = prefs.preferredBrands[0];
  const selected =
    ranked.find((r) => r.priceTier === prefs.priceTier) ??
    ranked.find((r) => typeof r.netUnitPrice === "number" && r.netUnitPrice > 0) ??
    ranked[0];

  const priceStatus = resolveConfidence(selected, prefs);
  const warnings = [...intent.needsReviewReasons];
  if (priceStatus === "missing") {
    warnings.push("Cena chýba — vyberte produkt, zadajte cenu ručne alebo označte dodávku zákazníka.");
  } else if (priceStatus === "indicative") {
    warnings.push("Orientačná cena — overte u dodávateľa pred pevnou ponukou.");
  }

  let quantityToBuy: number | undefined;
  let totalMaterialCost: number | undefined;
  let totalMaterialSellPrice: number | undefined;
  if (selected && typeof selected.netUnitPrice === "number" && selected.netUnitPrice > 0 && intent.quantity > 0) {
    const calc = calculateProductCosts({
      requiredQuantity: intent.quantity,
      netUnitPrice: selected.netUnitPrice,
      wastePercent: prefs.defaultWastePercent,
      marginPercent: prefs.defaultMaterialMarginPercent,
    });
    quantityToBuy = calc.quantityToBuy;
    totalMaterialCost = calc.totalMaterialCost;
    totalMaterialSellPrice = calc.totalMaterialSellPrice;
  }

  // Tier alternatives: economy / standard / premium picks
  const byTier = ["economy", "standard", "premium"] as const;
  const alternatives: ProductCandidate[] = [];
  for (const tier of byTier) {
    const hit = ranked.find((r) => r.priceTier === tier && r.id !== selected?.id);
    if (hit) alternatives.push(hit);
  }
  for (const r of ranked) {
    if (alternatives.length >= 5) break;
    if (r.id === selected?.id) continue;
    if (!alternatives.some((a) => a.id === r.id)) alternatives.push(r);
  }

  return {
    takeoffItemId: intent.takeoffItemId,
    requiredTitle: intent.title,
    requiredQuantity: intent.quantity,
    requiredUnit: intent.unit,
    preferredBrand,
    selectedProduct: selected,
    alternatives,
    quantityToBuy,
    wastePercent: prefs.defaultWastePercent,
    totalMaterialCost,
    totalMaterialSellPrice,
    marginPercent: prefs.defaultMaterialMarginPercent,
    priceStatus,
    warnings,
  };
}

export async function matchProductsForTakeoffItems(
  input: MatchProductsInput
): Promise<MatchProductsResult> {
  if (!isProductSourcingEnabled()) {
    return { selections: [], missingTitles: [], warnings: ["Product sourcing je vypnutý (feature flag)."] };
  }

  const prefs: CompanyProductPreference = {
    ...DEFAULT_COMPANY_PRODUCT_PREFERENCE,
    ...input.preferences,
    countryCode: input.countryCode ?? input.preferences?.countryCode ?? "SK",
  };

  const intents = buildProductSearchIntents(input.materials);
  const connectors = buildConnectors(input);
  const selections: MaterialProductSelection[] = [];
  const missingTitles: string[] = [];
  const warnings: string[] = [];

  if (!prefs.preferredBrands.length) {
    warnings.push("Nastavte preferované značky a dodávateľov pre presnejšie ceny.");
  }

  for (const intent of intents) {
    const ranked = await searchAcross(connectors, intent, prefs);
    const sel = selectionFromIntent(intent, ranked, prefs);
    selections.push(sel);
    if (sel.priceStatus === "missing") missingTitles.push(sel.requiredTitle);

    for (const companion of intent.companionIntents ?? []) {
      const cRanked = await searchAcross(connectors, companion, prefs);
      const cSel = selectionFromIntent(companion, cRanked, prefs);
      selections.push(cSel);
      if (cSel.priceStatus === "missing") missingTitles.push(cSel.requiredTitle);
    }
  }

  return { selections, missingTitles, warnings };
}

export function applyProductSelectionToMaterialPrice(
  selection: MaterialProductSelection
): { unitSellPrice: number; priceStatus: ProductPriceConfidence } | null {
  if (selection.customerSupplied || selection.excludedFromQuote) {
    return { unitSellPrice: 0, priceStatus: "confirmed" };
  }
  if (
    !selection.selectedProduct ||
    !(typeof selection.selectedProduct.netUnitPrice === "number") ||
    selection.selectedProduct.netUnitPrice <= 0
  ) {
    return null;
  }
  const margin = selection.marginPercent ?? 0;
  const waste = (selection.wastePercent ?? 0) / 100;
  // Sell unit price includes waste amortized into unit for quote line qty = required qty
  const net = selection.selectedProduct.netUnitPrice * (1 + waste);
  const unitSellPrice = Math.round(net * (1 + margin / 100) * 100) / 100;
  return { unitSellPrice, priceStatus: selection.priceStatus };
}

export function applyProductSelectionToQuote(
  materials: Array<{ id: string; price: number; qty: number }>,
  selections: MaterialProductSelection[]
): Array<{ id: string; price: number }> {
  const byId = new Map(selections.map((s) => [s.takeoffItemId, s]));
  return materials.map((m) => {
    const sel = byId.get(m.id);
    if (!sel) return { id: m.id, price: m.price };
    if (sel.customerSupplied || sel.excludedFromQuote) return { id: m.id, price: 0 };
    const applied = applyProductSelectionToMaterialPrice(sel);
    if (!applied || applied.unitSellPrice <= 0) return { id: m.id, price: m.price };
    return { id: m.id, price: applied.unitSellPrice };
  });
}

export function buildInternalPurchaseList(
  selections: MaterialProductSelection[]
): PurchaseListLine[] {
  const lines: PurchaseListLine[] = [];
  for (const s of selections) {
    if (s.customerSupplied || s.excludedFromQuote) continue;
    const p = s.selectedProduct;
    if (!p) continue;
    lines.push({
      takeoffItemId: s.takeoffItemId,
      requiredTitle: s.requiredTitle,
      productName: p.productName,
      brand: p.brand,
      supplierName: p.supplierName,
      productCode: p.productCode,
      ean: p.ean,
      quantityToBuy: s.quantityToBuy ?? s.requiredQuantity,
      unit: p.unit === "unknown" ? s.requiredUnit : p.unit,
      netUnitPrice: p.netUnitPrice,
      totalNetCost: s.totalMaterialCost,
      currency: p.currency,
      availability: p.availability,
      productUrl: p.productUrl,
      sourceType: p.sourceType,
      priceValidAt: p.priceValidAt,
      confidence: s.priceStatus,
      note: s.warnings[0],
    });
  }
  return lines;
}

export function validateProductPricingReady(selections: MaterialProductSelection[]): {
  ok: boolean;
  missing: string[];
  indicative: string[];
} {
  const missing: string[] = [];
  const indicative: string[] = [];
  for (const s of selections) {
    if (s.customerSupplied || s.excludedFromQuote) continue;
    if (s.priceStatus === "missing" || s.priceStatus === "needs_review") {
      if (
        !s.selectedProduct ||
        !(typeof s.selectedProduct.netUnitPrice === "number") ||
        s.selectedProduct.netUnitPrice <= 0
      ) {
        missing.push(s.requiredTitle);
      } else if (s.priceStatus === "needs_review") {
        indicative.push(s.requiredTitle);
      }
    } else if (s.priceStatus === "indicative") {
      indicative.push(s.requiredTitle);
    }
  }
  return { ok: missing.length === 0, missing, indicative };
}

export function pickTierAlternatives(selection: MaterialProductSelection): {
  economy?: ProductCandidate;
  standard?: ProductCandidate;
  premium?: ProductCandidate;
} {
  const pool = [
    ...(selection.selectedProduct ? [selection.selectedProduct] : []),
    ...selection.alternatives,
  ];
  return {
    economy: pool.find((p) => p.priceTier === "economy"),
    standard: pool.find((p) => p.priceTier === "standard"),
    premium: pool.find((p) => p.priceTier === "premium"),
  };
}

/** Recalculate costs / confidence after the user picks or edits a product. */
export function updateSelectionWithProduct(
  selection: MaterialProductSelection,
  product: ProductCandidate,
  prefs: Partial<CompanyProductPreference> = {}
): MaterialProductSelection {
  const full: CompanyProductPreference = {
    ...DEFAULT_COMPANY_PRODUCT_PREFERENCE,
    ...prefs,
  };
  const priceStatus = resolveConfidence(product, full);
  const warnings = [...selection.warnings.filter((w) => !/Cena chýba|Orientačná cena/i.test(w))];
  if (priceStatus === "missing") {
    warnings.push("Cena chýba — vyberte produkt, zadajte cenu ručne alebo označte dodávku zákazníka.");
  } else if (priceStatus === "indicative") {
    warnings.push("Orientačná cena — overte u dodávateľa pred pevnou ponukou.");
  }
  let quantityToBuy: number | undefined;
  let totalMaterialCost: number | undefined;
  let totalMaterialSellPrice: number | undefined;
  if (typeof product.netUnitPrice === "number" && product.netUnitPrice > 0 && selection.requiredQuantity > 0) {
    const calc = calculateProductCosts({
      requiredQuantity: selection.requiredQuantity,
      netUnitPrice: product.netUnitPrice,
      wastePercent: selection.wastePercent ?? full.defaultWastePercent,
      marginPercent: selection.marginPercent ?? full.defaultMaterialMarginPercent,
    });
    quantityToBuy = calc.quantityToBuy;
    totalMaterialCost = calc.totalMaterialCost;
    totalMaterialSellPrice = calc.totalMaterialSellPrice;
  }
  return {
    ...selection,
    selectedProduct: product,
    customerSupplied: false,
    excludedFromQuote: false,
    quantityToBuy,
    totalMaterialCost,
    totalMaterialSellPrice,
    priceStatus,
    warnings,
  };
}

export function markSelectionCustomerSupplied(
  selection: MaterialProductSelection
): MaterialProductSelection {
  return {
    ...selection,
    customerSupplied: true,
    excludedFromQuote: false,
    totalMaterialCost: 0,
    totalMaterialSellPrice: 0,
    priceStatus: "confirmed",
    warnings: ["Dodávka zákazníka — vylúčené z materiálovej ceny."],
  };
}

export function markSelectionExcluded(
  selection: MaterialProductSelection
): MaterialProductSelection {
  return {
    ...selection,
    excludedFromQuote: true,
    customerSupplied: false,
    totalMaterialCost: 0,
    totalMaterialSellPrice: 0,
    priceStatus: "confirmed",
    warnings: ["Vylúčené z ponuky."],
  };
}

export function sumSelectionSellPrices(selections: MaterialProductSelection[]): number {
  return Math.round(
    selections
      .filter((s) => !s.customerSupplied && !s.excludedFromQuote)
      .reduce((acc, s) => acc + (s.totalMaterialSellPrice ?? 0), 0) * 100
  ) / 100;
}

export async function searchProductCandidates(
  intent: ProductSearchIntent,
  preferences?: Partial<CompanyProductPreference>,
  pricebookProducts?: ProductCandidate[]
): Promise<ProductCandidate[]> {
  const prefs = { ...DEFAULT_COMPANY_PRODUCT_PREFERENCE, ...preferences };
  const connectors = buildConnectors({
    materials: [],
    preferences: prefs,
    pricebookProducts,
  });
  return searchAcross(connectors, intent, prefs);
}
