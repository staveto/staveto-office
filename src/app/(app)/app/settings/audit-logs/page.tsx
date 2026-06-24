"use client";

import { useI18n } from "@/i18n/I18nContext";
import { SettingsSectionCard } from "@/components/settings/SettingsSectionCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { settingsComingSoonClassName } from "@/components/settings/settingsStyles";

export default function AuditLogsSettingsPage() {
  const { t } = useI18n();

  return (
    <SettingsSectionCard>
      <CardHeader>
        <CardTitle>{t("settings.auditLogs.title")}</CardTitle>
        <CardDescription>{t("settings.auditLogs.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={settingsComingSoonClassName}>
          {t("settings.auditLogs.comingSoon")}
        </p>
      </CardContent>
    </SettingsSectionCard>
  );
}
