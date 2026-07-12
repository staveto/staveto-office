import { beforeEach, describe, expect, it } from "vitest";
import { rankCandidates } from "@/lib/products/productSupplierConnector";
import { buildProductSearchIntents } from "@/lib/products/productMatching";
import { parseSupplierPricebookCsv } from "@/lib/products/pricebookCsv";
import type { MaterialProductSelection, ProductCandidate } from "@/lib/products/productSourcingTypes";
import { composeElectricalCustomerQuote } from "@/lib/ai/composeElectricalCustomerQuote";
import type { InternalTakeoffRow } from "@/lib/ai/electricalQuoteTypes";
import {
  applyProductSelectionToQuote,
  buildInternalPurchaseList,
  calculateProductCosts,
  markSelectionCustomerSupplied,
  sumSelectionSellPrices,
  updateSelectionWithProduct,
  validateProductPricingReady,
} from "@/services/products/productSourcingService";

beforeEach(() => {
  process.env.NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING = "1";
});

function candidate(partial: Partial<ProductCandidate> & Pick<ProductCandidate, "id" | "productName">): ProductCandidate {
  return {
    sourceType: "uploaded_pricebook",
    category: "socket",
    unit: "ks",
    currency: "EUR",
    confidence: "confirmed",
    needsReview: false,
    priceValidAt: new Date().toISOString(),
    netUnitPrice: 5,
    ...partial,
  };
}

function selection(partial: Partial<MaterialProductSelection> & Pick<MaterialProductSelection, "takeoffItemId" | "requiredTitle">): MaterialProductSelection {
  return {
    requiredQuantity: 4,
    requiredUnit: "ks",
    alternatives: [],
    priceStatus: "missing",
    warnings: [],
    ...partial,
  };
}

describe("product sourcing — zero price guard", () => {
  it("material line with 0 price creates missing warning via validateProductPricingReady", () => {
    const sel = selection({
      takeoffItemId: "m1",
      requiredTitle: "Zásuvka",
      selectedProduct: candidate({
        id: "p0",
        productName: "Zásuvka bez ceny",
        netUnitPrice: 0,
        confidence: "missing",
      }),
      priceStatus: "missing",
      warnings: ["Cena chýba"],
    });
    const ready = validateProductPricingReady([sel]);
    expect(ready.ok).toBe(false);
    expect(ready.missing).toContain("Zásuvka");
  });
});

describe("product sourcing — cost math", () => {
  it("selected product updates material cost and margin is applied correctly", () => {
    const calc = calculateProductCosts({
      requiredQuantity: 10,
      netUnitPrice: 4,
      wastePercent: 10,
      marginPercent: 25,
    });
    // qtyToBuy = 11, cost = 44, sell = 55
    expect(calc.quantityToBuy).toBe(11);
    expect(calc.totalMaterialCost).toBe(44);
    expect(calc.totalMaterialSellPrice).toBe(55);

    const base = selection({
      takeoffItemId: "m1",
      requiredTitle: "Zásuvka",
      requiredQuantity: 10,
    });
    const updated = updateSelectionWithProduct(
      base,
      candidate({ id: "abb", productName: "ABB zásuvka", brand: "ABB", netUnitPrice: 4 }),
      { defaultWastePercent: 10, defaultMaterialMarginPercent: 25 }
    );
    expect(updated.totalMaterialCost).toBe(44);
    expect(updated.totalMaterialSellPrice).toBe(55);

    const prices = applyProductSelectionToQuote([{ id: "m1", price: 0, qty: 10 }], [updated]);
    expect(prices[0]!.price).toBeGreaterThan(0);
  });
});

describe("product sourcing — brand ranking", () => {
  it("preferred brand influences ranking", () => {
    const ranked = rankCandidates(
      [
        candidate({
          id: "se",
          productName: "Schneider",
          brand: "Schneider Electric",
          netUnitPrice: 6,
        }),
        candidate({ id: "abb", productName: "ABB", brand: "ABB", netUnitPrice: 5 }),
      ],
      ["ABB"],
      [],
      "standard"
    );
    expect(ranked[0]!.brand).toBe("ABB");
  });
});

describe("product sourcing — needsReview specs", () => {
  it("missing product specs create needsReview on LED intents", () => {
    const intents = buildProductSearchIntents([
      { id: "led1", name: "LED pás v SDK", qty: 12.8, unit: "m", included: true },
    ]);
    expect(intents[0]!.needsReviewReasons.some((r) => /CCT|napätie|IP/i.test(r))).toBe(true);
    expect(intents[0]!.companionIntents?.length).toBeGreaterThan(0);
  });
});

describe("product sourcing — customer supplied", () => {
  it("customer-supplied material is excluded from material price", () => {
    const withPrice = updateSelectionWithProduct(
      selection({ takeoffItemId: "m1", requiredTitle: "Zásuvka", requiredQuantity: 4 }),
      candidate({ id: "p1", productName: "ABB", netUnitPrice: 5 })
    );
    const marked = markSelectionCustomerSupplied(withPrice);
    expect(marked.totalMaterialSellPrice).toBe(0);
    expect(sumSelectionSellPrices([marked])).toBe(0);
    const prices = applyProductSelectionToQuote([{ id: "m1", price: 99, qty: 4 }], [marked]);
    expect(prices[0]!.price).toBe(0);
  });
});

describe("product sourcing — purchase list", () => {
  it("internal purchase list includes product code and source", () => {
    const sel = updateSelectionWithProduct(
      selection({ takeoffItemId: "m1", requiredTitle: "Zásuvka", requiredQuantity: 2 }),
      candidate({
        id: "p1",
        productName: "ABB zásuvka",
        brand: "ABB",
        productCode: "ABB-ZAS",
        sourceType: "uploaded_pricebook",
        supplierName: "Firma cenník",
        netUnitPrice: 4.5,
      })
    );
    const list = buildInternalPurchaseList([sel]);
    expect(list).toHaveLength(1);
    expect(list[0]!.productCode).toBe("ABB-ZAS");
    expect(list[0]!.sourceType).toBe("uploaded_pricebook");
  });
});

describe("product sourcing — customer quote hygiene", () => {
  it("customer quote package does not expose internal product metadata by default", () => {
    const takeoff: InternalTakeoffRow[] = [
      {
        id: "1",
        title: "Zásuvka",
        category: "socket",
        unit: "ks",
        quantity: 4,
        source: "symbol_occurrence",
        confidence: "high",
        needsReview: false,
        included: true,
      },
    ];
    const quote = composeElectricalCustomerQuote({
      takeoff,
      language: "sk",
      projectName: "Test",
      materialPricesKnown: true,
    });
    const blob = JSON.stringify(quote);
    expect(blob).not.toMatch(/uploaded_pricebook|productUrl|priceValidAt|confidence=|sourceType/);
    expect(quote.sections.length).toBeGreaterThan(0);
  });
});

describe("pricebook CSV", () => {
  it("parses supplier pricebook rows", () => {
    const csv = [
      "brand,productName,productCode,category,unit,netPrice,grossPrice,currency,vatPercent,validFrom,supplierName",
      "ABB,Zásuvka 230V,ABB-1,socket,ks,4.5,5.4,EUR,20,2026-01-01,Elektro SK",
    ].join("\n");
    const parsed = parseSupplierPricebookCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.products[0]!.brand).toBe("ABB");
    expect(parsed.products[0]!.netUnitPrice).toBe(4.5);
    expect(parsed.products[0]!.sourceType).toBe("uploaded_pricebook");
  });
});
