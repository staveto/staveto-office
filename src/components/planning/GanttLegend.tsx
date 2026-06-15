"use client";

import { getGanttStatusColor } from "@/lib/ganttTimeline";
import styles from "./gantt.module.css";

type Props = {
  t: (key: string) => string;
};

const ITEMS = ["done", "active", "open", "overdue", "blocked", "unassigned"] as const;

export function GanttLegend({ t }: Props) {
  return (
    <div className={styles.legend} aria-label={t("gantt.legend.title")}>
      {ITEMS.map((key) => (
        <span key={key}>
          <span
            className={styles.legendDot}
            style={{ background: getGanttStatusColor(key) }}
          />
          {t(`gantt.legend.${key}`)}
        </span>
      ))}
      <span>
        <span className={styles.legendMilestone} aria-hidden />
        {t("gantt.legend.milestone")}
      </span>
    </div>
  );
}
