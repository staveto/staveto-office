"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { getCompanyRoleLabelKey } from "@/lib/companyRoles";
import type { PlanningDashboardData } from "@/services/planning";
import { PlanningEmptyState } from "./PlanningEmptyState";
import { PlanningStatusBadge } from "./PlanningStatusBadge";
import styles from "./planning.module.css";

type TodayPlanningPanelProps = {
  data: PlanningDashboardData;
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

export function TodayPlanningPanel({ data }: TodayPlanningPanelProps) {
  const { t } = useI18n();

  const workingMembers = data.members.filter((m) => m.todayStatus === "working");
  const absentMembers = data.members.filter((m) => m.todayStatus === "absent");
  const projectsWithCrew = data.activeProjects.filter(
    (p) => p.assignedMemberIds.length > 0
  );

  return (
    <div
      id="planning-panel-today"
      role="tabpanel"
      aria-labelledby="planning-tab-today"
      className="space-y-4"
    >
      {data.alerts.length > 0 ? (
        <section aria-label={t("planning.today.alerts")}>
          <ul className="space-y-2">
            {data.alerts.map((alert) => {
              const className =
                alert.kind === "warning"
                  ? styles.alertWarning
                  : alert.kind === "info"
                    ? styles.alertInfo
                    : styles.alertPlaceholder;
              const Icon = alert.kind === "warning" ? AlertTriangle : Info;
              const params: Record<string, number> = {};
              if (alert.id === "tasks-today") {
                params.count = data.tasksDueToday.length;
              }
              if (alert.id === "unassigned-jobs") {
                params.count = data.activeProjects.filter(
                  (p) => p.assignedMemberIds.length === 0
                ).length;
              }
              const message = t(alert.messageKey, params);
              const inner = (
                <>
                  <Icon className="size-4 shrink-0 mt-0.5" aria-hidden />
                  <span>{message}</span>
                </>
              );
              if (alert.href) {
                return (
                  <li key={alert.id}>
                    <Link
                      href={alert.href}
                      className={`${styles.alertItem} ${className} block hover:opacity-90`}
                    >
                      {inner}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={alert.id} className={`${styles.alertItem} ${className}`}>
                  {inner}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("planning.today.working")}>
          {data.timeEntriesStatus === "unavailable" ? (
            <PlanningEmptyState
              title={t("planning.today.timeUnavailableTitle")}
              description={t("planning.today.timeUnavailableDesc")}
            />
          ) : workingMembers.length === 0 ? (
            <PlanningEmptyState
              title={t("planning.today.noWorkingTitle")}
              description={t("planning.today.noWorkingDesc")}
            />
          ) : (
            <ul className="space-y-0">
              {workingMembers.map((m) => (
                <li key={m.uid} className={styles.listRow}>
                  <div>
                    <p className="text-sm font-medium text-[#1D376A]">{m.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(getCompanyRoleLabelKey(m.effectiveRole))}
                    </p>
                  </div>
                  <PlanningStatusBadge status={m.todayStatus} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("planning.today.absent")}>
          {data.absencesStatus === "unavailable" ? (
            <PlanningEmptyState
              title={t("planning.today.absencesUnavailableTitle")}
              description={t("planning.today.absencesUnavailableDesc")}
            />
          ) : absentMembers.length === 0 ? (
            <PlanningEmptyState
              title={t("planning.today.noAbsentTitle")}
              description={t("planning.today.noAbsentDesc")}
            />
          ) : (
            <ul className="space-y-0">
              {absentMembers.map((m) => (
                <li key={m.uid} className={styles.listRow}>
                  <p className="text-sm font-medium text-[#1D376A]">{m.displayName}</p>
                  <PlanningStatusBadge status={m.todayStatus} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("planning.today.jobsWithCrew")}>
          {projectsWithCrew.length === 0 ? (
            <PlanningEmptyState
              title={t("planning.today.noJobsWithCrewTitle")}
              description={t("planning.today.noJobsWithCrewDesc")}
            />
          ) : (
            <ul className="space-y-0">
              {projectsWithCrew.map((ps) => (
                <li key={ps.project.id} className={styles.listRow}>
                  <div>
                    <Link
                      href={`/app/projects/${ps.project.id}`}
                      className="text-sm font-medium text-[#1D376A] hover:underline"
                    >
                      {ps.project.name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ps.assignedMemberNames.join(", ")}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    {ps.assignedMemberIds.length}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("planning.today.tasksDue")}>
          {data.tasksDueToday.length === 0 ? (
            <PlanningEmptyState
              title={t("planning.today.noTasksTitle")}
              description={t("planning.today.noTasksDesc")}
            />
          ) : (
            <ul className="space-y-0">
              {data.tasksDueToday.map((task) => (
                <li key={task.id} className={styles.listRow}>
                  <div>
                    <p className="text-sm font-medium text-[#1D376A]">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.projectName}
                      {task.assigneeName ? ` · ${task.assigneeName}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
