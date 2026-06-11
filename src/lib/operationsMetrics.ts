import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";

export type TeamStatus = "working" | "paused" | "not_started" | "absent" | "offline";

export type TeamLiveStatusItem = {
  uid: string;
  name: string;
  email?: string;
  status: TeamStatus;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  taskName?: string;
  timerSeconds?: number;
  pauseSince?: string;
  locationLabel?: string;
};

export type TodayOverviewMetrics = {
  activeWorkers: number;
  onBreak: number;
  absent: number;
  tasksPlannedToday: number;
  unassignedTasks: number;
  runningTimers: number;
  trackedMinutesToday: number;
};

export type TimeInvestmentByProject = {
  projectId: string;
  projectName: string;
  totalMinutes: number;
  byMember: { userId: string; userName: string; minutes: number }[];
};

export type TimeInvestmentByTask = {
  taskId: string;
  taskName: string;
  projectId?: string;
  projectName?: string;
  totalMinutes: number;
};

export type TimeInvestmentByEmployee = {
  userId: string;
  userName: string;
  totalMinutes: number;
  topProject?: { projectId: string; projectName: string; minutes: number };
};

export type TaskProgressColumn = "not_planned" | "planned" | "in_progress" | "done" | "blocked";

export type TaskProgressItem = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  assigneeName?: string | null;
  plannedStart?: string;
  investedMinutes: number;
  assignedToolsCount: number;
  column: TaskProgressColumn;
};

export type UnassignedWorkGroup = {
  projectId: string;
  projectName: string;
  withoutCrew: boolean;
  tasksWithoutAssignee: number;
  tasksWithoutTools: number;
  tasksWithoutDate: number;
};

export function toHoursMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function summarizeTodayOverview(
  team: TeamLiveStatusItem[],
  tasks: TaskDoc[],
  todayEntries: TimeEntryDoc[],
  todayIso: string
): TodayOverviewMetrics {
  const tasksPlannedToday = tasks.filter((t) => (t.dueDate ?? "").slice(0, 10) === todayIso).length;
  const unassignedTasks = tasks.filter((t) => t.status !== "DONE" && !t.assigneeId).length;
  const trackedMinutesToday = todayEntries.reduce((sum, e) => sum + Math.max(0, e.durationMinutes || 0), 0);

  return {
    activeWorkers: team.filter((m) => m.status === "working").length,
    onBreak: team.filter((m) => m.status === "paused").length,
    absent: team.filter((m) => m.status === "absent").length,
    tasksPlannedToday,
    unassignedTasks,
    runningTimers: team.filter((m) => m.status === "working" || m.status === "paused").length,
    trackedMinutesToday,
  };
}

export function computeUnassignedWork(projects: ProjectDoc[], tasks: TaskDoc[]): UnassignedWorkGroup[] {
  return projects
    .map((project) => {
      const projectTasks = tasks.filter((t) => t.projectId === project.id && t.status !== "DONE");
      return {
        projectId: project.id,
        projectName: project.name,
        withoutCrew: (project.assignedMemberIds ?? []).length === 0,
        tasksWithoutAssignee: projectTasks.filter((t) => !t.assigneeId).length,
        tasksWithoutTools: projectTasks.filter((t) => (t.assignedToolIds ?? []).length === 0).length,
        tasksWithoutDate: projectTasks.filter((t) => !(t.plannedStart || t.dueDate)).length,
      };
    })
    .filter(
      (row) =>
        row.withoutCrew ||
        row.tasksWithoutAssignee > 0 ||
        row.tasksWithoutTools > 0 ||
        row.tasksWithoutDate > 0
    );
}

export function buildTaskProgress(
  tasks: TaskDoc[],
  projectsById: Map<string, ProjectDoc>,
  minutesByTaskId: Map<string, number>
): TaskProgressItem[] {
  return tasks.map((task) => {
    const status = task.status?.toUpperCase() ?? "OPEN";
    const column: TaskProgressColumn =
      status === "DONE"
        ? "done"
        : status === "IN_PROGRESS"
          ? "in_progress"
          : status === "BLOCKED"
            ? "blocked"
            : task.plannedStart || task.dueDate
              ? "planned"
              : "not_planned";

    const project = projectsById.get(task.projectId);
    return {
      id: task.id,
      title: task.title,
      projectId: task.projectId,
      projectName: project?.name ?? task.projectId,
      assigneeName: task.assigneeName ?? null,
      plannedStart: task.plannedStart ?? task.dueDate,
      investedMinutes: minutesByTaskId.get(task.id) ?? 0,
      assignedToolsCount: (task.assignedToolIds ?? task.assignedTools ?? []).length,
      column,
    };
  });
}
