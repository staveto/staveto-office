"use client";

import { ModuleSettings } from "@/components/settings/ModuleSettings";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useI18n } from "@/i18n/I18nContext";

export default function ModuleSettingsPage() {
  const { t } = useI18n();
  const { isCompanyModulesActive, canEditModules, loading } = useEnabledModules();

  if (!loading && (!isCompanyModulesActive || !canEditModules)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">{t("settings.modules.adminOnly")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ModuleSettings />
    </div>
  );
}
