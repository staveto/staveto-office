"use client";

import { AlertTriangle, Calendar, CheckCircle2, Circle, Loader2, UserRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskDoc, TaskAssignedTool } from "@/lib/projects";
import {
  BOARD_COLUMN_ORDER,
  formatTaskPlanSchedule,
  groupTasksByBoardColumn,
  type BoardColumnId,
} from "@/lib/taskPlanningBoard";
import {
  buildPhaseLabelMap,
  resolvePhaseLabel,
  taskMissingAssignee,
  taskMissingTools,
} from "@/lib/taskPlanningDisplay";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import type { ToolConflict } from "@/lib/taskPlanningConflicts";
import { cn } from "@/lib/utils";

type Props = {
  tasks: TaskDoc[];
  phases: ProjectPhaseRecord[];
  canManage: boolean;
  userId: string;
  selectedIds: Set<string>;
  togglingTaskId: string | null;
  conflictTaskIds: Set<string>;
  locale: string;
  onToggleSelect: (taskId: string) => void;
  onToggleStatus: (task: TaskDoc) => void;
  onOpenAssignee: (task: TaskDoc) => void;
  onOpenTools: (task: TaskDoc) => void;
  canToggleStatus: (task: TaskDoc) => boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const COLUMN_I18N: Record<BoardColumnId, string> = {
  unassigned: "projects.workPlan.unassigned",
  today: "projects.workPlan.today",
  tomorrow: "projects.workPlan.tomorrow",
  thisWeek: "projects.workPlan.thisWeek",
  done: "projects.workPlan.done",
};

function ToolChips({
  tools,
  missing,
  t,
}: {
  tools: TaskAssignedTool[];
  missing: boolean;
  t: (key: string) => string;
}) {
  if (tools.length === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground">
        {t("projects.workPlan.noToolChip")}
      </span>
    );
  }

  return (
    <>
      {tools.map((tool) => (
        <span
          key={tool.id}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[11px] font-medium max-w-[140px] truncate"
        >
          <Wrench className="size-3 shrink-0 opacity-60" />
          {tool.name}
        </span>
      ))}
    </>
  );
}

