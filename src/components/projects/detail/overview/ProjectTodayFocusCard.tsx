"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  todayFocus: ProjectOverviewViewModel["todayFocus"];
  onNavigate: (tab: ProjectDashboardTab) => void;
  onNotifyTeam?: () => void;
};

function recommendedActionKey(todayFocus: ProjectOverviewViewModel["todayFocus"]): string {
  if (todayFocus.overdueCount > 0) return "projects.cockpit.recommendedActionOverdue";
  return "projects.cockpit.recommendedActionAttention";
}

export function ProjectTodayFocusCard({ todayFocus, onNavigate, onNotifyTeam }: Props) {
  const { t } = useI18n();

  if (todayFocus.hasUrgentIssues) {
    return (
      <section
        className={cn(po.urgentCard, "p-5 sm:p-6")}
        aria-label={t("projects.cockpit.todayFocus.title")}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
                <AlertTriangle className="size-5 text-orange-600 dark:text-orange-400" />
              </span>
              <h2 className={po.sectionTitleLg}>{t("projects.cockpit.todayFocus.title")}</h2>
            </div>

            {todayFocus.overdueCount > 0 ? (
              <p className="text-3xl font-bold tabular-nums tracking-tight text-[var(--po-text-primary)] sm:text-4xl">
                {t("projects.cockpit.todayFocus.overdueCount", {
                  count: todayFocus.overdueCount,
                })}
              </p>
            ) : null}

            {todayFocus.criticalTask ? (
              <div className={cn(po.cardMuted, "border-orange-500/20 px-4 py-3")}>
                <p className={po.labelCaps}>{t("projects.cockpit.todayFocus.criticalTask")}</p>
                <p className="mt-1.5 text-base font-semibold text-[var(--po-text-primary)]">
                  {todayFocus.criticalTask.title}
                </p>
                <p className={cn(po.muted, "mt-1")}>
                  {todayFocus.criticalTask.assigneeName
                    ? todayFocus.criticalTask.assigneeName
                    : t("projects.command.task.unassigned")}
                  {todayFocus.activePhaseName
                    ? ` · ${todayFocus.activePhaseName}`
                    : null}
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-[var(--po-card-border)]/50 bg-[var(--po-card-muted)]/30 px-3 py-2.5">
              <p className={po.labelCaps}>{t("projects.cockpit.recommendedNextStep")}</p>
              <p className={cn(po.body, "mt-1 font-medium text-[var(--po-text-primary)]")}>
                {t(recommendedActionKey(todayFocus))}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-col justify-center gap-2 lg:w-[240px] lg:shrink-0">
            {todayFocus.overdueCount > 0 ? (
              <Button
                size="lg"
                className={cn(po.btnPrimaryLg, "w-full")}
                onClick={() => onNavigate("tasks")}
              >
                {t("projects.cockpit.todayFocus.openOverdue")}
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className={cn(po.btnOutline, "w-full")}
              onClick={() => onNavigate("workplan")}
            >
              <CalendarClock className="mr-1.5 size-4" />
              {t("projects.cockpit.todayFocus.editPlan")}
            </Button>
            {onNotifyTeam ? (
              <Button
                size="sm"
                variant="ghost"
                className={cn(po.btnGhost, "w-full")}
                onClick={onNotifyTeam}
              >
                <Bell className="mr-1.5 size-4" />
                {t("projects.cockpit.todayFocus.notifyTeam")}
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(po.cardCalm, "border-emerald-500/25 bg-emerald-500/[0.04] p-5 sm:p-6")}
      aria-label={t("projects.cockpit.todayFocus.okTitle")}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className={po.sectionTitle}>{t("projects.cockpit.todayFocus.okTitle")}</h2>
          </div>
          {todayFocus.nextPlannedTask ? (
            <div>
              <p className={po.muted}>{t("projects.cockpit.todayFocus.nextTask")}</p>
              <p className="text-base font-semibold text-[var(--po-text-primary)]">
                {todayFocus.nextPlannedTask.title}
              </p>
              {todayFocus.nextPlannedTask.dueDate ? (
                <p className={cn(po.muted, "mt-0.5")}>
                  {t("projects.command.task.dueOn", {
                    date: todayFocus.nextPlannedTask.dueDate,
                  })}
                </p>
              ) : null}
            </div>
          ) : (
            <p className={po.body}>{t("projects.cockpit.todayFocus.noOpenTasks")}</p>
          )}
        </div>
        <Button
          size="default"
          className={cn(po.btnPrimary, "w-full sm:w-auto")}
          onClick={() => onNavigate("workplan")}
        >
          <ClipboardList className="mr-1 size-4" />
          {t("projects.cockpit.todayFocus.continuePlan")}
          <ArrowRight className="ml-1 size-3.5" />
        </Button>
      </div>
    </section>
  );
}
