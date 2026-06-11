"use client";

import Link from "next/link";
import type { UnassignedWorkGroup } from "@/lib/operationsMetrics";

type Props = {
  groups: UnassignedWorkGroup[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function UnassignedWorkPanel({ groups, t }: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("operations.unassignedWork")}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.attention.emptyCompany")}</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.projectId} className="rounded-lg border border-border bg-background p-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{group.projectName}</p>
                <Link href={`/app/projects/${group.projectId}`} className="text-xs text-primary hover:underline">
                  {t("operations.openProject")}
                </Link>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                {group.withoutCrew ? <span>{t("operations.projectsWithoutCrew")}</span> : null}
                {group.tasksWithoutAssignee > 0 ? (
                  <span>{t("operations.tasksWithoutAssignee")}: {group.tasksWithoutAssignee}</span>
                ) : null}
                {group.tasksWithoutTools > 0 ? (
                  <span>{t("operations.tasksWithoutTools")}: {group.tasksWithoutTools}</span>
                ) : null}
                {group.tasksWithoutDate > 0 ? (
                  <span>{t("operations.alerts.tasksWithoutDate")}: {group.tasksWithoutDate}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
