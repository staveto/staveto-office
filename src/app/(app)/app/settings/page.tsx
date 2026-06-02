"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSettings } from "@/components/settings/LanguageSettings";
import { OrganizationSubdomainSettings } from "@/components/settings/OrganizationSubdomainSettings";
import { RegisteredCompanyPrompt } from "@/components/settings/RegisteredCompanyPrompt";
import { useI18n } from "@/i18n/I18nContext";

export default function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <RegisteredCompanyPrompt />
      <LanguageSettings />
      <Card>
        <CardHeader>
          <CardTitle>{t("nav.settings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t("settings.generalHint")}</p>
        </CardContent>
      </Card>
      <OrganizationSubdomainSettings />
    </div>
  );
}
