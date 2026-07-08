"use client";

import { AlertTriangle, UserRound } from "lucide-react";
import type { MemberWorkload } from "@/lib/taskPlanningMetrics";
import { cn } from "@/lib/utils";

type Props = {
  workloads: MemberWorkload[];
  unassignedCount: number;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function LoadBar({ percent }: { percent: number }) {
  const filled = Math.min(10, Math.max(0, Math.round(percent / 10)));
  return (
    <span className="font-mono text-xs tracking-tight text-[var(--po-text-secondary)]" aria-hidden>
      {"█".repeat(filled)}
      {"░".repeat(10 - filled)}
    </span>
  );
}

export function ProjectWorkloadPanel({ workloads, unassignedCount, t }: Props) {
  if (workloads.length === 0 && unassignedCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--po-card-border)] p-4 text-sm text-[var(--po-text-muted)]">
        {t("projects.workPlan.noTeam")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--po-text-muted)] px-1">
        {t("projects.workPlan.workload")}
      </h3>
      <div className="space-y-2 lg:max-h-[calc(100vh-320px)] lg:overflow-y-auto">
        {workloads.map((w) => (
          <div
            key={w.userId}
            className={cn(
              "rounded-xl border bg-[var(--po-card-bg)] p-3 shadow-sm",
              w.hasConflict ? "border-amber-500/40" : "border-[var(--po-card-border)]"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <UserRound className="size-4 text-[var(--po-text-secondary)] shrink-0" />
                <span className="font-semibold text-sm text-[var(--po-text-primary)] truncate">{w.name}</span>
              </div>
              {w.hasConflict ? (
                <AlertTriangle className="size-4 text-amber-500 shrink-0" aria-label="conflict" />
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <LoadBar percent={w.loadPercent} />
              <span className="text-xs font-semibold text-[var(--po-text-muted)] tabular-nums">
                {w.loadPercent}%
              </span>
            </div>
            <p className="text-xs text-[var(--po-text-muted)] mt-1.5">
              {t("projects.workPlan.tasksCount", { count: String(w.taskCount) })}
              {w.plannedHours != null ? ` · ${w.plannedHours}h` : ""}
            </p>
          </div>
        ))}

        {unassignedCount > 0 ? (
          <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-950/20 p-3">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {t("projects.workPlan.unassigned")}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              {t("projects.workPlan.tasksCount", { count: String(unassignedCount) })}
              {" · "}
              {t("projects.workPlan.free")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
