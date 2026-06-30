"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { LOCALES, type Locale } from "@/i18n/config";

function toSupportedLocale(value: string | null | undefined): Locale | null {
  const normalized = value?.trim().toLowerCase().slice(0, 2);
  if (!normalized) return null;
  return (LOCALES as readonly string[]).includes(normalized) ? (normalized as Locale) : null;
}

/** Applies users/{uid}.preferredLanguage to I18n on login (UI language ≠ workspace country). */
export function UserPreferredLocaleSync() {
  const { profile } = useAuth();
  const { locale, setLocale } = useI18n();
  const appliedRef = useRef<string | null>(null);

  useEffect(() => {
    const preferred = toSupportedLocale(profile?.preferredLanguage);
    if (!preferred) return;
    const key = `${profile?.preferredLanguage ?? ""}:${preferred}`;
    if (appliedRef.current === key && locale === preferred) return;
    appliedRef.current = key;
    if (locale !== preferred) {
      setLocale(preferred);
    }
  }, [locale, profile?.preferredLanguage, setLocale]);

  return null;
}
