"use client";

import { AlertCircle } from "lucide-react";
import type { GanttTaskNode } from "@/lib/ganttTimeline";
import styles from "./gantt.module.css";

type Props = {
  tasks: GanttTaskNode[];
  canEdit: boolean;
  onPickDate: (task: GanttTaskNode, dateYmd: string) => void;
  timelineStartYmd: string;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function GanttUnscheduledPanel({
  tasks,
  canEdit,
  onPickDate,
  timelineStartYmd,
  t,
}: Props) {
  if (tasks.length === 0) return null;

  return (
    <section className={styles.unscheduledPanel}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
        <AlertCircle className="size-4 text-amber-600" />
        {t("gantt.unscheduled.title")} ({tasks.length})
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">{t("gantt.unscheduled.hint")}</p>
      <div className="flex flex-wrap gap-2">
        {tasks.map((task) => (
          <button
            key={`${task.projectId}-${task.id}`}
            type="button"
            className={styles.unscheduledChip}
            disabled={!canEdit}
            title={t("gantt.unscheduled.assignToday")}
            onClick={() => canEdit && onPickDate(task, timelineStartYmd)}
          >
            {task.title}
            {task.assigneeName ? (
              <span className="ml-1 text-[10px] opacity-80">({task.assigneeName})</span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
