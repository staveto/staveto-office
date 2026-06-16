"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { GanttBarStatus, GanttTimeline } from "@/lib/ganttTimeline";
import { barStyleFromRange, getGanttStatusColor } from "@/lib/ganttTimeline";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

export type GanttBarKind = "project" | "phase" | "task";

export type GanttBarTooltip = {
  title: string;
  dateRange?: string;
  assignee?: string;
  statusLabel?: string;
  meta?: string;
};

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
  tooltipData?: GanttBarTooltip;
  assigneeName?: string;
  dragOffsetPx?: number;
  isDragging?: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (edge: "start" | "end", e: React.MouseEvent) => void;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  tooltipData,
  assigneeName,
  dragOffsetPx = 0,
  isDragging,
  onDragStart,
  onResizeStart,
}: Props) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
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

  const showAvatar = kind === "task" && !!assigneeName && geom.width >= 56;

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHover({ x: rect.left + rect.width / 2, y: rect.top });
  };
  const handleLeave = () => setHover(null);

  const tooltipCard =
    hover && !isDragging && (tooltipData || tooltip)
      ? createPortal(
          <div
            className={styles.tooltipCard}
            style={{ left: hover.x, top: hover.y }}
            role="tooltip"
          >
            {tooltipData ? (
              <>
                <div className={styles.tooltipHead}>
                  <span
                    className={styles.tooltipDot}
                    style={{ background: color }}
                    aria-hidden
                  />
                  <span className={styles.tooltipTitle}>{tooltipData.title}</span>
                </div>
                {tooltipData.dateRange ? (
                  <div className={styles.tooltipRow}>{tooltipData.dateRange}</div>
                ) : null}
                {tooltipData.assignee ? (
                  <div className={styles.tooltipRow}>{tooltipData.assignee}</div>
                ) : null}
                {tooltipData.statusLabel ? (
                  <div className={styles.tooltipRow}>{tooltipData.statusLabel}</div>
                ) : null}
                {tooltipData.meta ? (
                  <div className={styles.tooltipMeta}>{tooltipData.meta}</div>
                ) : null}
              </>
            ) : (
              <div className={styles.tooltipTitle}>{tooltip}</div>
            )}
          </div>,
          document.body
        )
      : null;

  const bar = isMilestone ? (
    <div
      className={cn(styles.milestone, isDragging && styles.barDragging, !canEdit && "cursor-default")}
      style={{ left: left + geom.width / 2 - 9 }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
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
      {tooltipCard}
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
        status === "blocked" && styles.barBlocked,
        isDragging && styles.barDragging,
        !canEdit && "cursor-default"
      )}
      style={{
        left,
        width: geom.width,
        background: kind === "project" ? undefined : color,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
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
          style={{ width: `${donePct}%` }}
        />
      ) : null}
      {showAvatar ? (
        <span className={styles.barAvatar} title={assigneeName}>
          {initialsOf(assigneeName!)}
        </span>
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
      {tooltipCard}
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
