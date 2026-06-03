"use client";

import { Building2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";

type PlanningPageHeaderProps = {
  companyName?: string;
  isPersonalWorkspace: boolean;
};

export function PlanningPageHeader({
  companyName,
  isPersonalWorkspace,
}: PlanningPageHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="space-y-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1D376A]">
          {t("planning.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("planning.subtitle")}</p>
      </div>
      {isPersonalWorkspace ? (
        <p
          className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          {t("planning.personalWorkspaceHint")}
        </p>
      ) : companyName ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1D376A]/80">
          <Building2 className="size-4 shrink-0" aria-hidden />
          <span>{companyName}</span>
        </p>
      ) : null}
    </header>
  );
}
