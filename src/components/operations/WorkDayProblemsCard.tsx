"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { WorkDayProblemRow } from "@/lib/workDayReport";
import { formatTimeShort } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  problems: WorkDayProblemRow[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

function priorityClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "high") return "bg-rose-100 text-rose-800";
  if (p === "low") return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export function WorkDayProblemsCard({ problems, t }: Props) {
  return (
    <section className={styles.card}>
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="size-4 text-rose-600" aria-hidden />
        <h2 className={styles.sectionTitle}>
          {t("workDay.problems.title")} ({problems.length})
        </h2>
      </div>
      {problems.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workDay.problems.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {problems.map((p) => (
            <li key={p.id} className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
              <div className="flex gap-3">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photoUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/app/projects/${p.projectId}`}
                    className="text-sm font-bold text-foreground hover:underline"
                  >
                    {p.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", priorityClass(p.priority))}>
                      {t(`workDay.problems.priority.${p.priority.toLowerCase()}`) !==
                      `workDay.problems.priority.${p.priority.toLowerCase()}`
                        ? t(`workDay.problems.priority.${p.priority.toLowerCase()}`)
                        : p.priority}
                    </span>
                    {p.reportedAt ? (
                      <span className="text-xs text-muted-foreground">
                        {formatTimeShort(p.reportedAt)}
                      </span>
                    ) : null}
                  </div>
                  {p.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-[#1D376A]">{p.projectName}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
