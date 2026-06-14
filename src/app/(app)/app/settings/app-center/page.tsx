"use client";

import { Suspense } from "react";
import { AppCenterPage } from "@/components/settings/AppCenterPage";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useI18n } from "@/i18n/I18nContext";
import { Loader2 } from "lucide-react";

function AppCenterContent() {
  const { canEditModules, isCompanyModulesActive, loading } = useEnabledModules();
  const { t } = useI18n();

  if (!loading && !isCompanyModulesActive) {
    return (
      <p className="text-sm text-muted-foreground">{t("appCenter.error.noCompany")}</p>
    );
  }

  if (!loading && isCompanyModulesActive && !canEditModules) {
    return <AppCenterPage canEdit={false} />;
  }

  return <AppCenterPage canEdit={canEditModules} />;
}

export default function AppCenterRoutePage() {
  const { t } = useI18n();

  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("appCenter.loading")}
        </div>
      }
    >
      <AppCenterContent />
    </Suspense>
  );
}
