import type { Locale } from "./translations";

export type { Locale };

export const LOCALES: readonly Locale[] = ["sk", "en", "de"] as const;

export const DEFAULT_LOCALE: Locale = "sk";

export const FALLBACK_LOCALE: Locale = "en";

export const LOCALE_STORAGE_KEY = "staveto.locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  sk: "Slovenčina",
  en: "English",
  de: "Deutsch (CH)",
};

export const LOCALE_NATIVE_LABELS: Record<Locale, string> = {
  sk: "Slovenčina",
  en: "English",
  de: "Deutsch",
};
