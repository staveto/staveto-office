"use client";

import type { GanttTimeline } from "@/lib/ganttTimeline";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

type Props = {
  timeline: GanttTimeline;
  fillWidth?: boolean;
};

export function GanttTimelineHeader({ timeline, fillWidth = false }: Props) {
  return (
    <div
      className={styles.dayHeader}
      style={fillWidth ? { width: "100%" } : { width: timeline.totalWidthPx }}
    >
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
          <div>{day.shortLabel}</div>
        </div>
      ))}
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
          className={cn(styles.gridBgCell, day.isWeekend && styles.gridBgCellWeekend)}
          style={{ width: timeline.dayWidthPx }}
        />
      ))}
      {todayLeft != null ? (
        <div className={styles.todayLine} style={{ left: todayLeft }} />
      ) : null}
    </div>
  );
}
