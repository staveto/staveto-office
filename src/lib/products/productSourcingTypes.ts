/**
 * Product sourcing for AI Kalkulant — additive types.
 * Live supplier APIs / pricebooks plug in via connectors; no illegal scraping.
 */

export type ProductSourceType =
  | "supplier_api"
  | "uploaded_pricebook"
  | "manual_entry"
  | "web_search"
  | "company_catalog"
  | "ai_suggestion";

export type ProductPriceConfidence =
  | "confirmed"
  | "indicative"
  | "missing"
  | "needs_review";

export type ProductCategory =
  | "socket"
  | "switch"
  | "cable"
  | "conduit"
  | "installation_box"
  | "led_strip"
  | "led_profile"
  | "led_driver"
  | "light_fixture"
  | "distribution_board"
  | "breaker"
  | "terminal"
  | "mounting_material"
  | "other";

export type ProductCandidate = {
  id: string;
  sourceType: ProductSourceType;
  supplierName?: string;
  brand?: string;
  productName: string;
  productCode?: string;
  ean?: string;
  category: ProductCategory;
  description?: string;
  unit: "ks" | "m" | "bal" | "set" | "pausal" | "unknown";
  packageSize?: number;
  netUnitPrice?: number;
  grossUnitPrice?: number;
  currency: string;
  vatPercent?: number;
  availability?: "in_stock" | "limited" | "unknown" | "not_available";
  productUrl?: string;
  imageUrl?: string;
  priceValidAt?: string;
  confidence: ProductPriceConfidence;
  matchReason?: string;
  needsReview: boolean;
  priceTier?: "economy" | "standard" | "premium";
};

export type MaterialProductSelection = {
  takeoffItemId: string;
  requiredTitle: string;
  requiredQuantity: number;
  requiredUnit: string;
  preferredBrand?: string;
  selectedProduct?: ProductCandidate;
  alternatives: ProductCandidate[];
  quantityToBuy?: number;
  wastePercent?: number;
  totalMaterialCost?: number;
  totalMaterialSellPrice?: number;
  marginPercent?: number;
  priceStatus: ProductPriceConfidence;
  warnings: string[];
  customerSupplied?: boolean;
  excludedFromQuote?: boolean;
};

export type CompanyProductPreference = {
  trade: "electrical" | "plumbing" | "hvac" | "general";
  countryCode: string;
  preferredBrands: string[];
  preferredSuppliers: string[];
  defaultMaterialMarginPercent: number;
  allowIndicativePrices: boolean;
  priceTier: "economy" | "standard" | "premium";
  defaultWastePercent: number;
  /** Days after which a stored price becomes indicative. */
  priceMaxAgeDays: number;
};

export type ProductSearchIntent = {
  takeoffItemId: string;
  title: string;
  category: ProductCategory;
  quantity: number;
  unit: string;
  keywords: string[];
  companionIntents?: ProductSearchIntent[];
  needsReviewReasons: string[];
};

export type PurchaseListLine = {
  takeoffItemId: string;
  requiredTitle: string;
  productName: string;
  brand?: string;
  supplierName?: string;
  productCode?: string;
  ean?: string;
  quantityToBuy: number;
  unit: string;
  netUnitPrice?: number;
  totalNetCost?: number;
  currency: string;
  availability?: ProductCandidate["availability"];
  productUrl?: string;
  sourceType: ProductSourceType;
  priceValidAt?: string;
  confidence: ProductPriceConfidence;
  note?: string;
};

export const DEFAULT_COMPANY_PRODUCT_PREFERENCE: CompanyProductPreference = {
  trade: "electrical",
  countryCode: "SK",
  preferredBrands: ["ABB", "Schneider Electric", "Hager", "Legrand"],
  preferredSuppliers: ["Mock Elektro Veľkoobchod"],
  defaultMaterialMarginPercent: 25,
  allowIndicativePrices: true,
  priceTier: "standard",
  defaultWastePercent: 8,
  priceMaxAgeDays: 90,
};
