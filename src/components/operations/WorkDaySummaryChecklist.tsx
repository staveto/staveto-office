"use client";

import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import type { WorkDayReport } from "@/lib/workDayReport";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  report: WorkDayReport;
  t: (key: string, params?: Record<string, string | number>) => string;
};

type Row = {
  key: string;
  ok: boolean | null;
  warn?: boolean;
};

export function WorkDaySummaryChecklist({ report, t }: Props) {
  const rows: Row[] = [
    {
      key: "workDay.checklist.allTasks",
      ok: report.summary.allTasksCompleted,
    },
    {
      key: "workDay.checklist.timeNorm",
      ok: report.summary.timeInNorm,
    },
    {
      key: "workDay.checklist.materials",
      ok: report.summary.hasMaterials ? true : false,
    },
    {
      key: "workDay.checklist.photos",
      ok: report.summary.hasPhotos ? true : false,
    },
    {
      key: "workDay.checklist.problems",
      ok: report.summary.hasProblems ? false : true,
      warn: report.summary.hasProblems,
    },
    {
      key: "workDay.checklist.gps",
      ok: report.summary.hasGps ? true : false,
    },
  ];

  return (
    <section className={styles.card}>
      <h2 className={cn(styles.sectionTitle, "mb-4")}>{t("workDay.checklist.title")}</h2>
      <ul className="space-y-2">
        {rows.map((row) => {
          const Icon =
            row.ok === true
              ? CheckCircle2
              : row.warn
                ? AlertTriangle
                : row.ok === false
                  ? AlertTriangle
                  : Circle;
          const color =
            row.ok === true
              ? "text-emerald-600"
              : row.warn || row.ok === false
                ? "text-amber-600"
                : "text-muted-foreground";
          return (
            <li key={row.key} className="flex items-center gap-2 text-sm">
              <Icon className={cn("size-4 shrink-0", color)} aria-hidden />
              <span>{t(row.key)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
