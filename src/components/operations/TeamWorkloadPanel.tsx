"use client";

import { useState } from "react";
import type { TeamWorkloadRow } from "@/lib/operationsMetrics";
import { toHoursMinutes } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  weekRows: TeamWorkloadRow[];
  monthRows: TeamWorkloadRow[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function TeamWorkloadPanel({ weekRows, monthRows, t }: Props) {
  const [window, setWindow] = useState<"week" | "month">("week");
  const rows = window === "week" ? weekRows : monthRows;
  const maxMinutes = Math.max(...rows.map((r) => r.totalMinutes), 1);

  return (
    <section className={styles.sectionCard}>
      <p className={styles.sectionIntent}>{t("operations.layout.intent.capacity")}</p>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className={styles.sectionTitle}>{t("operations.workload.title")}</h2>
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["week", "month"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindow(w)}
              className={cn(
                "rounded-md px-2.5 py-1 font-semibold transition-colors",
                window === w
                  ? "bg-[#1D376A] text-white"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t(`operations.workload.${w}`)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operations.workload.empty")}</p>
      ) : (
        <ul className="space-y-4">
          {rows.slice(0, 10).map((row) => {
            const pct = Math.round((row.totalMinutes / maxMinutes) * 100);
            const isFree = row.totalMinutes === 0;
            return (
              <li key={row.uid}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{row.name}</span>
                  <span className="shrink-0 font-bold tabular-nums text-[#1D376A]">
                    {isFree ? t("operations.workload.free") : toHoursMinutes(row.totalMinutes)}
                  </span>
                </div>
                <div className={styles.workloadBar}>
                  <div
                    className={styles.workloadFill}
                    style={{ width: `${isFree ? 4 : pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
