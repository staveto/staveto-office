"use client";

import { Activity } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  progress: ProjectOverviewViewModel["progress"];
};

export function ProjectHealthCard({ progress }: Props) {
  const { t } = useI18n();

  return (
    <section className={cn(po.infoCard, "p-4 sm:p-5")}>
      <div className="mb-3 flex items-center gap-2">
        <Activity className="size-4 text-[var(--po-primary)]" aria-hidden />
        <h2 className={po.sectionTitle}>{t("projects.command.health.title")}</h2>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold tabular-nums text-[var(--po-text-primary)]">
            {progress.percent}%
          </p>
          <p className={po.muted}>
            {t("projects.dashboard.kpi.tasksDone", {
              done: String(progress.completedTasks),
              total: String(progress.totalTasks),
            })}
          </p>
        </div>
        {progress.overdueTasks > 0 ? (
          <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-800 dark:text-red-200">
            {t("projects.command.health.overdue", { count: progress.overdueTasks })}
          </span>
        ) : (
          <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-100">
            {t("projects.command.health.onTrack")}
          </span>
        )}
      </div>

      <div className={cn(po.progressTrack, "mt-3")}>
        <div className={po.progressFill} style={{ width: `${progress.percent}%` }} />
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className={po.muted}>{t("projects.header.activePhase")}</dt>
          <dd className={po.bodyStrong}>
            {progress.activePhaseName ?? t("projects.header.noPhase")}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className={po.muted}>{t("projects.command.health.tasksOpen")}</dt>
          <dd className={po.bodyStrong}>
            {Math.max(0, progress.totalTasks - progress.completedTasks)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
