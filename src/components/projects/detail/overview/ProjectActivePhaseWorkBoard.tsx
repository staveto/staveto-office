"use client";

import { ArrowRight } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  activePhaseName?: string;
  tasks: ProjectOverviewViewModel["activePhaseTasks"];
  onNavigate: (tab: ProjectDashboardTab) => void;
};

const statusBadge: Record<
  ProjectOverviewViewModel["activePhaseTasks"][number]["status"],
  { key: string; className: string }
> = {
  overdue: {
    key: "projects.command.task.status.overdue",
    className: "border-red-500/40 bg-red-500/15 text-red-800 dark:text-red-200",
  },
  in_progress: {
    key: "projects.command.task.status.inProgress",
    className: "border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-100",
  },
  open: {
    key: "projects.command.task.status.open",
    className:
      "border-[var(--po-card-border)] bg-[var(--po-card-muted)] text-[var(--po-text-secondary)]",
  },
  done: {
    key: "projects.command.task.status.done",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100",
  },
};

export function ProjectActivePhaseWorkBoard({
  activePhaseName,
  tasks,
  onNavigate,
}: Props) {
  const { t } = useI18n();
  const title = activePhaseName
    ? t("projects.command.workBoard.titleWithPhase", { phase: activePhaseName })
    : t("projects.command.workBoard.title");

  const grouped = {
    overdue: tasks.filter((x) => x.status === "overdue"),
    in_progress: tasks.filter((x) => x.status === "in_progress"),
    open: tasks.filter((x) => x.status === "open"),
    done: tasks.filter((x) => x.status === "done"),
  };

  const flatTasks = [
    ...grouped.overdue,
    ...grouped.in_progress,
    ...grouped.open,
    ...grouped.done,
  ].slice(0, 3);

  return (
    <section className={cn(po.cardCalm, "p-4 sm:p-5")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={po.title}>{title}</h2>
        <button
          type="button"
          className={po.linkAction}
          onClick={() => onNavigate("tasks")}
        >
          {t("projects.command.workBoard.viewAll")}
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className={cn(po.body, "py-6 text-center")}>{t("projects.command.workBoard.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {flatTasks.map((task) => {
            const badge = statusBadge[task.status];
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onNavigate("tasks")}
                  className={cn(
                    po.cardMuted,
                    "flex w-full min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:border-[var(--po-primary)]/35 hover:shadow-sm"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={po.bodyStrong}>{task.title}</span>
                    <span className={cn(po.muted, "mt-0.5 flex flex-wrap gap-x-2")}>
                      {task.assigneeName ? (
                        <span>{task.assigneeName}</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">
                          {t("projects.command.task.unassigned")}
                        </span>
                      )}
                      {task.dueLabelKey ? (
                        <span>· {t(task.dueLabelKey, task.dueLabelParams)}</span>
                      ) : null}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-[10px]", badge.className)}
                  >
                    {task.blocked
                      ? t("projects.command.task.status.blocked")
                      : t(badge.key)}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
