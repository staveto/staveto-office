"use client";

import { toHoursMinutes } from "@/lib/operationsMetrics";
import type {
  TimeInvestmentByEmployee,
  TimeInvestmentByProject,
  TimeInvestmentByTask,
} from "@/lib/operationsMetrics";

type Props = {
  byProject: TimeInvestmentByProject[];
  byTask: TimeInvestmentByTask[];
  byEmployee: TimeInvestmentByEmployee[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function TimeInvestmentPanel({ byProject, byTask, byEmployee, t }: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("operations.timeInvestment")}</h3>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("operations.byProject")}</p>
          <ul className="space-y-1.5 text-sm">
            {byProject.slice(0, 5).map((row) => (
              <li key={row.projectId} className="flex justify-between gap-2">
                <span className="truncate">{row.projectName}</span>
                <span className="shrink-0 font-medium">{toHoursMinutes(row.totalMinutes)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("operations.byTask")}</p>
          <ul className="space-y-1.5 text-sm">
            {byTask.slice(0, 5).map((row) => (
              <li key={row.taskId} className="flex justify-between gap-2">
                <span className="truncate">{row.taskName}</span>
                <span className="shrink-0 font-medium">{toHoursMinutes(row.totalMinutes)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("operations.byEmployee")}</p>
          <ul className="space-y-1.5 text-sm">
            {byEmployee.slice(0, 5).map((row) => (
              <li key={row.userId} className="flex justify-between gap-2">
                <span className="truncate">{row.userName}</span>
                <span className="shrink-0 font-medium">{toHoursMinutes(row.totalMinutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
