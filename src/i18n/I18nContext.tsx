"use client";

import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { translations, type Locale } from "./translations";
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
} from "./config";

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locales: readonly Locale[];
};

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let result = text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? `{{${k}}}`));
  result = result.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  return result;
}

function resolveText(locale: Locale, key: string): string {
  const primary = translations[locale]?.[key];
  if (primary) return primary;
  if (locale !== FALLBACK_LOCALE) {
    const fallback = translations[FALLBACK_LOCALE]?.[key];
    if (fallback) return fallback;
  }
  for (const loc of LOCALES) {
    const value = translations[loc]?.[key];
    if (value) return value;
  }
  return key;
}

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw && (LOCALES as readonly string[]).includes(raw)) {
      return raw as Locale;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return interpolate(resolveText(locale, key), params);
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, locales: LOCALES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
