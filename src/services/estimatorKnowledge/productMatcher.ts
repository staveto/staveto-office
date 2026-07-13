/**
 * Product matcher — assemblies → product search intents → pricebook/catalog
 * matches, with company estimator settings influencing brands/margins/tier.
 */

import {
  intentsFromAssembly,
  type AssemblyInstance,
} from "@/lib/ai/mapSymbolsToAssemblies";
import type {
  CompanyProductPreference,
  MaterialProductSelection,
  ProductCandidate,
  ProductSearchIntent,
} from "@/lib/products/productSourcingTypes";
import { DEFAULT_COMPANY_PRODUCT_PREFERENCE } from "@/lib/products/productSourcingTypes";
import { searchProductCandidates } from "@/services/products/productSourcingService";
import type { CompanyEstimatorSettings, KnowledgeContext } from "@/types/estimatorKnowledge";
import { getCompanyEstimatorSettings } from "./knowledgeRepository";

/** Company estimator settings → product sourcing preference. */
export function toProductPreference(
  settings: CompanyEstimatorSettings,
  ctx: KnowledgeContext
): CompanyProductPreference {
  return {
    ...DEFAULT_COMPANY_PRODUCT_PREFERENCE,
    trade: ctx.trade,
    countryCode: ctx.countryCode,
    preferredBrands: settings.preferredBrands.length
      ? settings.preferredBrands
      : DEFAULT_COMPANY_PRODUCT_PREFERENCE.preferredBrands,
    preferredSuppliers: settings.preferredSuppliers.length
      ? settings.preferredSuppliers
      : DEFAULT_COMPANY_PRODUCT_PREFERENCE.preferredSuppliers,
    defaultMaterialMarginPercent: settings.defaultMaterialMarginPercent,
    allowIndicativePrices: settings.allowIndicativePrices,
    priceTier: settings.priceTier,
  };
}

/** Intents for all product-required materials across assemblies. */
export function createProductSearchIntents(
  assemblyItems: AssemblyInstance[],
  companyPreferences?: Pick<CompanyProductPreference, "preferredBrands">
): ProductSearchIntent[] {
  const preferredBrand = companyPreferences?.preferredBrands?.[0];
  return assemblyItems.flatMap((a) => intentsFromAssembly(a, preferredBrand));
}

export type AssemblyProductMatch = {
  intent: ProductSearchIntent;
  candidates: ProductCandidate[];
  best?: ProductCandidate;
  priceStatus: MaterialProductSelection["priceStatus"];
};

/**
 * Match intents against pricebook / company catalog / mock supplier.
 * Never invents a price — missing stays "missing".
 */
export async function matchProductsFromPricebookOrCatalog(
  intents: ProductSearchIntent[],
  ctx: KnowledgeContext,
  options?: {
    pricebookProducts?: ProductCandidate[];
    settings?: CompanyEstimatorSettings;
  }
): Promise<AssemblyProductMatch[]> {
  const settings =
    options?.settings ??
    (ctx.orgId
      ? await getCompanyEstimatorSettings(ctx.orgId)
      : {
          preferredBrands: [],
          preferredSuppliers: [],
          defaultMaterialMarginPercent: 25,
          defaultLaborRate: 28,
          defaultRiskReservePercent: 5,
          allowIndicativePrices: true,
          priceTier: "standard" as const,
        });
  const prefs = toProductPreference(settings, ctx);

  const out: AssemblyProductMatch[] = [];
  for (const intent of intents) {
    const candidates = await searchProductCandidates(
      intent,
      prefs,
      options?.pricebookProducts
    );
    const best =
      candidates.find((c) => c.priceTier === prefs.priceTier) ??
      candidates.find((c) => typeof c.netUnitPrice === "number" && c.netUnitPrice > 0) ??
      candidates[0];
    const hasPrice = typeof best?.netUnitPrice === "number" && best.netUnitPrice > 0;
    const priceStatus: AssemblyProductMatch["priceStatus"] =
      intent.needsReviewReasons.length > 0
        ? "needs_review"
        : !best || !hasPrice
          ? "missing"
          : best.confidence === "confirmed"
            ? "confirmed"
            : "indicative";
    out.push({ intent, candidates, best, priceStatus });
  }
  return out;
}
