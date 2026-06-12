"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { UnassignedWorkGroup } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  groups: UnassignedWorkGroup[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function OperationsUnassignedPanel({ groups, t }: Props) {
  return (
    <section className={styles.sectionCard}>
      <p className={styles.sectionIntent}>{t("operations.layout.intent.unassigned")}</p>
      <h2 className={cn(styles.sectionTitle, "mb-4")}>{t("operations.unassignedWork")}</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operations.unassigned.allClear")}</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.projectId}
              className="rounded-xl border border-border bg-background p-3 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{group.projectName}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.withoutCrew ? (
                      <Badge label={t("operations.projectsWithoutCrew")} />
                    ) : null}
                    {group.tasksWithoutAssignee > 0 ? (
                      <Badge
                        label={`${group.tasksWithoutAssignee} ${t("operations.tasksWithoutAssignee")}`}
                      />
                    ) : null}
                    {group.tasksWithoutTools > 0 ? (
                      <Badge
                        label={`${group.tasksWithoutTools} ${t("operations.tasksWithoutTools")}`}
                      />
                    ) : null}
                    {group.tasksWithoutDate > 0 ? (
                      <Badge
                        label={`${group.tasksWithoutDate} ${t("operations.alerts.tasksWithoutDate")}`}
                      />
                    ) : null}
                  </div>
                </div>
                <Link
                  href={`/app/projects/${group.projectId}?tab=tasks`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#1D376A] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1D376A]/90"
                >
                  {t("operations.quickAssign")}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800">
      <AlertCircle className="size-3" aria-hidden />
      {label}
    </span>
  );
}
