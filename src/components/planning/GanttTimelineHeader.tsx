"use client";

import type { GanttTimeline } from "@/lib/ganttTimeline";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

type Props = {
  timeline: GanttTimeline;
  fillWidth?: boolean;
};

export function GanttTimelineHeader({ timeline, fillWidth = false }: Props) {
  const showWeekday = timeline.dayWidthPx >= 26;
  const compact = timeline.dayWidthPx < 20;

  return (
    <div
      className={styles.headerStack}
      style={fillWidth ? { width: "100%" } : { width: timeline.totalWidthPx }}
    >
      <div className={styles.monthBand}>
        {timeline.months.map((seg) => (
          <div key={seg.key} className={styles.monthSeg} style={{ width: seg.widthPx }}>
            <span className={styles.monthSegLabel}>{seg.label}</span>
          </div>
        ))}
      </div>
      <div className={styles.dayHeader}>
        {timeline.days.map((day) => (
          <div
            key={day.ymd}
            className={cn(
              styles.dayCell,
              day.isWeekend && styles.dayCellWeekend,
              day.isToday && styles.dayCellToday
            )}
            style={{ width: timeline.dayWidthPx }}
          >
            {showWeekday ? (
              <span className={styles.dayWeekday}>{day.weekdayLabel}</span>
            ) : null}
            <span className={cn(styles.dayNum, compact && styles.dayNumCompact)}>
              {day.dayNum}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GanttGridBackground({ timeline, fillWidth = false }: Props) {
  const todayIdx = timeline.days.findIndex((d) => d.isToday);
  const todayLeft =
    todayIdx >= 0 ? todayIdx * timeline.dayWidthPx + timeline.dayWidthPx / 2 : null;

  return (
    <div
      className={styles.gridBg}
      style={fillWidth ? { width: "100%" } : { width: timeline.totalWidthPx }}
    >
      {timeline.days.map((day) => (
        <div
          key={day.ymd}
          className={cn(
            styles.gridBgCell,
            day.isWeekend && styles.gridBgCellWeekend,
            day.isMonthStart && styles.gridBgCellMonthStart,
            day.isToday && styles.gridBgCellToday
          )}
          style={{ width: timeline.dayWidthPx }}
        />
      ))}
      {todayLeft != null ? (
        <div className={styles.todayLine} style={{ left: todayLeft }} />
      ) : null}
    </div>
  );
}
