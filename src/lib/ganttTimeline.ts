import type { TaskDoc, ProjectDoc } from "@/lib/projects";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import { getTaskPlanDate } from "@/lib/taskPlanningDisplay";
import { computeProjectPhaseMetrics, GENERAL_PHASE_ID } from "@/lib/projectPhaseMetrics";
import {
  addCalendarDays,
  getPhaseDateRangeFromTasks,
  shiftTaskDate,
} from "@/lib/projectPlanningDates";
import { toIsoDateLocal, parseIsoDateLocal, addDays, startOfWeekMonday, startOfMonth } from "@/lib/planningDates";

export type GanttViewMode = "week" | "month" | "quarter";

export type GanttDay = {
  ymd: string;
  isWeekend: boolean;
  isToday: boolean;
  isPast: boolean;
  isMonthStart: boolean;
  shortLabel: string;
  dayNum: string;
  weekdayLabel: string;
};

/** A grouped header band segment (month or week) sitting above the day cells. */
export type GanttHeaderSegment = {
  key: string;
  label: string;
  leftPx: number;
  widthPx: number;
};

export type GanttTimeline = {
  viewMode: GanttViewMode;
  startYmd: string;
  endYmd: string;
  days: GanttDay[];
  months: GanttHeaderSegment[];
  dayWidthPx: number;
  totalWidthPx: number;
  todayYmd: string;
};

export type GanttBarStatus = "done" | "active" | "open" | "blocked" | "overdue" | "unassigned";

export type GanttAssignedTool = {
  id: string;
  name: string;
  type?: string | null;
};

export type GanttTaskNode = {
  id: string;
  projectId: string;
  title: string;
  phaseId?: string;
  assigneeId?: string;
  assigneeName?: string;
  toolSummary?: string;
  assignedTools?: GanttAssignedTool[];
  status: string;
  startYmd?: string;
  endYmd?: string;
  isUnscheduled: boolean;
  canResize: boolean;
  barStatus: GanttBarStatus;
};

export type GanttPhaseNode = {
  id: string;
  projectId: string;
  name: string;
  isGeneral: boolean;
  tasks: GanttTaskNode[];
  startYmd?: string;
  endYmd?: string;
  done: number;
  total: number;
  open: number;
  isActive: boolean;
};

export type GanttProjectNode = {
  id: string;
  name: string;
  phases: GanttPhaseNode[];
  startYmd?: string;
  endYmd?: string;
  progress: number;
  totalTasks: number;
  doneTasks: number;
};

export function getViewRange(anchor: Date, viewMode: GanttViewMode): { startYmd: string; endYmd: string } {
  if (viewMode === "week") {
    const mon = startOfWeekMonday(anchor);
    const sun = addDays(mon, 6);
    return { startYmd: toIsoDateLocal(mon), endYmd: toIsoDateLocal(sun) };
  }
  if (viewMode === "month") {
    const start = startOfMonth(anchor);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { startYmd: toIsoDateLocal(start), endYmd: toIsoDateLocal(end) };
  }
  const qStart = new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  return { startYmd: toIsoDateLocal(qStart), endYmd: toIsoDateLocal(qEnd) };
}

export function countDaysInclusive(startYmd: string, endYmd: string): number {
  let cur = parseIsoDateLocal(startYmd);
  const end = parseIsoDateLocal(endYmd);
  let count = 0;
  while (cur <= end) {
    count += 1;
    cur = addDays(cur, 1);
  }
  return Math.max(1, count);
}

export function buildTimelineDays(
  startYmd: string,
  endYmd: string,
  viewMode: GanttViewMode,
  dayWidthPx: number
): GanttTimeline {
  const todayYmd = toIsoDateLocal(new Date());
  const days: GanttDay[] = [];
  const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  let cur = parseIsoDateLocal(startYmd);
  const end = parseIsoDateLocal(endYmd);
  while (cur <= end) {
    const ymd = toIsoDateLocal(cur);
    const dow = cur.getDay();
    days.push({
      ymd,
      isWeekend: dow === 0 || dow === 6,
      isToday: ymd === todayYmd,
      isPast: ymd < todayYmd,
      isMonthStart: cur.getDate() === 1,
      shortLabel: cur.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      dayNum: String(cur.getDate()),
      weekdayLabel: weekdayFmt.format(cur).replace(/\.$/, "").slice(0, 2),
    });
    cur = addDays(cur, 1);
  }

  const months: GanttHeaderSegment[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const d = parseIsoDateLocal(days[i].ymd);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const last = months[months.length - 1];
    if (last && last.key === key) {
      last.widthPx += dayWidthPx;
    } else {
      months.push({
        key,
        label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        leftPx: i * dayWidthPx,
        widthPx: dayWidthPx,
      });
    }
  }

  return {
    viewMode,
    startYmd,
    endYmd,
    days,
    months,
    dayWidthPx,
    totalWidthPx: days.length * dayWidthPx,
    todayYmd,
  };
}

