"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nContext";
import type { MissionControlKpi } from "@/lib/missionControlData";
import { missionGlassCardClassName, missionMutedClassName } from "./missionControlStyles";
import { cn } from "@/lib/utils";

type MissionControlKpisProps = {
  kpis: MissionControlKpi[];
};

function isProblemKpi(id: string): boolean {
  return id === "unassigned-tasks" || id === "no-tools-tasks";
}

export function MissionControlKpis({ kpis }: MissionControlKpisProps) {
  const { t } = useI18n();

  const visible = kpis.filter((kpi) => {
    if (kpi.pending) return false;
    if (kpi.value == null && kpi.id !== "billing") return false;
    if (isProblemKpi(kpi.id) && (kpi.value ?? 0) === 0) return false;
    return true;
  });

  if (visible.length === 0) return null;

  return (
    <section aria-label={t("dashboard.mission.kpi.section")}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {visible.map((kpi) => {
          const displayValue = kpi.value == null ? "—" : String(kpi.value);
          const isProblem = isProblemKpi(kpi.id) && (kpi.value ?? 0) > 0;

          return (
            <Link
              key={kpi.id}
              href={kpi.href}
              className={cn(
                missionGlassCardClassName,
                "flex flex-col gap-0.5 px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-primary/10 dark:hover:bg-transparent",
                isProblem && "border-rose-200 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-950/20",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              )}
            >
              <span className={cn(missionMutedClassName, "text-[11px] leading-snug")}>
                {t(kpi.labelKey)}
              </span>
              <span
                className={cn(
                  "text-xl font-semibold tabular-nums tracking-tight text-foreground",
                  isProblem && "text-rose-700 dark:text-rose-400"
                )}
              >
                {displayValue}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
