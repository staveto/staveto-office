import type { GanttProjectNode, GanttTaskNode } from "@/lib/ganttTimeline";
import { getTaskDateRange, getGanttBarStatus } from "@/lib/ganttTimeline";
import type { TaskDoc } from "@/lib/projects";
import {
  detectToolConflicts,
  detectWorkerConflicts,
} from "@/lib/taskPlanningConflicts";
import { toIsoDateLocal } from "@/lib/planningDates";
import {
  countNeedsAttentionToday,
  deriveProjectDateRange,
  formatDateRangeLabel,
} from "@/lib/planningDateRange";

export type ProjectRiskStatus = "ok" | "risk" | "delayed" | "blocked";

export type PlanningOverviewMetrics = {
  totalActiveProjects: number;
  openProjects: number;
  delayedProjects: number;
  openPhases: number;
  openTasks: number;
  unassignedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  resourceConflicts: number | null;
  workersActiveToday: number;
  equipmentInUseToday: number;
  needsAttentionToday: number;
  overloadedWorkers: number;
};

export type ProjectCardSummary = {
  projectId: string;
  name: string;
  progress: number;
  totalTasks: number;
  openTasks: number;
  overdueTasks: number;
  unassignedTasks: number;
  blockedTasks: number;
  activePhaseName: string | null;
  workerIds: string[];
  workerNames: string[];
  equipmentCount: number;
  nextPlannedLabel: string | null;
  risk: ProjectRiskStatus;
  dateRangeLabel: string | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
};

function collectProjectTasks(project: GanttProjectNode): GanttTaskNode[] {
  return project.phases.flatMap((ph) => ph.tasks);
}

function isTaskOnDate(task: GanttTaskNode, ymd: string): boolean {
  if (task.isUnscheduled || !task.startYmd) return false;
  const end = task.endYmd ?? task.startYmd;
  return task.startYmd <= ymd && ymd <= end;
}

export function deriveProjectRisk(
  tasks: GanttTaskNode[],
  todayYmd: string
): ProjectRiskStatus {
  if (tasks.some((t) => t.barStatus === "blocked")) return "blocked";
  if (tasks.some((t) => t.barStatus === "overdue")) return "delayed";
  if (
    tasks.some((t) => t.barStatus === "unassigned") ||
    tasks.some((t) => t.isUnscheduled)
  ) {
    return "risk";
  }
  if (tasks.length === 0) return "risk";
  void todayYmd;
  return "ok";
}

export function deriveActivePhaseName(project: GanttProjectNode): string | null {
  const active = project.phases.find((ph) => ph.isActive);
  if (!active) return null;
  if (active.isGeneral || active.name === "__general__") return null;
  return active.name;
}

export function findNextPlannedTaskLabel(
  tasks: GanttTaskNode[],
  todayYmd: string
): string | null {
  const candidates = tasks
    .filter((t) => !t.isUnscheduled && t.startYmd && (t.status ?? "").toUpperCase() !== "DONE")
    .sort((a, b) => (a.startYmd ?? "").localeCompare(b.startYmd ?? ""));

  const upcoming = candidates.find((t) => t.startYmd! >= todayYmd) ?? candidates[0];
  if (!upcoming?.title) return null;
  if (upcoming.startYmd === upcoming.endYmd && upcoming.startYmd) {
    return upcoming.title;
  }
  return upcoming.title;
}

export function buildProjectCardSummaries(
  projects: GanttProjectNode[],
  todayYmd: string = toIsoDateLocal(new Date())
): ProjectCardSummary[] {
  return projects.map((project) => {
    const tasks = collectProjectTasks(project);
    const workerMap = new Map<string, string>();
    const equipmentIds = new Set<string>();

    for (const task of tasks) {
      if (task.assigneeId) {
        workerMap.set(task.assigneeId, task.assigneeName ?? task.assigneeId.slice(0, 8));
      }
      for (const tool of task.assignedTools ?? []) {
        if (tool.id) equipmentIds.add(tool.id);
      }
    }

    const dateRange = deriveProjectDateRange(project);

    return {
      projectId: project.id,
      name: project.name,
      progress: project.progress,
      totalTasks: project.totalTasks,
      openTasks: project.totalTasks - project.doneTasks,
      overdueTasks: tasks.filter((t) => t.barStatus === "overdue").length,
      unassignedTasks: tasks.filter((t) => t.barStatus === "unassigned").length,
      blockedTasks: tasks.filter((t) => t.barStatus === "blocked").length,
      activePhaseName: deriveActivePhaseName(project),
      workerIds: [...workerMap.keys()],
      workerNames: [...workerMap.values()],
      equipmentCount: equipmentIds.size,
      nextPlannedLabel: findNextPlannedTaskLabel(tasks, todayYmd),
      risk: deriveProjectRisk(tasks, todayYmd),
      dateRangeLabel: formatDateRangeLabel(dateRange),
      dateRangeStart: dateRange?.startYmd ?? null,
      dateRangeEnd: dateRange?.endYmd ?? null,
    };
  });
}

