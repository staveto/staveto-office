"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSettings } from "@/components/settings/LanguageSettings";
import { CompanyProfileSettings } from "@/components/settings/CompanyProfileSettings";
import { OrganizationSubdomainSettings } from "@/components/settings/OrganizationSubdomainSettings";
import { CompanyRegistrationPlaceholder } from "@/components/settings/CompanyRegistrationPlaceholder";
import { RegisteredCompanyPrompt } from "@/components/settings/RegisteredCompanyPrompt";
import { useI18n } from "@/i18n/I18nContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { t } = useI18n();
  const { canEditModules } = useEnabledModules();

  return (
    <div className="space-y-6">
      <RegisteredCompanyPrompt />
      <CompanyRegistrationPlaceholder />
      <LanguageSettings />
      <CompanyProfileSettings />
      {canEditModules ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.modules.linkTitle")}</CardTitle>
            <CardDescription>{t("settings.modules.linkDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/app/settings/modules"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("settings.modules.manage")}
            </Link>
          </CardContent>
        </Card>
      ) : null}
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
