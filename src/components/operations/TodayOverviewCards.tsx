"use client";

import type { TodayOverviewMetrics } from "@/lib/operationsMetrics";
import { toHoursMinutes } from "@/lib/operationsMetrics";

type Props = {
  metrics: TodayOverviewMetrics;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export function TodayOverviewCards({ metrics, t }: Props) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t("operations.today")}</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Stat label={t("operations.workingNow")} value={metrics.activeWorkers} />
        <Stat label={t("operations.onBreak")} value={metrics.onBreak} />
        <Stat label={t("operations.absent")} value={metrics.absent} />
        <Stat label={t("operations.tasksWithoutAssignee")} value={metrics.unassignedTasks} />
        <Stat label={t("operations.noActiveTimers")} value={metrics.runningTimers} />
        <Stat label={t("operations.todayPlannedTasks")} value={metrics.tasksPlannedToday} />
        <Stat label={t("operations.investedTime")} value={toHoursMinutes(metrics.trackedMinutesToday)} />
      </div>
    </section>
  );
}
