import { defaultVatPercentForCountry } from "@/lib/workspace/countryConfig";
import type { AiEstimatorCountryProfile } from "@/types/aiEstimator";

const PROFILES: Record<string, Omit<AiEstimatorCountryProfile, "vatPercent"> & { vatPercent?: number }> = {
  SK: {
    countryCode: "SK",
    language: "sk",
    currency: "EUR",
    numberFormat: "sk-SK",
    dateFormat: "dd.MM.yyyy",
    defaultUnits: ["ks", "m", "m2", "hod"],
    legalQuoteNotes: [
      "Cena je orientačná do potvrdenia všetkých kritických predpokladov.",
      "DPH podľa platnej sadzby SR.",
    ],
    tradeTerminology: "stavebníctvo / elektroinštalácie (SK)",
    defaultHourlyRate: 35,
    defaultTravelRate: 0.5,
  },
  CZ: {
    countryCode: "CZ",
    language: "cs",
    currency: "CZK",
    numberFormat: "cs-CZ",
    dateFormat: "dd.MM.yyyy",
    defaultUnits: ["ks", "m", "m2", "hod"],
    legalQuoteNotes: ["Cena je předběžná do potvrzení předpokladů.", "DPH dle sazby ČR."],
    tradeTerminology: "stavebnictví / elektroinstalace (CZ)",
    defaultHourlyRate: 750,
  },
  AT: {
    countryCode: "AT",
    language: "de",
    currency: "EUR",
    numberFormat: "de-AT",
    dateFormat: "dd.MM.yyyy",
    defaultUnits: ["Stk", "m", "m2", "Std"],
    legalQuoteNotes: ["Unverbindliche Kalkulation bis Klärung offener Punkte.", "MwSt. nach AT."],
    tradeTerminology: "Bau / Elektroinstallation (AT)",
    defaultHourlyRate: 55,
  },
  DE: {
    countryCode: "DE",
    language: "de",
    currency: "EUR",
    numberFormat: "de-DE",
    dateFormat: "dd.MM.yyyy",
    defaultUnits: ["Stk", "m", "m2", "Std"],
    legalQuoteNotes: ["Kalkulation vorbehaltlich Klärung offener Punkte.", "MwSt. nach DE."],
    tradeTerminology: "Bau / Elektroinstallation (DE)",
    defaultHourlyRate: 55,
  },
  CH: {
    countryCode: "CH",
    language: "de",
    currency: "CHF",
    numberFormat: "de-CH",
    dateFormat: "dd.MM.yyyy",
    defaultUnits: ["Stk", "m", "m2", "Std"],
    legalQuoteNotes: ["Unverbindliche Offerte bis Klärung der Annahmen.", "MWST nach CH."],
    tradeTerminology: "Bau / Elektroinstallation (CH)",
    defaultHourlyRate: 95,
  },
};

export function resolveEstimatorCountryProfile(
  countryCode?: string | null,
  overrides?: Partial<AiEstimatorCountryProfile>
): AiEstimatorCountryProfile {
  const code = (countryCode || "SK").trim().toUpperCase() || "SK";
  const base = PROFILES[code] ?? {
    ...PROFILES.SK,
    countryCode: code,
  };

  const pickString = (
    value: string | null | undefined,
    fallback: string
  ): string => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
  };

  const currency = pickString(overrides?.currency, base.currency || "EUR");
  const language = pickString(overrides?.language, base.language || "sk");
  const vatPercent =
    typeof overrides?.vatPercent === "number" && !Number.isNaN(overrides.vatPercent)
      ? overrides.vatPercent
      : (base.vatPercent ?? defaultVatPercentForCountry(code));

  return {
    ...base,
    countryCode: pickString(overrides?.countryCode, base.countryCode || code),
    language,
    currency,
    vatPercent,
    legalQuoteNotes: overrides?.legalQuoteNotes ?? base.legalQuoteNotes,
    tradeTerminology: pickString(
      overrides?.tradeTerminology,
      base.tradeTerminology || "construction"
    ),
    defaultHourlyRate:
      typeof overrides?.defaultHourlyRate === "number"
        ? overrides.defaultHourlyRate
        : base.defaultHourlyRate,
    defaultTravelRate:
      typeof overrides?.defaultTravelRate === "number"
        ? overrides.defaultTravelRate
        : base.defaultTravelRate,
  };
}
