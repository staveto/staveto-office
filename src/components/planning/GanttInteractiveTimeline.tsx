"use client";

import { useState } from "react";
import type { GanttTimeline } from "@/lib/ganttTimeline";
import { GanttGridBackground } from "./GanttTimelineHeader";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

type Props = {
  timeline: GanttTimeline;
  canEdit: boolean;
  fillWidth?: boolean;
  /** When set, empty rows show clickable day cells (ClickUp-style scheduling). */
  onPickDay?: (ymd: string) => void;
  pickHint?: string;
  children?: React.ReactNode;
  className?: string;
};

export function GanttInteractiveTimeline({
  timeline,
  canEdit,
  fillWidth = false,
  onPickDay,
  pickHint,
  children,
  className,
}: Props) {
  const [hoverYmd, setHoverYmd] = useState<string | null>(null);
  const interactive = canEdit && !!onPickDay;

  return (
    <div
      className={cn(styles.rowTimeline, fillWidth && styles.rowTimelineFill, className)}
      style={fillWidth ? undefined : { width: timeline.totalWidthPx }}
    >
      <GanttGridBackground timeline={timeline} fillWidth={fillWidth} />
      {interactive ? (
        <div className={styles.dayHitLayer} aria-hidden={false}>
          {timeline.days.map((day) => (
            <button
              key={day.ymd}
              type="button"
              className={cn(
                styles.dayHit,
                day.isWeekend && styles.dayHitWeekend,
                hoverYmd === day.ymd && styles.dayHitActive,
                day.isToday && styles.dayHitToday
              )}
              style={{ width: timeline.dayWidthPx }}
              title={pickHint}
              aria-label={pickHint ? `${pickHint} — ${day.shortLabel}` : day.shortLabel}
              onMouseEnter={() => setHoverYmd(day.ymd)}
              onMouseLeave={() => setHoverYmd(null)}
              onClick={() => onPickDay?.(day.ymd)}
            />
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}
