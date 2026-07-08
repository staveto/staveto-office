"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Loader2,
  Pause,
  Play,
  UserPlus,
  UserRound,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskDoc } from "@/lib/projects";
import { formatTaskPlanSchedule } from "@/lib/taskPlanningBoard";
import {
  buildPhaseLabelMap,
  resolvePhaseLabel,
  taskMissingAssignee,
  taskMissingTools,
} from "@/lib/taskPlanningDisplay";
import type { MemberWorkload } from "@/lib/taskPlanningMetrics";
import type {
  ProjectMemberRecord,
  ProjectPhaseRecord,
} from "@/services/projects/taskPlanningTypes";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type DayStatus = "working" | "paused" | "free";

type Props = {
  tasks: TaskDoc[];
  members: ProjectMemberRecord[];
  phases: ProjectPhaseRecord[];
  workloads: MemberWorkload[];
  activeTimers: Map<string, ActiveTimerState>;
  canManage: boolean;
  selectedIds: Set<string>;
  togglingTaskId: string | null;
  conflictTaskIds: Set<string>;
  locale: string;
  onToggleSelect: (taskId: string) => void;
  onToggleStatus: (task: TaskDoc) => void;
  onOpenAssignee: (task: TaskDoc) => void;
  onOpenTools: (task: TaskDoc) => void;
  canToggleStatus: (task: TaskDoc) => boolean;
};

function dayStatusOf(
  userId: string,
  timers: Map<string, ActiveTimerState>
): DayStatus {
  const timer = timers.get(userId);
  if (!timer) return "free";
  return timer.status === "paused" ? "paused" : "working";
}

