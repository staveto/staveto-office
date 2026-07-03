/**
 * Country-specific workspace defaults (currency, timezone, document language hints).
 * UI language is separate — see user.preferredLanguage / I18nContext.
 */
export type CountryConfig = {
  countryCode: string;
  currency: string;
  timezone: string;
  defaultLanguage: string;
};

const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  SK: {
    countryCode: "SK",
    currency: "EUR",
    timezone: "Europe/Bratislava",
    defaultLanguage: "sk",
  },
  CZ: {
    countryCode: "CZ",
    currency: "CZK",
    timezone: "Europe/Prague",
    defaultLanguage: "cs",
  },
  AT: {
    countryCode: "AT",
    currency: "EUR",
    timezone: "Europe/Vienna",
    defaultLanguage: "de",
  },
  DE: {
    countryCode: "DE",
    currency: "EUR",
    timezone: "Europe/Berlin",
    defaultLanguage: "de",
  },
  CH: {
    countryCode: "CH",
    currency: "CHF",
    timezone: "Europe/Zurich",
    defaultLanguage: "de",
  },
  PL: {
    countryCode: "PL",
    currency: "PLN",
    timezone: "Europe/Warsaw",
    defaultLanguage: "pl",
  },
  HU: {
    countryCode: "HU",
    currency: "HUF",
    timezone: "Europe/Budapest",
    defaultLanguage: "hu",
  },
  GB: {
    countryCode: "GB",
    currency: "GBP",
    timezone: "Europe/London",
    defaultLanguage: "en",
  },
  US: {
    countryCode: "US",
    currency: "USD",
    timezone: "America/New_York",
    defaultLanguage: "en",
  },
};

const SOLO_FALLBACK: CountryConfig = {
  countryCode: "SK",
  currency: "EUR",
  timezone: "Europe/Bratislava",
  defaultLanguage: "sk",
};

export function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return code.trim().toUpperCase();
}

export function resolveCountryConfig(countryCode: string | null | undefined): CountryConfig {
  const normalized = normalizeCountryCode(countryCode);
  if (normalized && COUNTRY_CONFIG[normalized]) {
    return COUNTRY_CONFIG[normalized];
  }
  return SOLO_FALLBACK;
}

export function mergeWorkspaceLocale(
  countryCode: string | null | undefined,
  overrides?: Partial<Pick<CountryConfig, "currency" | "timezone" | "defaultLanguage">>
): CountryConfig {
  const base = resolveCountryConfig(countryCode);
  return {
    ...base,
    currency: overrides?.currency?.trim() || base.currency,
    timezone: overrides?.timezone?.trim() || base.timezone,
    defaultLanguage: overrides?.defaultLanguage?.trim() || base.defaultLanguage,
  };
}

/** Standard VAT % for quote defaults (not a tax engine — user can override). */
const DEFAULT_VAT_PERCENT: Record<string, number> = {
  SK: 20,
  CZ: 21,
  DE: 19,
  AT: 20,
  CH: 8.1,
  PL: 23,
  HU: 27,
  GB: 20,
};

export function defaultVatPercentForCountry(countryCode: string | null | undefined): number {
  const normalized = normalizeCountryCode(countryCode);
  if (normalized && DEFAULT_VAT_PERCENT[normalized] != null) {
    return DEFAULT_VAT_PERCENT[normalized];
  }
  return DEFAULT_VAT_PERCENT.SK;
}

/** Resolve display currency for quotes/PDF from org market or country. */
export function resolveQuoteCurrency(input?: {
  currency?: string | null;
  countryCode?: string | null;
  country?: string | null;
}): string {
  if (input?.currency?.trim()) return input.currency.trim().toUpperCase();
  const cc = input?.countryCode ?? input?.country ?? null;
  return mergeWorkspaceLocale(cc).currency;
}