function TaskPlanCard({
  task,
  phaseLabel,
  canManage,
  selected,
  toggling,
  hasConflict,
  locale,
  onToggleSelect,
  onToggleStatus,
  onOpenAssignee,
  onOpenTools,
  canToggleStatus,
  t,
}: {
  task: TaskDoc;
  phaseLabel: string;
  canManage: boolean;
  selected: boolean;
  toggling: boolean;
  hasConflict: boolean;
  locale: string;
  onToggleSelect: () => void;
  onToggleStatus: () => void;
  onOpenAssignee: () => void;
  onOpenTools: () => void;
  canToggleStatus: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const missingPerson = taskMissingAssignee(task);
  const missingTool = taskMissingTools(task);
  const tools = task.assignedTools ?? [];
  const schedule = formatTaskPlanSchedule(task, t, locale);
  const warn = missingPerson || missingTool || hasConflict;

  return (
    <article
      className={cn(
        "rounded-xl border bg-[var(--po-card-bg)] p-3 shadow-sm transition-shadow hover:shadow-md",
        selected && "ring-2 ring-[var(--po-primary)]/40 border-[var(--po-primary)]/30",
        hasConflict ? "border-amber-500/40" : warn ? "border-amber-500/30" : "border-[var(--po-card-border)]"
      )}
    >
      <div className="flex items-start gap-2">
        {canManage ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 size-4 accent-[var(--po-primary)] shrink-0"
            aria-label={t("projects.workPlan.selectTask")}
          />
        ) : null}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h4
              className={cn(
                "font-semibold text-sm text-[var(--po-text-primary)] leading-snug",
                task.status === "DONE" && "line-through text-muted-foreground"
              )}
            >
              {task.title || t("projects.noName")}
            </h4>
            <div className="flex items-center gap-1 shrink-0">
              {warn ? (
                <AlertTriangle className="size-3.5 text-amber-600" aria-hidden />
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={!canToggleStatus || toggling}
                onClick={onToggleStatus}
              >
                {toggling ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : task.status === "DONE" ? (
                  <CheckCircle2 className="size-3.5 text-[#e06737]" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {t("projects.tasks.col.phase")}: {phaseLabel}
          </p>

          {canManage ? (
            <button
              type="button"
              onClick={onOpenAssignee}
              className={cn(
                "flex items-center gap-1.5 text-xs rounded-md px-2 py-1 w-full text-left hover:bg-muted/50",
                missingPerson ? "text-amber-700 dark:text-amber-300" : "text-[var(--po-text-secondary)]"
              )}
            >
              <UserRound className="size-3.5 shrink-0" />
              <span className="truncate">
                {task.assigneeName?.trim() || t("projects.tasks.unassigned")}
              </span>
            </button>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <UserRound className="size-3.5" />
              {task.assigneeName?.trim() || t("projects.tasks.unassigned")}
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {canManage ? (
              <button
                type="button"
                onClick={onOpenTools}
                className="flex flex-wrap gap-1 text-left w-full"
              >
                <ToolChips tools={tools} missing={missingTool} t={t} />
              </button>
            ) : (
              <ToolChips tools={tools} missing={missingTool} t={t} />
            )}
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Calendar className="size-3.5 shrink-0" />
            {schedule}
          </p>

          <span
            className={cn(
              "inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
              task.status === "DONE"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-[var(--po-card-muted)] text-[var(--po-text-secondary)]"
            )}
          >
            {task.status === "DONE"
              ? t("projects.tasks.statusDone")
              : t("projects.tasks.statusOpen")}
          </span>
        </div>
      </div>
    </article>
  );
}

export function ProjectWorkBoard({
  tasks,
  phases,
  canManage,
  selectedIds,
  togglingTaskId,
  conflictTaskIds,
  locale,
  onToggleSelect,
  onToggleStatus,
  onOpenAssignee,
  onOpenTools,
  canToggleStatus,
  t,
}: Props) {
  const phaseLabels = buildPhaseLabelMap(phases);
  const groups = groupTasksByBoardColumn(tasks);

  if (tasks.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground rounded-xl border border-dashed">
        {t("projects.workPlan.noTasks")}
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[320px] snap-x snap-mandatory">
      {BOARD_COLUMN_ORDER.map((columnId) => {
        const columnTasks = groups[columnId];
        return (
          <div
            key={columnId}
            className="flex flex-col w-[min(100%,280px)] shrink-0 snap-start rounded-xl bg-[var(--po-card-muted)] border border-[var(--po-card-border)]"
          >
            <div className="px-3 py-2.5 border-b border-[var(--po-card-border)] bg-[var(--po-card-bg)] rounded-t-xl">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--po-text-primary)]">
                {t(COLUMN_I18N[columnId])}
              </h3>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {columnTasks.length}
              </span>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[min(70vh,640px)]">
              {columnTasks.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-6 px-2">—</p>
              ) : (
                columnTasks.map((task) => (
                  <TaskPlanCard
                    key={task.id}
                    task={task}
                    phaseLabel={resolvePhaseLabel(task.phaseId, phaseLabels, t)}
                    canManage={canManage}
                    selected={selectedIds.has(task.id)}
                    toggling={togglingTaskId === task.id}
                    hasConflict={conflictTaskIds.has(task.id)}
                    locale={locale}
                    onToggleSelect={() => onToggleSelect(task.id)}
                    onToggleStatus={() => onToggleStatus(task)}
                    onOpenAssignee={() => onOpenAssignee(task)}
                    onOpenTools={() => onOpenTools(task)}
                    canToggleStatus={canToggleStatus(task)}
                    t={t}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function buildConflictTaskIdSet(
  toolConflicts: ToolConflict[],
  workerConflicts: { taskIds: string[] }[]
): Set<string> {
  const ids = new Set<string>();
  for (const c of toolConflicts) {
    for (const id of c.taskIds) ids.add(id);
  }
  for (const c of workerConflicts) {
    for (const id of c.taskIds) ids.add(id);
  }
  return ids;
}
