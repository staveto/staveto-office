import {
  DEFAULT_MARKET_CONFIG_VERSION,
  type LegalProfile,
  type OrganizationMarketInput,
  type OrganizationMarketProfile,
  type SupportedCountryCode,
  type TaxProfile,
} from "./marketProfileContract";
import { getCountryDisplayName, isSupportedCountryCode, resolveSupportedCountryCode } from "./countryOptions";

export type CompanyMarketConfig = {
  countryCode: SupportedCountryCode;
  currency: string;
  timezone: string;
  locale: string;
  defaultLanguage: string;
  taxProfile: TaxProfile;
  legalProfile: LegalProfile;
  marketConfigVersion: number;
};

export type OrganizationMarketPreview = {
  countryCode: string | null;
  countryDisplayName: string;
  currency: string;
  timezone: string;
  locale: string;
  defaultLanguage: string;
  registrationNumberLabel: string;
  taxIdLabel: string;
  vatIdLabel: string;
  vatLabel: string;
  marketConfigVersion: number;
  complianceStatus: "needs_legal_review";
  usingCountryDefaults: boolean;
  missingCountry: boolean;
  requiredLegalFields: string[];
  optionalLegalFields: string[];
};

const MARKET_CONFIGS: Record<SupportedCountryCode, CompanyMarketConfig> = {
  SK: {
    countryCode: "SK",
    currency: "EUR",
    timezone: "Europe/Bratislava",
    locale: "sk-SK",
    defaultLanguage: "sk",
    taxProfile: {
      countryCode: "SK",
      taxLabel: "DIČ",
      vatLabel: "DPH",
      vatMode: "auto",
      complianceStatus: "needs_legal_review",
    },
    legalProfile: {
      countryCode: "SK",
      companyRegistrationNumberLabel: "IČO",
      taxIdLabel: "DIČ",
      vatIdLabel: "IČ DPH",
      requiredFields: ["registrationNumber"],
      optionalFields: ["taxId", "vatId"],
      complianceStatus: "needs_legal_review",
    },
    marketConfigVersion: DEFAULT_MARKET_CONFIG_VERSION,
  },
  CZ: {
    countryCode: "CZ",
    currency: "CZK",
    timezone: "Europe/Prague",
    locale: "cs-CZ",
    defaultLanguage: "cs",
    taxProfile: {
      countryCode: "CZ",
      taxLabel: "DIČ",
      vatLabel: "DPH",
      vatMode: "auto",
      complianceStatus: "needs_legal_review",
    },
    legalProfile: {
      countryCode: "CZ",
      companyRegistrationNumberLabel: "IČO",
      taxIdLabel: "DIČ",
      vatIdLabel: "DIČ / VAT ID",
      requiredFields: ["registrationNumber"],
      optionalFields: ["taxId", "vatId"],
      complianceStatus: "needs_legal_review",
    },
    marketConfigVersion: DEFAULT_MARKET_CONFIG_VERSION,
  },
  DE: {
    countryCode: "DE",
    currency: "EUR",
    timezone: "Europe/Berlin",
    locale: "de-DE",
    defaultLanguage: "de",
    taxProfile: {
      countryCode: "DE",
      taxLabel: "Steuernummer",
      vatLabel: "MwSt.",
      vatMode: "auto",
      complianceStatus: "needs_legal_review",
    },
    legalProfile: {
      countryCode: "DE",
      companyRegistrationNumberLabel: "Handelsregisternummer",
      taxIdLabel: "Steuernummer",
      vatIdLabel: "USt-IdNr.",
      requiredFields: ["registrationNumber"],
      optionalFields: ["taxId", "vatId"],
      complianceStatus: "needs_legal_review",
    },
    marketConfigVersion: DEFAULT_MARKET_CONFIG_VERSION,
  },
  AT: {
    countryCode: "AT",
    currency: "EUR",
    timezone: "Europe/Vienna",
    locale: "de-AT",
    defaultLanguage: "de",
    taxProfile: {
      countryCode: "AT",
      taxLabel: "Steuernummer",
      vatLabel: "USt.",
      vatMode: "auto",
      complianceStatus: "needs_legal_review",
    },
    legalProfile: {
      countryCode: "AT",
      companyRegistrationNumberLabel: "Firmenbuchnummer",
      taxIdLabel: "Steuernummer",
      vatIdLabel: "UID-Nummer",
      requiredFields: ["registrationNumber"],
      optionalFields: ["taxId", "vatId"],
      complianceStatus: "needs_legal_review",
    },
    marketConfigVersion: DEFAULT_MARKET_CONFIG_VERSION,
  },
  CH: {
    countryCode: "CH",
    currency: "CHF",
    timezone: "Europe/Zurich",
    locale: "de-CH",
    defaultLanguage: "de",
    taxProfile: {
      countryCode: "CH",
      taxLabel: "Unternehmens-ID",
      vatLabel: "MWST",
      vatMode: "auto",
      complianceStatus: "needs_legal_review",
    },
    legalProfile: {
      countryCode: "CH",
      companyRegistrationNumberLabel: "UID",
      taxIdLabel: "Unternehmens-ID",
      vatIdLabel: "MWST-Nr.",
      requiredFields: ["registrationNumber"],
      optionalFields: ["taxId", "vatId"],
      complianceStatus: "needs_legal_review",
    },
    marketConfigVersion: DEFAULT_MARKET_CONFIG_VERSION,
  },
};

