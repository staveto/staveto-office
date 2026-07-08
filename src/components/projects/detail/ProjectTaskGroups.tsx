"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  UserRound,
  Wrench,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TaskDoc } from "@/lib/projects";
import type { PhaseMetric, ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import {
  getTaskPlanDate,
  taskMissingAssignee,
  taskMissingTools,
} from "@/lib/taskPlanningDisplay";
import { ProjectTaskQuickAdd } from "./ProjectTaskQuickAdd";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Handlers = {
  canManage: boolean;
  userId: string;
  togglingTaskId: string | null;
  savingTaskId: string | null;
  canToggleStatus: (task: TaskDoc) => boolean;
  onToggleStatus: (task: TaskDoc) => void;
  onOpenAssignee: (task: TaskDoc) => void;
  onOpenTools: (task: TaskDoc) => void;
  onPlanDateChange: (task: TaskDoc, date: string) => void;
  onQuickAddTask?: (phaseId: string | null, title: string) => void;
  quickAddBusy?: boolean;
};

type Props = Handlers & {
  tasks: TaskDoc[];
  phaseMetrics: ProjectPhaseMetrics;
  /** When set, only this phase group is rendered. */
  focusPhaseId?: string | null;
  showEmptyPhases?: boolean;
};

export function ProjectTaskGroups({
  tasks,
  phaseMetrics,
  focusPhaseId,
  showEmptyPhases = false,
  ...handlers
}: Props) {
  const { t } = useI18n();

  const knownPhaseIds = useMemo(
    () => new Set(phaseMetrics.phases.filter((p) => !p.isGeneral).map((p) => p.id)),
    [phaseMetrics]
  );

  const groups = useMemo(() => {
    return phaseMetrics.phases
      .map((phase) => {
        const phaseTasks = phase.isGeneral
          ? tasks.filter((task) => !task.phaseId?.trim() || !knownPhaseIds.has(task.phaseId.trim()))
          : tasks.filter((task) => task.phaseId?.trim() === phase.id);
        return { phase, tasks: phaseTasks };
      })
      .filter((g) => {
        if (focusPhaseId && g.phase.id !== focusPhaseId) return false;
        if (showEmptyPhases) return !g.phase.isGeneral || g.tasks.length > 0;
        return g.tasks.length > 0;
      });
  }, [tasks, phaseMetrics, knownPhaseIds, focusPhaseId, showEmptyPhases]);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      {groups.map((group, index) => (
        <PhaseGroupCard
          key={group.phase.id}
          phase={group.phase}
          tasks={group.tasks}
          defaultOpen={index === 0 || group.phase.isActive || !!focusPhaseId}
          handlers={handlers}
          t={t}
        />
      ))}
    </div>
  );
}

function PhaseGroupCard({
  phase,
  tasks,
  defaultOpen,
  handlers,
  t,
}: {
  phase: PhaseMetric;
  tasks: TaskDoc[];
  defaultOpen: boolean;
  handlers: Handlers;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const name = phase.isGeneral ? t("projects.dashboard.phaseGeneral") : phase.name;
  const phaseIdForAdd = phase.isGeneral ? null : phase.id;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border",
        phase.isActive ? "border-[var(--po-primary)]/40" : "border-[var(--po-card-border)]"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 bg-[var(--po-card-muted)] px-4 py-3 text-left transition-colors hover:bg-[var(--po-card-bg-elevated)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--po-text-primary)]">{name}</span>
          {phase.isActive ? (
            <span className="rounded-full bg-[var(--po-primary)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              {t("projects.phaseWorkflow.current")}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t("projects.taskGroups.summary", {
              total: phase.total,
              done: phase.done,
              open: phase.open,
            })}
          </span>
          <span className="text-xs font-semibold tabular-nums text-[var(--po-text-secondary)]">
            {phase.percent}%
          </span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open ? (
        <>
          {tasks.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {t("projects.planning.noTasksInPhase")}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} handlers={handlers} t={t} />
              ))}
            </ul>
          )}
          {handlers.canManage && handlers.onQuickAddTask ? (
            <div className="border-t border-border/60 bg-muted/10 px-3 py-2">
              <ProjectTaskQuickAdd
                phaseLabel={name}
                busy={handlers.quickAddBusy}
                t={t}
                onSubmit={(title) => handlers.onQuickAddTask?.(phaseIdForAdd, title)}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  handlers,
  t,
}: {
  task: TaskDoc;
  handlers: Handlers;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const {
    canManage,
    togglingTaskId,
    savingTaskId,
    canToggleStatus,
    onToggleStatus,
    onOpenAssignee,
    onOpenTools,
    onPlanDateChange,
  } = handlers;

  const isDone = task.status === "DONE";
  const missingPerson = taskMissingAssignee(task);
  const missingTool = taskMissingTools(task);
  const planDate = getTaskPlanDate(task);
  const canToggle = canToggleStatus(task);
  const saving = savingTaskId === task.id;

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center">
      <button
        type="button"
        className="flex shrink-0 items-center disabled:opacity-50"
        disabled={!canToggle || togglingTaskId === task.id}
        onClick={() => onToggleStatus(task)}
        aria-label={t("projects.tasks.col.status")}
      >
        {togglingTaskId === task.id ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : isDone ? (
          <CheckCircle2 className="size-5 text-[#e06737]" />
        ) : (
          <Circle className="size-5 text-muted-foreground hover:text-[#1D376A]" />
        )}
      </button>

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm font-medium",
          isDone && "text-muted-foreground line-through"
        )}
      >
        {task.title || t("projects.noName")}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {canManage ? (
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() => onOpenAssignee(task)}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted/60",
                missingPerson ? "border-amber-300 text-amber-700" : "border-transparent text-muted-foreground"
              )}
              title={
                missingPerson
                  ? t("projects.tasks.missingAssignee")
                  : task.assigneeName?.trim() || t("projects.tasks.unassigned")
              }
            >
              <UserRound className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onOpenTools(task)}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-muted/60",
                missingTool ? "border-amber-300 text-amber-700" : "border-transparent text-muted-foreground"
              )}
              title={missingTool ? t("projects.tasks.missingTools") : t("projects.tasks.tools")}
            >
              <Wrench className="size-3.5" />
            </button>
            <Input
              type="date"
              className="h-8 w-[132px] text-xs"
              value={planDate ?? ""}
              disabled={saving}
              onChange={(e) => onPlanDateChange(task, e.target.value)}
            />
          </>
        ) : (
          <>
            {missingPerson ? (
              <span title={t("projects.tasks.missingAssignee")}>
                <UserRound className="size-3.5 text-amber-600" />
              </span>
            ) : null}
            {missingTool ? (
              <span title={t("projects.tasks.missingTools")}>
                <Wrench className="size-3.5 text-amber-600" />
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              {planDate ?? "—"}
            </span>
          </>
        )}

        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium",
            isDone ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
          )}
        >
          {isDone ? t("projects.tasks.statusDone") : t("projects.tasks.statusOpen")}
        </span>
      </div>
    </li>
  );
}
