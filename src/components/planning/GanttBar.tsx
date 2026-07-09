"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Building2, Car, Cog, Package, Wrench } from "lucide-react";
import type { GanttBarStatus, GanttTimeline, GanttAssignedTool } from "@/lib/ganttTimeline";
import { barStyleFromRange, getGanttStatusColor } from "@/lib/ganttTimeline";
import {
  getGanttBarLabelMode,
  type GanttBarTooltipData,
} from "@/lib/ganttBarDisplay";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

export type GanttBarKind = "project" | "phase" | "task";

export type GanttBarTooltip = GanttBarTooltipData;

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
  isMilestone?: boolean;
  href?: string;
  tooltip?: string;
  tooltipData?: GanttBarTooltip;
  assigneeName?: string;
  assignedTools?: GanttAssignedTool[];
  dragOffsetPx?: number;
  isDragging?: boolean;
  resizeEdge?: "start" | "end" | null;
  resizeOffsetPx?: number;
  isResizing?: boolean;
  onDragStart?: (e: React.MouseEvent) => void;
  onResizeStart?: (edge: "start" | "end", e: React.MouseEvent) => void;
  onSelect?: () => void;
  onEditDates?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  resizeTooltips?: { start?: string; end?: string; move?: string };
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toolIcon(type?: string | null) {
  switch (type) {
    case "vehicle":
      return Car;
    case "machine":
      return Cog;
    case "building":
      return Building2;
    case "tool":
      return Wrench;
    default:
      return Package;
  }
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
  isMilestone: isMilestoneProp,
  href,
  tooltip,
  tooltipData,
  assigneeName,
  assignedTools,
  dragOffsetPx = 0,
  isDragging,
  resizeEdge = null,
  resizeOffsetPx = 0,
  isResizing,
  onDragStart,
  onResizeStart,
  onSelect,
  onEditDates,
  onContextMenu,
  isSelected,
  resizeTooltips,
}: Props) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const geom = barStyleFromRange(startYmd, endYmd, timeline);
  if (!geom.visible) return null;

  const isMilestone =
    kind === "task" && !!isMilestoneProp && startYmd === endYmd && status !== "done";
  const minBarWidth = Math.max(12, timeline.dayWidthPx * 0.55);
  const color = kind === "project" ? "#1D376A" : getGanttStatusColor(status);
  let left = geom.left + dragOffsetPx;
  let width = geom.width;
  if (resizeEdge === "start" && resizeOffsetPx !== 0) {
    left += resizeOffsetPx;
    width -= resizeOffsetPx;
  } else if (resizeEdge === "end" && resizeOffsetPx !== 0) {
    width += resizeOffsetPx;
  }
  width = Math.max(width, minBarWidth);
  const labelMode = getGanttBarLabelMode(width);
  const showInternalLabel = labelMode === "full";
  const showCompactDot = labelMode === "compact";
  const donePct =
    kind === "project" && typeof progress === "number"
      ? Math.min(100, Math.max(0, progress))
      : status === "done"
        ? 100
        : status === "active"
          ? 55
          : 0;

  const showAvatar =
    kind === "task" && !!assigneeName && labelMode !== "compact" && width >= 48;
  const tools = kind === "task" ? (assignedTools ?? []) : [];
  const maxToolIcons =
    labelMode === "full" && width >= 120 ? 2 : labelMode === "hidden" && width >= 60 ? 1 : 0;
  const visibleTools = tools.slice(0, maxToolIcons);
  const extraTools = tools.length - visibleTools.length;

  const handleEnter = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHover({ x: rect.left + rect.width / 2, y: rect.top });
  };
  const handleLeave = () => setHover(null);

  const tooltipCard =
    hover && !isDragging && !isResizing && (tooltipData || tooltip)
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
                {tooltipData.durationLabel ? (
                  <div className={styles.tooltipRow}>{tooltipData.durationLabel}</div>
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
      onDoubleClick={
        onEditDates
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditDates();
            }
          : undefined
      }
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e);
            }
          : undefined
      }
      onMouseDown={
        canEdit && onDragStart
          ? (e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
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
        isResizing && styles.barResizing,
        canEdit && canResize && styles.barResizable,
        isSelected && styles.barSelected,
        showCompactDot && styles.barCompact,
        !canEdit && "cursor-default"
      )}
      style={{
        left,
        width,
        background: kind === "project" ? undefined : color,
      }}
      title={canEdit && resizeTooltips?.move ? resizeTooltips.move : undefined}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={
        !canEdit && onSelect
          ? (e) => {
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      onDoubleClick={
        onEditDates
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditDates();
            }
          : undefined
      }
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e);
            }
          : undefined
      }
      onMouseDown={
        canEdit && onDragStart
          ? (e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
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
      {visibleTools.length > 0 ? (
        <span className={styles.barToolIcons} aria-hidden>
          {visibleTools.map((tool) => {
            const Icon = toolIcon(tool.type);
            return (
              <span key={tool.id} className={styles.barToolIcon} title={tool.name}>
                <Icon className="size-2.5" strokeWidth={2.25} />
              </span>
            );
          })}
          {extraTools > 0 ? (
            <span className={styles.barToolMore}>+{extraTools}</span>
          ) : null}
        </span>
      ) : null}
      {showCompactDot ? (
        <span className={styles.barCompactDot} style={{ background: color }} aria-hidden />
      ) : null}
      {showInternalLabel ? (
        <span className={styles.barLabel}>
          {kind === "project" && typeof progress === "number" ? `${progress}%` : label}
        </span>
      ) : null}
      {canEdit && canResize && onResizeStart ? (
        <>
          <span
            className={cn(styles.resizeHandle, styles.resizeHandleStart, styles.resizeHandleVisible)}
            style={{ cursor: "ew-resize" }}
            title={resizeTooltips?.start}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              onResizeStart("start", e);
            }}
          />
          <span
            className={cn(styles.resizeHandle, styles.resizeHandleEnd, styles.resizeHandleVisible)}
            style={{ cursor: "ew-resize" }}
            title={resizeTooltips?.end}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              onResizeStart("end", e);
            }}
          />
        </>
      ) : null}
      {tooltipCard}
    </div>
  );

  if (href && !canEdit) {
    return (
      <Link href={href} className="contents">
        {bar}
      </Link>
    );
  }
  return bar;
}
