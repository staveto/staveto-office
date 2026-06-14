"use client";

import { useI18n } from "@/i18n/I18nContext";
import { SettingsSectionCard } from "@/components/settings/SettingsSectionCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SecuritySettingsPage() {
  const { t } = useI18n();

  return (
    <SettingsSectionCard>
      <CardHeader>
        <CardTitle>{t("settings.security.title")}</CardTitle>
        <CardDescription className="text-[#4a5568]">
          {t("settings.security.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="rounded-lg border border-dashed border-[#b8c5d4] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#5a6577]">
          {t("settings.security.comingSoon")}
        </p>
      </CardContent>
    </SettingsSectionCard>
  );
}