export function dateToColumn(dateYmd: string, timeline: GanttTimeline): number {
  const idx = timeline.days.findIndex((d) => d.ymd === dateYmd);
  if (idx >= 0) return idx * timeline.dayWidthPx;
  const first = timeline.days[0]?.ymd;
  if (!first || dateYmd < first) return 0;
  return (timeline.days.length - 1) * timeline.dayWidthPx;
}

export function columnToDate(columnPx: number, timeline: GanttTimeline): string {
  const idx = Math.max(0, Math.min(timeline.days.length - 1, Math.round(columnPx / timeline.dayWidthPx)));
  return timeline.days[idx]?.ymd ?? timeline.startYmd;
}

export function daysDelta(fromYmd: string, toYmd: string): number {
  const a = parseIsoDateLocal(fromYmd);
  const b = parseIsoDateLocal(toYmd);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function getTaskDateRange(task: TaskDoc): {
  startYmd?: string;
  endYmd?: string;
  isUnscheduled: boolean;
  canResize: boolean;
} {
  const start = task.plannedStart?.slice(0, 10);
  const end = task.plannedEnd?.slice(0, 10) || task.dueDate?.slice(0, 10);
  const single = getTaskPlanDate(task);

  if (start && end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const s = start <= end ? start : end;
    const e = start <= end ? end : start;
    return {
      startYmd: s,
      endYmd: e,
      isUnscheduled: false,
      canResize: s !== e,
    };
  }
  if (single) {
    return { startYmd: single, endYmd: single, isUnscheduled: false, canResize: false };
  }
  return { isUnscheduled: true, canResize: false };
}

export function getGanttBarStatus(task: TaskDoc, todayYmd: string): GanttBarStatus {
  const status = (task.status ?? "OPEN").toUpperCase();
  if (status === "DONE") return "done";
  if (status === "BLOCKED") return "blocked";
  if (!task.assigneeId?.trim()) return "unassigned";
  const plan = getTaskPlanDate(task);
  if (plan && plan < todayYmd) return "overdue";
  if (status === "IN_PROGRESS" || status === "IN_WORK") return "active";
  return "open";
}

export function getGanttStatusColor(status: GanttBarStatus): string {
  switch (status) {
    case "done":
      return "#16a34a";
    case "blocked":
      return "#dc2626";
    case "overdue":
      return "#e06737";
    case "unassigned":
      return "#d97706";
    case "active":
      return "#2563eb";
    default:
      return "#1D376A";
  }
}

function taskToNode(task: TaskDoc, todayYmd: string): GanttTaskNode {
  const range = getTaskDateRange(task);
  const tools = task.assignedTools ?? [];
  const toolNames = tools.map((t) => t.name).filter(Boolean);
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    phaseId: task.phaseId ?? undefined,
    assigneeId: task.assigneeId ?? undefined,
    assigneeName: task.assigneeName ?? undefined,
    toolSummary: toolNames.length > 0 ? toolNames.join(", ") : undefined,
    assignedTools:
      tools.length > 0
        ? tools.map((t) => ({ id: t.id, name: t.name, type: t.type ?? null }))
        : undefined,
    status: task.status ?? "OPEN",
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    isUnscheduled: range.isUnscheduled,
    canResize: range.canResize,
    barStatus: getGanttBarStatus(task, todayYmd),
  };
}

