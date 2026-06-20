"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  nextAction: ProjectOverviewViewModel["nextAction"];
  onNavigate: (tab: ProjectDashboardTab) => void;
};

const severityStyles = {
  neutral: "border-[var(--po-card-border)] bg-[var(--po-card-muted)]",
  attention: "border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15",
  warning: "border-orange-500/45 bg-orange-500/10 dark:bg-orange-500/15",
  danger: "border-red-500/45 bg-red-500/10 dark:bg-red-500/15",
} as const;

export function ProjectNextActionStrip({ nextAction, onNavigate }: Props) {
  const { t } = useI18n();
  const showIcon =
    nextAction.severity === "danger" ||
    nextAction.severity === "warning" ||
    nextAction.severity === "attention";

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        severityStyles[nextAction.severity]
      )}
      aria-label={t(nextAction.titleKey)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {showIcon ? (
            <AlertTriangle
              className={cn(
                "size-4 shrink-0",
                nextAction.severity === "danger"
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
              )}
              aria-hidden
            />
          ) : null}
          <h2 className={po.titleSm}>{t(nextAction.titleKey)}</h2>
        </div>
        <p className={cn(po.body, "mt-1")}>
          {t(nextAction.messageKey, nextAction.messageParams)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className={po.btnPrimary}
          onClick={() => onNavigate(nextAction.primaryTab)}
        >
          {t(nextAction.primaryLabelKey)}
          <ArrowRight className="ml-1 size-3.5" />
        </Button>
        {nextAction.primaryTab !== "workplan" ? (
          <Button
            size="sm"
            variant="outline"
            className={po.btnOutline}
            onClick={() => onNavigate("workplan")}
          >
            {t("projects.workPlan.assignWorker")}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className={po.btnOutline}
          onClick={() => onNavigate("workplan")}
        >
          {t("projects.command.nextAction.scheduleTeam")}
        </Button>
      </div>
    </section>
  );
}
