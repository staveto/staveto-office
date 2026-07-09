"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, GanttChartSquare, CalendarPlus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { PersonalPlanningPlaceholder } from "@/components/planning/PersonalPlanningPlaceholder";
import { PlanningCommandCenterBoard } from "@/components/planning/PlanningCommandCenterBoard";

export default function PlanningPage() {
  const { t } = useI18n();
  const { isCompany, canManage } = useWorkspaceProduct();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isCompany) {
    return <PersonalPlanningPlaceholder />;
  }

  if (!canManage) {
    return (
      <div className="mx-auto mt-6 max-w-lg rounded-xl border border-border bg-card p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">{t("planning.restrictedTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("planning.restrictedDesc")}</p>
        <Link
          href="/app/projects"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-[#1D376A] px-4 text-sm font-medium text-white hover:bg-[#162d58]"
        >
          {t("planning.openMyProjects")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[96rem] space-y-4 pb-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("planning.commandCenter.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("planning.commandCenter.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/app/planning/gantt"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#e06737] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#c8552a]"
          >
            <GanttChartSquare className="size-4" aria-hidden />
            {t("planning.openGantt")}
          </Link>
          <Link
            href="/app/planning/gantt?showAll=1"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:border-[#e06737]/60"
          >
            <CalendarPlus className="size-4" aria-hidden />
            {t("planning.planWork")}
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="h-9 shrink-0"
          >
            <RefreshCw className="size-4" aria-hidden />
            <span className="ml-2">{t("planning.refresh")}</span>
          </Button>
        </div>
      </header>

      <PlanningCommandCenterBoard key={refreshKey} />
    </div>
  );
}
