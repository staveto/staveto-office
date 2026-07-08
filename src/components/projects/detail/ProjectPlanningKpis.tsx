"use client";

import type { PlanningKpiMetrics } from "@/lib/taskPlanningMetrics";
import { cn } from "@/lib/utils";

type Props = {
  metrics: PlanningKpiMetrics;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function KpiCard({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--po-card-bg)] px-4 py-3 shadow-sm min-w-[120px] flex-1",
        warn ? "border-amber-500/40 bg-amber-950/20" : "border-[var(--po-card-border)]",
        accent && !warn && "border-[var(--po-primary)]/25 bg-[var(--po-card-muted)]"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums mt-1",
          warn ? "text-amber-700 dark:text-amber-300" : "text-[var(--po-text-primary)]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ProjectPlanningKpis({ metrics, t }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <KpiCard label={t("projects.workPlan.kpiTasks")} value={metrics.total} accent />
      <KpiCard label={t("projects.workPlan.kpiAssigned")} value={metrics.assigned} accent />
      <KpiCard
        label={t("projects.workPlan.withoutWorker")}
        value={metrics.withoutWorker}
        warn={metrics.withoutWorker > 0}
      />
      <KpiCard
        label={t("projects.workPlan.withoutTools")}
        value={metrics.withoutTools}
        warn={metrics.withoutTools > 0}
      />
      <KpiCard
        label={t("projects.workPlan.plannedHours")}
        value={metrics.plannedHours != null ? `${metrics.plannedHours}h` : "—"}
        accent
      />
      <KpiCard label={t("projects.workPlan.done")} value={metrics.done} />
    </div>
  );
}