export function ProjectWorkerBoard({
  tasks,
  members,
  phases,
  workloads,
  activeTimers,
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
}: Props) {
  const { t } = useI18n();
  const phaseLabels = useMemo(() => buildPhaseLabelMap(phases), [phases]);

  const { byWorker, unassigned } = useMemo(() => {
    const map = new Map<string, TaskDoc[]>();
    const noOne: TaskDoc[] = [];
    const open = tasks.filter((x) => x.isActive !== false && x.status !== "DONE");
    for (const task of open) {
      const uid = task.assigneeId?.trim();
      if (!uid) {
        noOne.push(task);
        continue;
      }
      const list = map.get(uid) ?? [];
      list.push(task);
      map.set(uid, list);
    }
    return { byWorker: map, unassigned: noOne };
  }, [tasks]);

  const memberName = (uid: string) => {
    const m = members.find((x) => x.userId === uid);
    return m?.name?.trim() || m?.email || uid;
  };

  const workloadByUser = useMemo(() => {
    const map = new Map<string, MemberWorkload>();
    for (const w of workloads) map.set(w.userId, w);
    return map;
  }, [workloads]);

  const activeWorkers = workloads.filter((w) => w.taskCount > 0);

  return (
    <div className="space-y-4">
      {/* Row 1: Team capacity */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("projects.workPlan.teamCapacity")}
        </h3>
        {workloads.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
            {t("projects.workPlan.noTeam")}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {workloads.map((w) => {
              const status = dayStatusOf(w.userId, activeTimers);
              return (
                <div
                  key={w.userId}
                  className={cn(
                    "min-w-[180px] shrink-0 rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg)] p-3 shadow-sm",
                    w.hasConflict ? "border-amber-300" : "border-border/70"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <UserRound className="size-4 shrink-0 text-[var(--po-text-secondary)]" />
                      <span className="truncate text-sm font-semibold text-[var(--po-text-primary)]">
                        {w.name}
                      </span>
                    </span>
                    <DayStatusPill status={status} t={t} />
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--po-primary)]/60"
                      style={{ width: `${w.loadPercent}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("projects.workPlan.tasksCount", { count: w.taskCount })}
                    {w.plannedHours != null ? ` · ${w.plannedHours}h` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Row 2: Unassigned work */}
      {unassigned.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800">
            <UserPlus className="size-4" />
            {t("projects.workPlan.unassignedWork")}
            <span className="tabular-nums">({unassigned.length})</span>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unassigned.map((task) => (
              <WorkerTaskCard
                key={task.id}
                task={task}
                phaseLabel={resolvePhaseLabel(task.phaseId, phaseLabels, t)}
                canManage={canManage}
                selected={selectedIds.has(task.id)}
                toggling={togglingTaskId === task.id}
                hasConflict={conflictTaskIds.has(task.id)}
                canToggle={canToggleStatus(task)}
                locale={locale}
                showAssign
                onToggleSelect={() => onToggleSelect(task.id)}
                onToggleStatus={() => onToggleStatus(task)}
                onOpenAssignee={() => onOpenAssignee(task)}
                onOpenTools={() => onOpenTools(task)}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Row 3: Workers board */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("projects.workPlan.workersBoard")}
        </h3>
        {activeWorkers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("projects.workPlan.noAssignedWork")}
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {activeWorkers.map((w) => {
              const workerTasks = byWorker.get(w.userId) ?? [];
              const wl = workloadByUser.get(w.userId);
              return (
                <div
                  key={w.userId}
                  className="flex w-[min(100%,300px)] shrink-0 flex-col rounded-xl border border-border/60 bg-muted/20"
                >
                  <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-[var(--po-card-border)] bg-[var(--po-card-muted)] px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <UserRound className="size-4 shrink-0 text-[var(--po-text-secondary)]" />
                      <span className="truncate text-sm font-semibold text-[var(--po-text-primary)]">
                        {memberName(w.userId)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {t("projects.workPlan.tasksCount", { count: workerTasks.length })}
                      {wl?.plannedHours != null ? ` · ${wl.plannedHours}h` : ""}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-2">
                    {workerTasks.map((task) => (
                      <WorkerTaskCard
                        key={task.id}
                        task={task}
                        phaseLabel={resolvePhaseLabel(task.phaseId, phaseLabels, t)}
                        canManage={canManage}
                        selected={selectedIds.has(task.id)}
                        toggling={togglingTaskId === task.id}
                        hasConflict={conflictTaskIds.has(task.id)}
                        canToggle={canToggleStatus(task)}
                        locale={locale}
                        onToggleSelect={() => onToggleSelect(task.id)}
                        onToggleStatus={() => onToggleStatus(task)}
                        onOpenAssignee={() => onOpenAssignee(task)}
                        onOpenTools={() => onOpenTools(task)}
                        t={t}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DayStatusPill({
  status,
  t,
}: {
  status: DayStatus;
  t: (key: string) => string;
}) {
  const config = {
    working: {
      icon: Play,
      label: t("projects.crew.statusWorking"),
      className: "bg-emerald-50 text-emerald-700",
    },
    paused: {
      icon: Pause,
      label: t("projects.crew.statusPaused"),
      className: "bg-amber-50 text-amber-700",
    },
    free: {
      icon: Circle,
      label: t("projects.workPlan.statusFree"),
      className: "bg-muted text-muted-foreground",
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        config.className
      )}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}

function WorkerTaskCard({
  task,
  phaseLabel,
  canManage,
  selected,
  toggling,
  hasConflict,
  canToggle,
  locale,
  showAssign,
  onToggleSelect,
  onToggleStatus,
  onOpenAssignee,
  onOpenTools,
  t,
}: {
  task: TaskDoc;
  phaseLabel: string;
  canManage: boolean;
  selected: boolean;
  toggling: boolean;
  hasConflict: boolean;
  canToggle: boolean;
  locale: string;
  showAssign?: boolean;
  onToggleSelect: () => void;
  onToggleStatus: () => void;
  onOpenAssignee: () => void;
  onOpenTools: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const missingTool = taskMissingTools(task);
  const missingPerson = taskMissingAssignee(task);
  const warn = missingTool || (showAssign && missingPerson) || hasConflict;
  const schedule = formatTaskPlanSchedule(task, t, locale);

  return (
    <article
      className={cn(
        "rounded-lg border border-[var(--po-card-border)] bg-[var(--po-card-bg)] p-2.5 shadow-sm transition-shadow hover:shadow-md",
        selected && "ring-2 ring-[var(--po-primary)]/40",
        hasConflict ? "border-amber-300" : warn ? "border-amber-200/80" : "border-border/70"
      )}
    >
      <div className="flex items-start gap-2">
        {canManage ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-0.5 size-4 shrink-0 accent-[var(--po-primary)]"
            aria-label={t("projects.workPlan.selectTask")}
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-1.5">
            <h4 className="text-sm font-semibold leading-snug text-[#0F2A4D]">
              {task.title || t("projects.noName")}
            </h4>
            <div className="flex shrink-0 items-center gap-1">
              {warn ? <AlertTriangle className="size-3.5 text-amber-600" aria-hidden /> : null}
              <button
                type="button"
                className="disabled:opacity-50"
                disabled={!canToggle || toggling}
                onClick={onToggleStatus}
                aria-label={t("projects.tasks.col.status")}
              >
                {toggling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : task.status === "DONE" ? (
                  <CheckCircle2 className="size-4 text-[#e06737]" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">{phaseLabel}</p>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock className="size-3 shrink-0" />
            {schedule}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {canManage ? (
              <>
                {showAssign ? (
                  <button
                    type="button"
                    onClick={onOpenAssignee}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-1.5 py-0.5 text-[11px] text-amber-700 transition-colors hover:bg-amber-50"
                  >
                    <UserPlus className="size-3" />
                    {t("projects.workPlan.assignWorker")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onOpenTools}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors hover:bg-muted/60",
                    missingTool ? "border-amber-300 text-amber-700" : "border-border text-muted-foreground"
                  )}
                >
                  <Wrench className="size-3" />
                  {missingTool ? t("projects.tasks.noTools") : t("projects.tasks.tools")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
