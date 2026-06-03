"use client";

import { useI18n } from "@/i18n/I18nContext";
import { getCompanyRoleLabelKey } from "@/lib/companyRoles";
import type { PlanningDashboardData } from "@/services/planning";
import { PlanningEmptyState } from "./PlanningEmptyState";
import { PlanningStatusBadge } from "./PlanningStatusBadge";
import styles from "./planning.module.css";

type TeamPlanningPanelProps = {
  data: PlanningDashboardData;
};

const WORKLOAD_CAP = 5;

export function TeamPlanningPanel({ data }: TeamPlanningPanelProps) {
  const { t } = useI18n();

  if (data.members.length === 0) {
    return (
      <div
        id="planning-panel-team"
        role="tabpanel"
        aria-labelledby="planning-tab-team"
      >
        <PlanningEmptyState
          title={t("planning.team.emptyTitle")}
          description={t("planning.team.emptyDesc")}
        />
      </div>
    );
  }

  return (
    <div
      id="planning-panel-team"
      role="tabpanel"
      aria-labelledby="planning-tab-team"
      className={styles.panel}
    >
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{t("planning.team.title")}</h2>
      </div>
      <div className={styles.panelBody}>
        <ul className="space-y-0">
          {data.members.map((member) => {
            const workloadPct = Math.min(
              100,
              Math.round((member.assignedProjectCount / WORKLOAD_CAP) * 100)
            );
            return (
              <li key={member.uid} className={styles.listRow}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1D376A] truncate">
                    {member.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(getCompanyRoleLabelKey(member.effectiveRole))}
                    {" · "}
                    {t("planning.team.projectCount", {
                      count: member.assignedProjectCount,
                    })}
                  </p>
                  <div
                    className={styles.workloadBar}
                    role="progressbar"
                    aria-valuenow={workloadPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t("planning.team.workloadAria")}
                  >
                    <div
                      className={styles.workloadFill}
                      style={{ width: `${workloadPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.625rem] text-muted-foreground">
                    {t("planning.team.workloadPlaceholder")}
                  </p>
                </div>
                <PlanningStatusBadge status={member.todayStatus} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
