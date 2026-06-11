"use client";

import type { MemberWorkload } from "@/lib/taskPlanningMetrics";
import { useI18n } from "@/i18n/I18nContext";
import {
  missionGlassCardClassName,
  missionSectionTitleClassName,
} from "./missionControlStyles";
import { cn } from "@/lib/utils";

type MissionControlWorkloadProps = {
  workloads: MemberWorkload[];
};

export function MissionControlWorkload({ workloads }: MissionControlWorkloadProps) {
  const { t } = useI18n();

  if (workloads.length === 0) return null;

  return (
    <section className={cn(missionGlassCardClassName, "p-4")}>
      <h3 className={cn(missionSectionTitleClassName, "mb-3")}>
        {t("dashboard.mission.workload.title")}
      </h3>
      <ul className="space-y-2.5" role="list">
        {workloads.slice(0, 5).map((w) => (
          <li key={w.userId} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-foreground">{w.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{w.loadPercent}%</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={w.loadPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={w.name}
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  w.loadPercent >= 80 ? "bg-primary" : "bg-[#1D376A] dark:bg-primary/80"
                )}
                style={{ width: `${w.loadPercent}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
