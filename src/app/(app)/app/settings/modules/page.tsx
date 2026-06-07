"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ModuleSettings } from "@/components/settings/ModuleSettings";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useI18n } from "@/i18n/I18nContext";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ModuleSettingsPage() {
  const { t } = useI18n();
  const { isCompanyModulesActive, canEditModules, loading } = useEnabledModules();

  if (!loading && (!isCompanyModulesActive || !canEditModules)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          href="/app/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("settings.modules.back")}
        </Link>
        <p className="text-sm text-muted-foreground">{t("settings.modules.adminOnly")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/app/settings"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("settings.modules.back")}
      </Link>
      <ModuleSettings />
    </div>
  );
}
