"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { LOCALE_NATIVE_LABELS, type Locale } from "@/i18n/config";

type OnboardingLanguageSwitcherProps = {
  className?: string;
};

export function OnboardingLanguageSwitcher({ className }: OnboardingLanguageSwitcherProps) {
  const { t, locale, setLocale, locales } = useI18n();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Languages className="size-4 shrink-0 text-white/60" aria-hidden />
      <div
        role="group"
        aria-label={t("settings.language.label")}
        className="flex gap-1 rounded-lg bg-white/10 p-1"
      >
        {locales.map((loc) => {
          const selected = locale === loc;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => setLocale(loc as Locale)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/70",
                selected
                  ? "bg-[#e06737] text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              )}
              aria-pressed={selected}
            >
              {LOCALE_NATIVE_LABELS[loc]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
