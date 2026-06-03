"use client";

import { Fragment } from "react";
import { useI18n } from "@/i18n/I18nContext";
import type { PlanningDashboardData } from "@/services/planning";
import { planningProjectColor } from "@/services/planning";
import { dateOverlapsDay } from "@/lib/planningDates";
import { PlanningEmptyState } from "./PlanningEmptyState";
import styles from "./planning.module.css";

type WeekPlanningBoardProps = {
  data: PlanningDashboardData;
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function WeekPlanningBoard({ data }: WeekPlanningBoardProps) {
  const { t, locale } = useI18n();

  const hasAssignmentData =
    data.activeProjects.some((p) => p.assignedMemberIds.length > 0) ||
    data.tasksDueThisWeek.length > 0 ||
    (data.absencesStatus === "available" && data.absencesInWeek.length > 0);

  const formatDayHeader = (iso: string, index: number) => {
    const d = new Date(iso + "T12:00:00");
    const weekday = t(`planning.weekday.${WEEKDAY_KEYS[index]}`);
    const dayNum = d.toLocaleDateString(locale === "sk" ? "sk-SK" : "en-GB", {
      day: "numeric",
      month: "short",
    });
    return { weekday, dayNum };
  };

  if (!hasAssignmentData) {
    return (
      <div
        id="planning-panel-week"
        role="tabpanel"
        aria-labelledby="planning-tab-week"
      >
        <PlanningEmptyState
          title={t("planning.week.emptyTitle")}
          description={t("planning.week.emptyDesc")}
        />
        <p className="mt-3 text-xs text-muted-foreground text-center">
          {t("planning.week.futureHint")}
        </p>
      </div>
    );
  }

  const memberRows = data.members.filter((m) => m.assignedProjectCount > 0);
  const jobRows = data.activeProjects;

  return (
    <div
      id="planning-panel-week"
      role="tabpanel"
      aria-labelledby="planning-tab-week"
      className="space-y-3"
    >
      <p className="text-xs text-muted-foreground">{t("planning.week.readOnlyHint")}</p>
      <div className={styles.weekBoard}>
        <div className={styles.weekGrid}>
          <div className={styles.weekHeadCell}>{t("planning.week.resource")}</div>
          {data.weekDays.map((iso, i) => {
            const { weekday, dayNum } = formatDayHeader(iso, i);
            const isToday = iso === data.todayIso;
            return (
              <div
                key={iso}
                className={`${styles.weekHeadCell} ${isToday ? styles.weekHeadCellToday : ""}`}
              >
                <div>{weekday}</div>
                <div className="text-[0.625rem] font-semibold normal-case tracking-normal opacity-80">
                  {dayNum}
                </div>
              </div>
            );
          })}

          {memberRows.map((member) => (
            <Fragment key={member.uid}>
              <div className={styles.weekRowLabel}>
                <span>{member.displayName}</span>
                <span className={styles.weekRowSub}>{t("planning.week.memberRow")}</span>
              </div>
              {data.weekDays.map((iso) => {
                const isToday = iso === data.todayIso;
                const projects = data.activeProjects.filter((p) =>
                  p.assignedMemberIds.includes(member.uid)
                );
                const tasks = data.tasksDueThisWeek.filter(
                  (task) =>
                    task.assigneeId === member.uid && task.dueDate === iso
                );
                const absences =
                  data.absencesStatus === "available"
                    ? data.absencesInWeek.filter(
                        (a) =>
                          a.userId === member.uid &&
                          dateOverlapsDay(a.start, a.end, iso)
                      )
                    : [];

                return (
                  <div
                    key={`${member.uid}-${iso}`}
                    className={`${styles.weekCell} ${isToday ? styles.weekCellToday : ""}`}
                  >
                    {absences.map((a) => (
                      <span
                        key={a.id}
                        className={`${styles.weekChip} ${styles.weekChipAbsence}`}
                        title={t("planning.week.absence")}
                      >
                        {t("planning.week.absence")}
                      </span>
                    ))}
                    {projects.map((p) => (
                      <span
                        key={p.project.id}
                        className={styles.weekChip}
                        style={{ backgroundColor: planningProjectColor(p.project.id) }}
                        title={p.project.name}
                      >
                        {p.project.name}
                      </span>
                    ))}
                    {tasks.map((task) => (
                      <span
                        key={task.id}
                        className={`${styles.weekChip} ${styles.weekChipTask}`}
                        title={task.title}
                      >
                        {task.title}
                      </span>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}

          {jobRows.map((ps) => (
            <Fragment key={ps.project.id}>
              <div className={styles.weekRowLabel}>
                <span>{ps.project.name}</span>
                <span className={styles.weekRowSub}>{t("planning.week.jobRow")}</span>
              </div>
              {data.weekDays.map((iso) => {
                const isToday = iso === data.todayIso;
                const dueTasks = data.tasksDueThisWeek.filter(
                  (task) => task.projectId === ps.project.id && task.dueDate === iso
                );
                const hasCrew = ps.assignedMemberIds.length > 0;

                return (
                  <div
                    key={`${ps.project.id}-${iso}`}
                    className={`${styles.weekCell} ${isToday ? styles.weekCellToday : ""}`}
                  >
                    {hasCrew ? (
                      <span
                        className={styles.weekChip}
                        style={{ backgroundColor: planningProjectColor(ps.project.id) }}
                        title={ps.assignedMemberNames.join(", ")}
                      >
                        {ps.assignedMemberNames.length}{" "}
                        {t("planning.week.crewShort")}
                      </span>
                    ) : null}
                    {dueTasks.map((task) => (
                      <span
                        key={task.id}
                        className={`${styles.weekChip} ${styles.weekChipTask}`}
                        title={task.title}
                      >
                        {task.title}
                      </span>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
