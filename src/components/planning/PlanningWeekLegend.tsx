"use client";

import { Info } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import type { PlanningDataSourceStatus } from "@/services/planning";
import styles from "./planning.module.css";

type PlanningWeekLegendProps = {
  absencesStatus: PlanningDataSourceStatus;
  timeEntriesStatus: PlanningDataSourceStatus;
};

export function PlanningWeekLegend({
  absencesStatus,
  timeEntriesStatus,
}: PlanningWeekLegendProps) {
  const { t } = useI18n();
  const soon = t("sidebar.comingSoon");

  return (
    <aside className={styles.weekCalendarLegend} aria-label={t("planning.calendar.legend.ariaLabel")}>
      <div className={styles.weekCalendarLegendIntro}>
        <Info className="size-3.5 shrink-0 text-[#1D376A]/45 mt-0.5" aria-hidden />
        <p className={styles.weekCalendarLegendText}>{t("planning.calendar.phaseIntro")}</p>
      </div>
      <ul className={styles.weekCalendarLegendItems}>
        <li className={styles.weekCalendarLegendItem}>
          <span
            className={`${styles.weekCalendarLegendSwatch} ${styles.weekCalendarLegendSwatchTask}`}
            aria-hidden
          />
          <span>{t("planning.calendar.legend.task")}</span>
        </li>
        <li className={styles.weekCalendarLegendItem}>
          <span
            className={`${styles.weekCalendarLegendSwatch} ${styles.weekCalendarLegendSwatchAbsence}`}
            aria-hidden
          />
          <span>
            {t("planning.calendar.legend.absence")}
            {absencesStatus === "unavailable" ? (
              <span className={styles.weekCalendarLegendSoon}> · {soon}</span>
            ) : null}
          </span>
        </li>
        <li className={styles.weekCalendarLegendItem}>
          <span
            className={`${styles.weekCalendarLegendSwatch} ${styles.weekCalendarLegendSwatchAttendance}`}
            aria-hidden
          />
          <span>
            {t("planning.calendar.legend.attendance")}
            {timeEntriesStatus !== "available" ? (
              <span className={styles.weekCalendarLegendSoon}> · {soon}</span>
            ) : null}
          </span>
        </li>
        <li className={styles.weekCalendarLegendItem}>
          <span
            className={`${styles.weekCalendarLegendSwatch} ${styles.weekCalendarLegendSwatchPlanned}`}
            aria-hidden
          />
          <span>
            {t("planning.calendar.legend.plannedWork")}
            <span className={styles.weekCalendarLegendSoon}> · {soon}</span>
          </span>
        </li>
      </ul>
    </aside>
  );
}