export function buildPlanningOverviewMetrics(input: {
  projects: GanttProjectNode[];
  tasksByProject: Record<string, TaskDoc[]>;
  todayYmd?: string;
}): PlanningOverviewMetrics {
  const todayYmd = input.todayYmd ?? toIsoDateLocal(new Date());
  const allTasks = input.projects.flatMap(collectProjectTasks);

  let openPhases = 0;
  let openTasks = 0;
  let delayedProjects = 0;

  for (const project of input.projects) {
    openPhases += project.phases.reduce((sum, ph) => sum + ph.open, 0);
    openTasks += project.totalTasks - project.doneTasks;
    const tasks = collectProjectTasks(project);
    if (deriveProjectRisk(tasks, todayYmd) === "delayed") delayedProjects += 1;
  }

  const openProjects = input.projects.filter(
    (p) => p.totalTasks - p.doneTasks > 0
  ).length;

  const flatTaskDocs = Object.values(input.tasksByProject).flat();
  let resourceConflicts: number | null = null;
  try {
    resourceConflicts =
      detectWorkerConflicts(flatTaskDocs).length +
      detectToolConflicts(flatTaskDocs).length;
  } catch {
    resourceConflicts = null;
  }

  const workersToday = new Set<string>();
  const equipmentToday = new Set<string>();
  for (const task of allTasks) {
    if (!isTaskOnDate(task, todayYmd)) continue;
    if (task.assigneeId) workersToday.add(task.assigneeId);
    for (const tool of task.assignedTools ?? []) {
      if (tool.id) equipmentToday.add(tool.id);
    }
  }

  const workerTaskCounts = new Map<string, number>();
  for (const task of allTasks) {
    if (task.assigneeId && (task.status ?? "").toUpperCase() !== "DONE") {
      workerTaskCounts.set(task.assigneeId, (workerTaskCounts.get(task.assigneeId) ?? 0) + 1);
    }
  }
  const overloadedWorkers = [...workerTaskCounts.values()].filter((c) => c >= 5).length;

  return {
    totalActiveProjects: input.projects.length,
    openProjects,
    delayedProjects,
    openPhases,
    openTasks,
    unassignedTasks: allTasks.filter((t) => t.barStatus === "unassigned").length,
    overdueTasks: allTasks.filter((t) => t.barStatus === "overdue").length,
    blockedTasks: allTasks.filter((t) => t.barStatus === "blocked").length,
    resourceConflicts,
    workersActiveToday: workersToday.size,
    equipmentInUseToday: equipmentToday.size,
    needsAttentionToday: countNeedsAttentionToday(input.projects, todayYmd),
    overloadedWorkers,
  };
}

/** Recompute bar-oriented stats from raw task docs (for tests). */
export function summarizeTaskDocs(
  tasks: TaskDoc[],
  todayYmd: string = toIsoDateLocal(new Date())
): {
  open: number;
  overdue: number;
  unassigned: number;
  blocked: number;
} {
  let open = 0;
  let overdue = 0;
  let unassigned = 0;
  let blocked = 0;
  for (const task of tasks) {
    if ((task.status ?? "").toUpperCase() !== "DONE") open += 1;
    const barStatus = getGanttBarStatus(task, todayYmd);
    if (barStatus === "overdue") overdue += 1;
    if (barStatus === "unassigned") unassigned += 1;
    if (barStatus === "blocked") blocked += 1;
  }
  return { open, overdue, unassigned, blocked };
}

export function projectRiskFromTaskDocs(
  tasks: TaskDoc[],
  todayYmd: string = toIsoDateLocal(new Date())
): ProjectRiskStatus {
  const nodes: GanttTaskNode[] = tasks.map((task) => {
    const range = getTaskDateRange(task);
    return {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      status: task.status ?? "OPEN",
      startYmd: range.startYmd,
      endYmd: range.endYmd,
      isUnscheduled: range.isUnscheduled,
      canResize: range.canResize,
      isMilestone: range.isMilestone,
      barStatus: getGanttBarStatus(task, todayYmd),
    };
  });
  return deriveProjectRisk(nodes, todayYmd);
}
