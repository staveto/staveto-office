"use client";

import Link from "next/link";
import type { ProjectInvestmentCard } from "@/lib/operationsMetrics";
import { toHoursMinutes } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  projects: ProjectInvestmentCard[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectInvestmentPanel({ projects, t }: Props) {
  return (
    <section className={styles.sectionCard}>
      <p className={styles.sectionIntent}>{t("operations.layout.intent.investment")}</p>
      <h2 className={cn(styles.sectionTitle, "mb-4")}>{t("operations.investment.title")}</h2>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operations.investment.empty")}</p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <article key={p.projectId} className={styles.investmentCard}>
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/app/projects/${p.projectId}`}
                  className="text-sm font-bold text-[#1D376A] hover:underline dark:text-slate-100"
                >
                  {p.projectName}
                </Link>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {toHoursMinutes(p.totalMinutes)}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t("operations.investment.completion", { percent: p.completionPercent })}
                </span>
                <span>·</span>
                <span>
                  {t("operations.investment.tasks", {
                    done: p.doneCount,
                    total: p.taskCount,
                  })}
                </span>
              </div>

              <div className={cn(styles.progressRing, "mt-2")}>
                <div
                  className={styles.progressRingFill}
                  style={{ width: `${p.completionPercent}%` }}
                />
              </div>

              {p.byMember.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {p.byMember.slice(0, 5).map((m) => (
                    <li
                      key={m.userId}
                      className="rounded-md bg-white px-2 py-1 text-xs ring-1 ring-border dark:bg-slate-800"
                    >
                      <span className="font-medium">{m.userName}</span>{" "}
                      <span className="text-muted-foreground tabular-nums">
                        {toHoursMinutes(m.minutes)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
