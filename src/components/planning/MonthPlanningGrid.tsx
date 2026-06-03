"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/I18nContext";
import type { PlanningDashboardData } from "@/services/planning";
import { planningProjectColor } from "@/services/planning";
import { dateOverlapsDay, parseIsoDateLocal } from "@/lib/planningDates";
import { PlanningEmptyState } from "./PlanningEmptyState";
import styles from "./planning.module.css";

type MonthPlanningGridProps = {
  data: PlanningDashboardData;
};

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function monthStartPadding(iso: string): number {
  const d = parseIsoDateLocal(iso);
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

export function MonthPlanningGrid({ data }: MonthPlanningGridProps) {
  const { t, locale } = useI18n();

  const monthTitle = useMemo(() => {
    const d = parseIsoDateLocal(data.monthLabelIso);
    return d.toLocaleDateString(locale === "sk" ? "sk-SK" : "en-GB", {
      month: "long",
      year: "numeric",
    });
  }, [data.monthLabelIso, locale]);

  const padding = monthStartPadding(data.monthDays[0] ?? data.monthLabelIso);

  const hasMonthData =
    data.tasksDueThisMonth.length > 0 ||
    (data.absencesStatus === "available" && data.absencesInMonth.length > 0);

  return (
    <div
      id="planning-panel-month"
      role="tabpanel"
      aria-labelledby="planning-tab-month"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#1D376A]">{monthTitle}</h2>
        <p className="text-xs text-muted-foreground">{t("planning.month.legendHint")}</p>
      </div>

      {!hasMonthData ? (
        <PlanningEmptyState
          title={t("planning.month.emptyTitle")}
          description={t("planning.month.emptyDesc")}
        />
      ) : null}

      <div className={styles.monthGrid} aria-label={t("planning.month.gridLabel")}>
        {WEEKDAY_KEYS.map((key) => (
          <div key={key} className={styles.monthWeekday}>
            {t(`planning.weekday.${key}`)}
          </div>
        ))}

        {Array.from({ length: padding }).map((_, i) => (
          <div key={`pad-${i}`} className={styles.monthDay} aria-hidden />
        ))}

        {data.monthDays.map((iso) => {
          const dayNum = parseIsoDateLocal(iso).getDate();
          const isToday = iso === data.todayIso;
          const tasks = data.tasksDueThisMonth.filter((task) => task.dueDate === iso);
          const absences =
            data.absencesStatus === "available"
              ? data.absencesInMonth.filter((a) =>
                  dateOverlapsDay(a.start, a.end, iso)
                )
              : [];

          return (
            <div
              key={iso}
              className={`${styles.monthDay} ${isToday ? styles.monthDayToday : ""}`}
            >
              <div className={styles.monthDayNum}>{dayNum}</div>
              <div className="mt-0.5 space-y-0.5">
                {tasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="truncate text-[0.625rem] font-medium text-[#1D376A]"
                    title={`${task.title} · ${task.projectName}`}
                  >
                    <span
                      className={styles.monthDot}
                      style={{ backgroundColor: planningProjectColor(task.projectId) }}
                      aria-hidden
                    />
                    {task.title}
                  </div>
                ))}
                {tasks.length > 3 ? (
                  <p className="text-[0.625rem] text-muted-foreground">
                    +{tasks.length - 3}
                  </p>
                ) : null}
                {absences.length > 0 ? (
                  <p className="text-[0.625rem] text-muted-foreground">
                    {t("planning.month.absenceCount", { count: absences.length })}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <PlanningEmptyState
        title={t("planning.month.milestonesPlaceholderTitle")}
        description={t("planning.month.milestonesPlaceholderDesc")}
        className="mt-2"
      />
    </div>
  );
}