export function buildGanttHierarchy(input: {
  projects: ProjectDoc[];
  phasesByProject: Map<string, ProjectPhaseRecord[]>;
  tasksByProject: Map<string, TaskDoc[]>;
  todayYmd?: string;
}): { projects: GanttProjectNode[]; unscheduled: GanttTaskNode[] } {
  const today = input.todayYmd ?? toIsoDateLocal(new Date());
  const unscheduled: GanttTaskNode[] = [];
  const projects: GanttProjectNode[] = [];

  for (const project of input.projects) {
    const phases = input.phasesByProject.get(project.id) ?? [];
    const tasks = (input.tasksByProject.get(project.id) ?? []).filter((t) => t.isActive !== false);
    const metrics = computeProjectPhaseMetrics(phases, tasks);

    const phaseNodes: GanttPhaseNode[] = metrics.phases.map((pm) => {
      const phaseTasks = pm.isGeneral
        ? tasks.filter((t) => !t.phaseId?.trim() || t.phaseId === GENERAL_PHASE_ID)
        : tasks.filter((t) => t.phaseId?.trim() === pm.id);

      const nodes = phaseTasks.map((t) => taskToNode({ ...t, projectId: project.id }, today));
      for (const n of nodes) {
        if (n.isUnscheduled) unscheduled.push(n);
      }
      const range = getPhaseDateRangeFromTasks(
        phaseTasks.filter((t) => !getTaskDateRange(t).isUnscheduled)
      );

      return {
        id: pm.id,
        projectId: project.id,
        name: pm.isGeneral ? "__general__" : pm.name,
        isGeneral: pm.isGeneral,
        tasks: nodes,
        startYmd: range?.start,
        endYmd: range?.end,
        done: pm.done,
        total: pm.total,
        open: pm.open,
        isActive: pm.isActive,
      };
    });

    const scheduledTasks = tasks.filter((t) => !getTaskDateRange(t).isUnscheduled);
    const projectRange = getPhaseDateRangeFromTasks(scheduledTasks);
    const done = tasks.filter((t) => (t.status ?? "").toUpperCase() === "DONE").length;

    projects.push({
      id: project.id,
      name: project.name,
      phases: phaseNodes.filter((p) => p.total > 0 || !p.isGeneral),
      startYmd: projectRange?.start,
      endYmd: projectRange?.end,
      progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      totalTasks: tasks.length,
      doneTasks: done,
    });
  }

  // Keep delivery projects visible even when every task is still unscheduled.
  return {
    projects: projects.filter((p) => p.totalTasks > 0 || p.phases.length > 0),
    unscheduled,
  };
}

export function shiftTaskNodeDates(
  node: GanttTaskNode,
  days: number,
  workingDaysOnly = false
): { startYmd?: string; endYmd?: string } {
  if (!node.startYmd) return {};
  const newStart = shiftTaskDate(node.startYmd, days, workingDaysOnly);
  const newEnd = node.endYmd ? shiftTaskDate(node.endYmd, days, workingDaysOnly) : newStart;
  return { startYmd: newStart, endYmd: newEnd };
}

export function barStyleFromRange(
  startYmd: string | undefined,
  endYmd: string | undefined,
  timeline: GanttTimeline
): { left: number; width: number; visible: boolean } {
  if (!startYmd || !endYmd) return { left: 0, width: 0, visible: false };
  const startIdx = timeline.days.findIndex((d) => d.ymd >= startYmd);
  let endIdx = timeline.days.findIndex((d) => d.ymd >= endYmd);
  if (startIdx < 0 && endYmd < timeline.startYmd) return { left: 0, width: 0, visible: false };
  if (startIdx < 0) return { left: 0, width: timeline.dayWidthPx, visible: true };
  if (endIdx < 0) endIdx = timeline.days.length - 1;
  const span = Math.max(1, endIdx - startIdx + 1);
  return {
    left: startIdx * timeline.dayWidthPx,
    width: span * timeline.dayWidthPx - 4,
    visible: true,
  };
}

export function defaultDayWidth(viewMode: GanttViewMode, zoom: number): number {
  const base = viewMode === "week" ? 48 : viewMode === "month" ? 34 : 18;
  return Math.round(base * zoom);
}

/** Stretch day columns in fullscreen so the timeline fills the chart area. */
export function resolveGanttDayWidth(
  viewMode: GanttViewMode,
  zoom: number,
  range: { startYmd: string; endYmd: string },
  options?: { fullscreen?: boolean; chartAreaWidth?: number; labelWidthPx?: number }
): number {
  const base = defaultDayWidth(viewMode, zoom);
  if (!options?.fullscreen || !options.chartAreaWidth || options.chartAreaWidth < 320) {
    return base;
  }
  const labelW = options.labelWidthPx ?? 340;
  const available = options.chartAreaWidth - labelW;
  if (available <= 0) return base;
  const days = countDaysInclusive(range.startYmd, range.endYmd);
  return Math.max(base, available / days);
}

export { addCalendarDays, shiftTaskDate };
