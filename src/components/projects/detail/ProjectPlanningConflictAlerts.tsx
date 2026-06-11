"use client";

import { AlertTriangle } from "lucide-react";
import type { ToolConflict, WorkerConflict } from "@/lib/taskPlanningConflicts";

type Props = {
  withoutWorkerCount: number;
  withoutToolsCount: number;
  toolConflicts: ToolConflict[];
  workerConflicts: WorkerConflict[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectPlanningConflictAlerts({
  withoutWorkerCount,
  withoutToolsCount,
  toolConflicts,
  workerConflicts,
  t,
}: Props) {
  const items: string[] = [];

  if (withoutWorkerCount > 0) {
    items.push(
      t("projects.workPlan.alertWithoutWorker", { count: String(withoutWorkerCount) })
    );
  }
  if (withoutToolsCount > 0) {
    items.push(
      t("projects.workPlan.alertWithoutTools", { count: String(withoutToolsCount) })
    );
  }
  for (const c of toolConflicts) {
    items.push(
      t("projects.workPlan.toolConflictDetail", { tool: c.toolName })
    );
  }
  for (const c of workerConflicts) {
    items.push(
      t("projects.workPlan.workerConflictDetail", { name: c.assigneeName })
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 space-y-1.5">
      {items.map((text, i) => (
        <p key={i} className="text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
          <span>{text}</span>
        </p>
      ))}
    </div>
  );
}
