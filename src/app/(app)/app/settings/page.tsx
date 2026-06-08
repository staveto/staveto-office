"use client";

import Link from "next/link";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSettings } from "@/components/settings/LanguageSettings";
import { CompanyProfileCompletionCard } from "@/components/settings/CompanyProfileCompletionCard";
import { OrganizationSubdomainSettings } from "@/components/settings/OrganizationSubdomainSettings";
import { CompanyRegistrationPlaceholder } from "@/components/settings/CompanyRegistrationPlaceholder";
import { RegisteredCompanyPrompt } from "@/components/settings/RegisteredCompanyPrompt";
import { SettingsProfileOverview } from "@/components/settings/SettingsProfileOverview";
import { SettingsSectionCard } from "@/components/settings/SettingsSectionCard";
import { useI18n } from "@/i18n/I18nContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { shouldShowWorkerDashboard } from "@/lib/workspaceProduct";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsFieldHintClassName } from "@/components/settings/settingsStyles";

export default function SettingsPage() {
  const { t } = useI18n();
  const { canEditModules } = useEnabledModules();
  const { role, isCompany } = useWorkspaceProduct();
  const isFieldWorker = isCompany && shouldShowWorkerDashboard(role);

  if (isFieldWorker) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <SettingsProfileOverview />
        <LanguageSettings />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <SettingsProfileOverview />
      <RegisteredCompanyPrompt />
      <CompanyProfileCompletionCard />
      <SettingsSectionCard>
        <CardHeader>
          <CardTitle>{t("settings.companyProfile.title")}</CardTitle>
          <CardDescription className="text-[#4a5568]">
            {t("settings.companyProfile.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/app/settings/company"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {t("settings.companyProfile.completionCta")}
          </Link>
        </CardContent>
      </SettingsSectionCard>
      <CompanyRegistrationPlaceholder />
      <LanguageSettings />
      {canEditModules ? (
        <SettingsSectionCard>
          <CardHeader>
            <CardTitle>{t("settings.modules.linkTitle")}</CardTitle>
            <CardDescription className="text-[#4a5568]">
              {t("settings.modules.linkDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/app/settings/modules"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("settings.modules.manage")}
            </Link>
          </CardContent>
        </SettingsSectionCard>
      ) : null}
      <SettingsSectionCard>
        <CardHeader>
          <CardTitle>{t("nav.settings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={settingsFieldHintClassName}>{t("settings.generalHint")}</p>
        </CardContent>
      </SettingsSectionCard>
      <OrganizationSubdomainSettings />
    </div>
  );
}