export function getCompanyMarketConfig(
  countryCode: string | null | undefined
): CompanyMarketConfig | null {
  const resolved = resolveSupportedCountryCode(countryCode);
  if (!resolved) return null;
  return MARKET_CONFIGS[resolved];
}

export function buildOrganizationMarketFields(
  countryCode: string | null | undefined
): OrganizationMarketProfile | null {
  const config = getCompanyMarketConfig(countryCode);
  if (!config) return null;

  return {
    countryCode: config.countryCode,
    currency: config.currency,
    timezone: config.timezone,
    locale: config.locale,
    defaultLanguage: config.defaultLanguage,
    taxProfile: { ...config.taxProfile },
    legalProfile: { ...config.legalProfile },
    marketConfigVersion: config.marketConfigVersion,
  };
}

export function getComplianceStatusLabel(): "needs_legal_review" {
  return "needs_legal_review";
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveOrganizationMarketPreview(
  org: OrganizationMarketInput | null | undefined,
  selectedCountryCode: string | null | undefined,
  uiLocale: "sk" | "en" | "de" = "en"
): OrganizationMarketPreview {
  const resolvedSelected = resolveSupportedCountryCode(
    selectedCountryCode,
    org?.profile?.country ?? org?.country
  );

  if (!resolvedSelected) {
    return {
      countryCode: null,
      countryDisplayName: "—",
      currency: "—",
      timezone: "—",
      locale: "—",
      defaultLanguage: "—",
      registrationNumberLabel: "—",
      taxIdLabel: "—",
      vatIdLabel: "—",
      vatLabel: "—",
      marketConfigVersion: DEFAULT_MARKET_CONFIG_VERSION,
      complianceStatus: "needs_legal_review",
      usingCountryDefaults: true,
      missingCountry: true,
      requiredLegalFields: [],
      optionalLegalFields: [],
    };
  }

  const defaults = getCompanyMarketConfig(resolvedSelected)!;
  const orgCountry = resolveSupportedCountryCode(org?.countryCode, org?.profile?.country);
  const sameCountry = orgCountry === resolvedSelected;

  const usingCountryDefaults =
    !sameCountry ||
    !pickString(org?.currency) ||
    !pickString(org?.defaultLanguage) ||
    !org?.taxProfile ||
    !org?.legalProfile;

  const taxProfile = sameCountry && org?.taxProfile ? org.taxProfile : defaults.taxProfile;
  const legalProfile = sameCountry && org?.legalProfile ? org.legalProfile : defaults.legalProfile;

  return {
    countryCode: resolvedSelected,
    countryDisplayName: getCountryDisplayName(resolvedSelected, uiLocale),
    currency: (sameCountry && pickString(org?.currency)) || defaults.currency,
    timezone: (sameCountry && pickString(org?.timezone)) || defaults.timezone,
    locale: (sameCountry && pickString(org?.locale)) || defaults.locale,
    defaultLanguage:
      (sameCountry && pickString(org?.defaultLanguage)) || defaults.defaultLanguage,
    registrationNumberLabel:
      legalProfile.companyRegistrationNumberLabel?.trim() ||
      defaults.legalProfile.companyRegistrationNumberLabel ||
      "—",
    taxIdLabel: legalProfile.taxIdLabel?.trim() || defaults.legalProfile.taxIdLabel || "—",
    vatIdLabel: legalProfile.vatIdLabel?.trim() || defaults.legalProfile.vatIdLabel || "—",
    vatLabel: taxProfile.vatLabel?.trim() || defaults.taxProfile.vatLabel || "—",
    marketConfigVersion:
      (sameCountry && typeof org?.marketConfigVersion === "number"
        ? org.marketConfigVersion
        : defaults.marketConfigVersion) ?? DEFAULT_MARKET_CONFIG_VERSION,
    complianceStatus: "needs_legal_review",
    usingCountryDefaults,
    missingCountry: false,
    requiredLegalFields: legalProfile.requiredFields ?? defaults.legalProfile.requiredFields ?? [],
    optionalLegalFields: legalProfile.optionalFields ?? defaults.legalProfile.optionalFields ?? [],
  };
}

export function buildCompanyProfileSaveMarketPayload(
  countryCode: string | null | undefined,
  userId: string
): Record<string, unknown> | null {
  const marketFields = buildOrganizationMarketFields(countryCode);
  if (!marketFields || !isSupportedCountryCode(countryCode)) return null;

  return {
    ...marketFields,
    updatedAt: null,
    updatedBy: userId,
  };
}
