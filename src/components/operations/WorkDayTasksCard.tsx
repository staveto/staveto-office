"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { WorkDayTaskRow } from "@/lib/workDayReport";
import { toHoursMinutes } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  tasks: WorkDayTaskRow[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

type Filter = "all" | "completed" | "open" | "blocked";

function statusBucket(status: string): Filter {
  const s = status.toUpperCase();
  if (s === "DONE") return "completed";
  if (s === "BLOCKED") return "blocked";
  return "open";
}

export function WorkDayTasksCard({ tasks, t }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return tasks;
    return tasks.filter((row) => statusBucket(row.status) === filter);
  }, [tasks, filter]);

  const filters: { id: Filter; key: string }[] = [
    { id: "all", key: "workDay.tasks.filterAll" },
    { id: "completed", key: "workDay.tasks.filterCompleted" },
    { id: "open", key: "workDay.tasks.filterOpen" },
    { id: "blocked", key: "workDay.tasks.filterBlocked" },
  ];

  return (
    <section className={styles.card}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={styles.sectionTitle}>
          {t("workDay.tasks.title")} ({tasks.length})
        </h2>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              filter === f.id
                ? "bg-[#1D376A] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {t(f.key)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workDay.tasks.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.slice(0, 8).map((row, idx) => {
            const done = row.status.toUpperCase() === "DONE";
            return (
              <li key={row.taskId} className={styles.taskRow}>
                <div className="flex items-start gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1D376A] text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/app/projects/${row.projectId}`}
                      className="text-sm font-semibold text-foreground hover:underline"
                    >
                      {row.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.projectName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          done ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {done ? t("workDay.tasks.completed") : t("workDay.tasks.open")}
                      </span>
                      {row.durationMinutes > 0 ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {toHoursMinutes(row.durationMinutes)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
