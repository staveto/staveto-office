import type { SupportedCountryCode } from "./marketProfileContract";
import { normalizeCountryCode } from "@/lib/workspace/countryConfig";

export type CountryOption = {
  countryCode: SupportedCountryCode;
  nativeName: string;
  englishName: string;
};

export const COUNTRY_OPTIONS: CountryOption[] = [
  { countryCode: "SK", nativeName: "Slovensko", englishName: "Slovakia" },
  { countryCode: "CZ", nativeName: "Česko", englishName: "Czechia" },
  { countryCode: "DE", nativeName: "Nemecko", englishName: "Germany" },
  { countryCode: "AT", nativeName: "Rakúsko", englishName: "Austria" },
  { countryCode: "CH", nativeName: "Švajčiarsko", englishName: "Switzerland" },
];

const SUPPORTED_CODES = new Set(COUNTRY_OPTIONS.map((o) => o.countryCode));

const LEGACY_COUNTRY_ALIASES: Record<string, SupportedCountryCode> = {
  SK: "SK",
  SVK: "SK",
  SLOVAKIA: "SK",
  SLOVENSKO: "SK",
  CZ: "CZ",
  CZE: "CZ",
  CZECHIA: "CZ",
  "CZECH REPUBLIC": "CZ",
  CESKO: "CZ",
  "ČESKO": "CZ",
  DE: "DE",
  DEU: "DE",
  GERMANY: "DE",
  DEUTSCHLAND: "DE",
  NEMECKO: "DE",
  AT: "AT",
  AUT: "AT",
  AUSTRIA: "AT",
  "ÖSTERREICH": "AT",
  OESTERREICH: "AT",
  RAKUSKO: "AT",
  "RAKÚSKO": "AT",
  CH: "CH",
  CHE: "CH",
  SWITZERLAND: "CH",
  SCHWEIZ: "CH",
  SVAJCIARSKO: "CH",
  "ŠVAJCIARSKO": "CH",
};

export function isSupportedCountryCode(code: string | null | undefined): code is SupportedCountryCode {
  const normalized = normalizeCountryCode(code);
  return Boolean(normalized && SUPPORTED_CODES.has(normalized as SupportedCountryCode));
}

/** Map root countryCode or legacy free-text profile.country to a supported ISO code. */
export function resolveSupportedCountryCode(
  countryCode?: string | null,
  legacyCountry?: string | null
): SupportedCountryCode | null {
  if (isSupportedCountryCode(countryCode)) {
    return countryCode.trim().toUpperCase() as SupportedCountryCode;
  }

  const legacy = legacyCountry?.trim();
  if (!legacy) return null;

  const upper = legacy.toUpperCase();
  if (LEGACY_COUNTRY_ALIASES[upper]) {
    return LEGACY_COUNTRY_ALIASES[upper];
  }

  return isSupportedCountryCode(upper) ? (upper as SupportedCountryCode) : null;
}

export function getCountryOption(
  countryCode: string | null | undefined
): CountryOption | null {
  const resolved = resolveSupportedCountryCode(countryCode);
  if (!resolved) return null;
  return COUNTRY_OPTIONS.find((o) => o.countryCode === resolved) ?? null;
}

export function getCountryDisplayName(
  countryCode: string | null | undefined,
  uiLocale: "sk" | "en" | "de" = "en"
): string {
  const option = getCountryOption(countryCode);
  if (!option) return countryCode?.trim() || "—";
  if (uiLocale === "sk") return option.nativeName;
  return option.englishName;
}
