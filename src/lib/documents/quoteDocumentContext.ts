/**
 * Quote document language, supplier block, and document translator (not UI language).
 */
import { getFirestoreInstance, doc, getDoc } from "@/lib/firebase";
import {
  type OrganizationPrintInfo,
  type OrganizationProfile,
  parseOrganizationMarketFields,
} from "@/lib/organizationProfile";
import { mergeOrganizationIntoProfile } from "@/lib/companyProfileCompletion";
import type { Organization } from "@/lib/organizations";
import { resolveActiveMarketProfile } from "@/lib/market/resolveActiveMarketProfile";
import type {
  OrganizationMarketInput,
  ResolvedMarketProfile,
} from "@/lib/market/marketProfileContract";
import { resolveCountryConfig } from "@/lib/workspace/countryConfig";
import { translations, type Locale } from "@/i18n/translations";
import deTranslations from "@/i18n/de.json";
import { resolveQuoteLegalLabels, type QuoteLegalLabels } from "./quoteLegalLabels";

export type OrganizationQuoteDocumentContext = {
  organization: OrganizationPrintInfo;
  market: ResolvedMarketProfile;
  documentLanguage: string;
  documentLocaleTag: string;
  legalLabels: QuoteLegalLabels;
  currency: string;
  translateDocument: QuoteDocumentTranslateFn;
  warnings: string[];
};

export type QuoteDocumentTranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let result = text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? `{{${k}}}`));
  result = result.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  return result;
}

function mapDocumentLanguageToLocale(documentLanguage: string): Locale {
  const code = documentLanguage.trim().toLowerCase().slice(0, 2);
  if (code === "sk") return "sk";
  if (code === "de") return "de";
  if (code === "en") return "en";
  return "en";
}

export function createQuoteDocumentTranslator(
  documentLanguage: string
): QuoteDocumentTranslateFn {
  const locale = mapDocumentLanguageToLocale(documentLanguage);
  const deMap = deTranslations as Record<string, string>;

  return (key: string, params?: Record<string, string | number>) => {
    let text = translations[locale]?.[key];
    if (!text && locale === "de") text = deMap[key];
    if (!text) text = translations.en?.[key];
    if (!text) text = translations.sk?.[key];
    return interpolate(text ?? key, params);
  };
}

export function resolveQuoteDocumentLanguage(market: ResolvedMarketProfile): {
  language: string;
  warnings: string[];
} {
  const warnings = [...market.marketConfigWarnings];
  const explicit = market.activeDefaultDocumentLanguage?.trim();
  if (explicit) {
    return { language: explicit, warnings };
  }

  const fromCountry = resolveCountryConfig(market.activeCountryCode).defaultLanguage;
  if (fromCountry) {
    return { language: fromCountry, warnings };
  }

  warnings.push("document_language_fallback_en");
  return { language: "en", warnings };
}

export function resolveQuoteDocumentLocaleTag(
  documentLanguage: string,
  countryCode: string | null | undefined,
  orgLocale: string | null | undefined
): string {
  if (orgLocale?.trim()) return orgLocale.trim();

  const cc = countryCode?.trim().toUpperCase();
  const lang = documentLanguage.trim().toLowerCase().slice(0, 2);

  if (cc === "CH" && lang === "de") return "de-CH";
  if (cc === "SK" && lang === "sk") return "sk-SK";
  if (cc === "CZ" && (lang === "cs" || lang === "cz")) return "cs-CZ";
  if (cc === "AT" && lang === "de") return "de-AT";
  if (cc === "DE" && lang === "de") return "de-DE";
  if (lang === "en") return "en-GB";
  if (lang === "de") return "de-DE";
  if (lang === "sk") return "sk-SK";
  return "en-GB";
}

/** Supplier block from company profile + org root — template must not store these fields. */
export function buildQuoteSupplierFromOrganizationProfile(
  orgId: string,
  orgName: string,
  profile: OrganizationProfile | null,
  orgData?: Record<string, unknown>
): OrganizationPrintInfo {
  return {
    orgId,
    name: orgName.trim() || orgId,
    profile,
    market: orgData ? parseOrganizationMarketFields(orgData) : {
      countryCode: null,
      currency: null,
      timezone: null,
      locale: null,
      defaultLanguage: null,
      taxProfile: null,
      legalProfile: null,
      marketConfigVersion: null,
    },
  };
}

export function buildOrganizationQuoteDocumentContext(
  orgId: string,
  orgData: Record<string, unknown>
): OrganizationQuoteDocumentContext {
  const org = orgData as Organization & OrganizationMarketInput;
  const name = typeof org.name === "string" ? org.name.trim() || orgId : orgId;
  const profile = mergeOrganizationIntoProfile(orgData);
  const organization = buildQuoteSupplierFromOrganizationProfile(orgId, name, profile, orgData);

  const market = resolveActiveMarketProfile({
    activeWorkspaceType: "company",
    organizationProfile: orgData as OrganizationMarketInput,
  });

  const { language, warnings: langWarnings } = resolveQuoteDocumentLanguage(market);
  const legalLabels = resolveQuoteLegalLabels(
    market.activeCountryCode,
    market.activeLegalProfile,
    market.activeTaxProfile
  );
  const documentLocaleTag = resolveQuoteDocumentLocaleTag(
    language,
    market.activeCountryCode,
    market.activeLocale
  );

  return {
    organization,
    market,
    documentLanguage: language,
    documentLocaleTag,
    legalLabels,
    currency: market.activeCurrency,
    translateDocument: createQuoteDocumentTranslator(language),
    warnings: langWarnings,
  };
}

export async function loadOrganizationQuoteDocumentContext(
  orgId: string
): Promise<OrganizationQuoteDocumentContext | null> {
  if (!orgId?.trim()) return null;

  const db = getFirestoreInstance();
  if (!db) return null;

  try {
    const snap = await getDoc(doc(db, "organizations", orgId));
    if (!snap.exists()) return null;
    return buildOrganizationQuoteDocumentContext(orgId, snap.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function resolveCompanyQuoteMarket(
  organizationProfile: OrganizationMarketInput | null | undefined
): ResolvedMarketProfile {
  return resolveActiveMarketProfile({
    activeWorkspaceType: "company",
    organizationProfile,
  });
}
