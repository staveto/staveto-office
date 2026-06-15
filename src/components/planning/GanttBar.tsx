"use client";

import Link from "next/link";
import type { GanttBarStatus, GanttTimeline } from "@/lib/ganttTimeline";
import { barStyleFromRange, getGanttStatusColor } from "@/lib/ganttTimeline";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

export type GanttBarKind = "project" | "phase" | "task";

type Props = {
  kind: GanttBarKind;
  label: string;
  startYmd?: string;
  endYmd?: string;
  status: GanttBarStatus;
  progress?: number;
  timeline: GanttTimeline;
  canEdit: boolean;
  canResize?: boolean;
  href?: string;
  tooltip?: string;
  dragOffsetPx?: number;
  isDragging?: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (edge: "start" | "end", e: React.MouseEvent) => void;
};

export function GanttBar({
  kind,
  label,
  startYmd,
  endYmd,
  status,
  progress,
  timeline,
  canEdit,
  canResize,
  href,
  tooltip,
  dragOffsetPx = 0,
  isDragging,
  onDragStart,
  onResizeStart,
}: Props) {
  const geom = barStyleFromRange(startYmd, endYmd, timeline);
  if (!geom.visible) return null;

  const isMilestone =
    kind === "task" && startYmd === endYmd && !canResize && status !== "done";
  const color = kind === "project" ? "#1D376A" : getGanttStatusColor(status);
  const left = geom.left + dragOffsetPx;
  const donePct =
    kind === "project" && typeof progress === "number"
      ? Math.min(100, Math.max(0, progress))
      : status === "done"
        ? 100
        : status === "active"
          ? 55
          : 0;

  const bar = isMilestone ? (
    <div
      className={cn(styles.milestone, isDragging && styles.barDragging, !canEdit && "cursor-default")}
      style={{ left: left + geom.width / 2 - 9 }}
      title={tooltip ?? label}
      onMouseDown={
        canEdit && onDragStart
          ? (e) => {
              e.preventDefault();
              onDragStart(e);
            }
          : undefined
      }
      role="presentation"
    >
      <span
        className={styles.milestoneDiamond}
        style={{ background: color, borderColor: color }}
      />
    </div>
  ) : (
    <div
      className={cn(
        styles.bar,
        kind === "project" && styles.barProject,
        kind === "phase" && styles.barPhase,
        kind === "task" && styles.barTask,
        status === "done" && styles.barDone,
        status === "overdue" && styles.barOverdue,
        isDragging && styles.barDragging,
        !canEdit && "cursor-default"
      )}
      style={{
        left,
        width: geom.width,
        background: kind === "project" ? undefined : color,
      }}
      title={tooltip ?? label}
      onMouseDown={
        canEdit && onDragStart
          ? (e) => {
              e.preventDefault();
              onDragStart(e);
            }
          : undefined
      }
      role="presentation"
    >
      {donePct > 0 && kind !== "phase" ? (
        <span
          className={styles.barProgress}
          style={{ width: `${donePct}%`, background: color }}
        />
      ) : null}
      <span className={styles.barLabel}>
        {kind === "project" && typeof progress === "number" ? `${progress}%` : label}
      </span>
      {canEdit && canResize && onResizeStart ? (
        <>
          <span
            className={cn(styles.resizeHandle, styles.resizeHandleStart)}
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart("start", e);
            }}
          />
          <span
            className={cn(styles.resizeHandle, styles.resizeHandleEnd)}
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart("end", e);
            }}
          />
        </>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="contents" onClick={(e) => isDragging && e.preventDefault()}>
        {bar}
      </Link>
    );
  }
  return bar;
}
