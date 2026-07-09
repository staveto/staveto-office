import type { GanttPhaseNode, GanttProjectNode, GanttTaskNode } from "@/lib/ganttTimeline";
import { countDaysInclusive, isRealMilestone } from "@/lib/ganttTimeline";
import type { TaskDoc } from "@/lib/projects";
import { addDays, parseIsoDateLocal, toIsoDateLocal } from "@/lib/planningDates";
import { addCalendarDays, addWorkingDays, isWorkingDay } from "@/lib/projectPlanningDates";

export type DerivedDateRange = {
  startYmd: string;
  endYmd: string;
};

export function deriveDateRangeFromTaskNodes(
  tasks: Array<Pick<GanttTaskNode, "startYmd" | "endYmd" | "isUnscheduled">>
): DerivedDateRange | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const task of tasks) {
    if (task.isUnscheduled || !task.startYmd) continue;
    const taskEnd = task.endYmd ?? task.startYmd;
    if (!start || task.startYmd < start) start = task.startYmd;
    if (!end || taskEnd > end) end = taskEnd;
  }
  if (!start || !end) return null;
  return { startYmd: start, endYmd: end };
}

export function deriveProjectDateRange(project: GanttProjectNode): DerivedDateRange | null {
  const tasks = project.phases.flatMap((ph) => ph.tasks);
  return deriveDateRangeFromTaskNodes(tasks);
}

export function derivePhaseDateRange(phase: GanttPhaseNode): DerivedDateRange | null {
  return deriveDateRangeFromTaskNodes(phase.tasks);
}

export function countWorkingDaysInclusive(startYmd: string, endYmd: string): number {
  let count = 0;
  let cur = parseIsoDateLocal(startYmd);
  const end = parseIsoDateLocal(endYmd);
  while (cur <= end) {
    if (isWorkingDay(cur)) count += 1;
    cur = addDays(cur, 1);
  }
  return Math.max(1, count);
}

export function countCalendarDaysInclusive(startYmd: string, endYmd: string): number {
  return countDaysInclusive(startYmd, endYmd);
}

/** Extend or shrink end date to match target working-day duration from start. */
export function endDateForWorkingDuration(
  startYmd: string,
  workingDays: number
): string {
  if (workingDays <= 1) return startYmd;
  return addWorkingDays(startYmd, workingDays - 1);
}

export type TaskDateDraft = {
  plannedStart: string;
  plannedEnd: string;
  dueDate: string;
  canResize: boolean;
};

/** Firestore stores null when start and end are the same day. */
export function normalizePlannedEndForStorage(
  plannedStart: string,
  plannedEnd: string
): string | null {
  return plannedStart === plannedEnd ? null : plannedEnd;
}

export function buildTaskSchedulePatchFromDraft(draft: TaskDateDraft): {
  plannedStart: string;
  plannedEnd: string | null;
  dueDate: string;
} {
  return {
    plannedStart: draft.plannedStart,
    plannedEnd: draft.canResize
      ? normalizePlannedEndForStorage(draft.plannedStart, draft.plannedEnd)
      : null,
    dueDate: draft.dueDate,
  };
}

export function taskDateDraftFromDoc(task: TaskDoc): TaskDateDraft | null {
  const start = task.plannedStart?.slice(0, 10) ?? task.dueDate?.slice(0, 10);
  if (!start) return null;
  const end = task.plannedEnd?.slice(0, 10) ?? start;
  const canResize = !isRealMilestone(task);
  return {
    plannedStart: start,
    plannedEnd: end,
    dueDate: task.dueDate?.slice(0, 10) ?? end,
    canResize,
  };
}

export function applyQuickShift(
  draft: TaskDateDraft,
  days: number,
  workingDaysOnly = true
): TaskDateDraft {
  const shift = (ymd: string) => {
    if (days < 0 || !workingDaysOnly) return addCalendarDays(ymd, days);
    return addWorkingDays(ymd, days);
  };
  const ns = shift(draft.plannedStart);
  const ne = shift(draft.plannedEnd);
  return {
    ...draft,
    plannedStart: ns,
    plannedEnd: ne,
    dueDate: ne,
  };
}

export function applyDurationChange(
  draft: TaskDateDraft,
  workingDays: number
): TaskDateDraft {
  const days = Math.max(1, workingDays);
  if (!draft.canResize) {
    return {
      ...draft,
      plannedStart: draft.plannedStart,
      plannedEnd: draft.plannedStart,
      dueDate: draft.plannedStart,
    };
  }
  const ne = endDateForWorkingDuration(draft.plannedStart, days);
  return { ...draft, plannedEnd: ne, dueDate: ne };
}

export function countPlannedTasksInPhase(tasks: TaskDoc[], phaseId: string): number {
  return tasks.filter((t) => {
    const pid = t.phaseId?.trim() || "__general__";
    const range = t.plannedStart || t.dueDate;
    return pid === phaseId && !!range && (t.status ?? "").toUpperCase() !== "DONE";
  }).length;
}

export function countPlannedTasksInProject(tasks: TaskDoc[]): number {
  return tasks.filter(
    (t) => !!(t.plannedStart || t.dueDate) && (t.status ?? "").toUpperCase() !== "DONE"
  ).length;
}

export function formatDateRangeLabel(
  range: DerivedDateRange | null,
  locale?: string
): string | null {
  if (!range) return null;
  const fmt = (ymd: string) =>
    parseIsoDateLocal(ymd).toLocaleDateString(locale, { day: "numeric", month: "short" });
  if (range.startYmd === range.endYmd) return fmt(range.startYmd);
  return `${fmt(range.startYmd)} – ${fmt(range.endYmd)}`;
}

/** Phase/project bulk shifts require explicit non-zero offset (confirmation in UI). */
export function canApplyAggregatedShift(days: number): boolean {
  return Number.isFinite(days) && days !== 0;
}

export function isTaskDueTodayOrOverdue(task: GanttTaskNode, todayYmd: string): boolean {
  if ((task.status ?? "").toUpperCase() === "DONE") return false;
  if (task.barStatus === "overdue") return true;
  const end = task.endYmd ?? task.startYmd;
  return !!end && end <= todayYmd;
}

export function countNeedsAttentionToday(
  projects: GanttProjectNode[],
  todayYmd: string = toIsoDateLocal(new Date())
): number {
  let count = 0;
  for (const project of projects) {
    for (const phase of project.phases) {
      for (const task of phase.tasks) {
        if (isTaskDueTodayOrOverdue(task, todayYmd)) count += 1;
      }
    }
  }
  return count;
}
