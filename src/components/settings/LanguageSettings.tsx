"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nContext";
import { LOCALE_LABELS, LOCALE_NATIVE_LABELS, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function LanguageSettings({ className }: Props) {
  const { t, locale, setLocale, locales } = useI18n();

  return (
    <Card className={className} id="language">
      <CardHeader>
        <CardTitle>{t("settings.language.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("settings.language.description")}</p>
        <div className="space-y-2 max-w-sm">
          <Label htmlFor="app-locale">{t("settings.language.label")}</Label>
          <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
            <SelectTrigger id="app-locale" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {LOCALE_LABELS[loc]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

type LanguageSelectCompactProps = {
  className?: string;
};

/** Compact language picker for sidebar flyout. */
export function LanguageSelectCompact({ className }: LanguageSelectCompactProps) {
  const { t, locale, setLocale, locales } = useI18n();

  return (
    <div
      className={cn("flex flex-col gap-1 px-1", className)}
      role="group"
      aria-label={t("settings.language.label")}
    >
      {locales.map((loc) => {
        const selected = locale === loc;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => setLocale(loc)}
            className={cn(
              "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
              selected
                ? "bg-[#1D376A]/10 font-semibold text-[#1D376A]"
                : "text-foreground/80 hover:bg-muted/80"
            )}
            aria-pressed={selected}
          >
            {LOCALE_NATIVE_LABELS[loc]}
          </button>
        );
      })}
    </div>
  );
}
