"use client";

import Link from "next/link";
import { Calendar, CalendarRange, HardHat, UserX, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectCardSummary, ProjectRiskStatus } from "@/lib/planningSummaryMetrics";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

type ProjectPlanningCardProps = {
  summary: ProjectCardSummary;
  selected?: boolean;
  ganttBasePath?: string;
  onEditDates?: (projectId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function riskBadgeClass(risk: ProjectRiskStatus): string {
  switch (risk) {
    case "blocked":
      return styles.projectCardRiskBlocked;
    case "delayed":
      return styles.projectCardRiskDelayed;
    case "risk":
      return styles.projectCardRiskWarn;
    default:
      return styles.projectCardRiskOk;
  }
}

export function ProjectPlanningCard({
  summary,
  selected,
  ganttBasePath = "/app/planning/gantt",
  onEditDates,
  t,
}: ProjectPlanningCardProps) {
  const avatars = summary.workerNames.slice(0, 5);
  const extraWorkers = summary.workerNames.length - avatars.length;
  const ganttHref = `${ganttBasePath}?projectId=${encodeURIComponent(summary.projectId)}`;

  return (
    <article
      className={cn(styles.projectCardVisual, selected && styles.projectCardSelected)}
    >
      <div className={styles.projectCardTop}>
        <h3 className={styles.projectCardTitle} title={summary.name}>
          {summary.name}
        </h3>
        <span className={cn(styles.projectCardRisk, riskBadgeClass(summary.risk))}>
          {t(`planning.risk.${summary.risk}`)}
        </span>
      </div>

      {summary.activePhaseName ? (
        <p className={styles.projectCardPhase} title={summary.activePhaseName}>
          {summary.activePhaseName}
        </p>
      ) : (
        <p className={styles.projectCardPhaseMuted}>{t("planning.empty.noPhases")}</p>
      )}

      <div className={styles.projectCardProgress}>
        <div className={styles.projectCardProgressTrack}>
          <span
            className={styles.projectCardProgressFill}
            style={{ width: `${summary.progress}%` }}
          />
        </div>
        <span className={styles.projectCardProgressLabel}>{summary.progress}%</span>
      </div>

      {summary.dateRangeLabel ? (
        <p className={styles.projectCardDateRange}>
          <CalendarRange className="mr-1 inline size-3.5 shrink-0" />
          {summary.dateRangeLabel}
        </p>
      ) : null}

      <div className={styles.projectCardStats}>
        <span title={t("planning.projectCard.openTasks")}>
          {summary.openTasks} {t("planning.projectCard.openTasksShort")}
        </span>
        {summary.overdueTasks > 0 ? (
          <span className={styles.projectCardStatWarn}>
            {summary.overdueTasks} {t("planning.projectCard.overdueShort")}
          </span>
        ) : null}
        {summary.equipmentCount > 0 ? (
          <span>
            <Wrench className="mr-0.5 inline size-3" />
            {summary.equipmentCount}
          </span>
        ) : null}
        {summary.unassignedTasks > 0 ? (
          <span className={styles.projectCardStatWarn}>
            <UserX className="mr-0.5 inline size-3" />
            {summary.unassignedTasks}
          </span>
        ) : null}
      </div>

      {avatars.length > 0 ? (
        <div className={styles.projectCardAvatars}>
          {avatars.map((name, i) => (
            <span
              key={`${summary.projectId}-w-${i}`}
              className={styles.projectCardAvatar}
              title={name}
            >
              {initials(name)}
            </span>
          ))}
          {extraWorkers > 0 ? (
            <span className={styles.projectCardAvatarMore}>+{extraWorkers}</span>
          ) : null}
        </div>
      ) : (
        <p className={styles.projectCardMuted}>
          <HardHat className="mr-1 inline size-3" />
          {t("planning.projectCard.noWorkers")}
        </p>
      )}

      {summary.nextPlannedLabel ? (
        <p className={styles.projectCardNext} title={summary.nextPlannedLabel}>
          <Calendar className="mr-1 inline size-3 shrink-0" />
          {summary.nextPlannedLabel}
        </p>
      ) : null}

      <div className={styles.projectCardActions}>
        <Button asChild size="sm" className="flex-1 bg-[#1D376A] hover:bg-[#162d58]">
          <Link href={ganttHref}>{t("planning.projectCard.openPlan")}</Link>
        </Button>
        {onEditDates ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onEditDates(summary.projectId)}
          >
            {t("planning.projectCard.editDates")}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link href={ganttHref}>{t("planning.projectCard.editDates")}</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
