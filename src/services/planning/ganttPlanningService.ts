import {
  getFirestoreInstance,
  doc,
  updateDoc,
  serverTimestamp,
} from "@/lib/firebase";
import {
  listProjectsForWorkspace,
  listProjectTasks,
  type ProjectDoc,
  type TaskDoc,
} from "@/lib/projects";
import { isGanttEligibleProject, matchesProjectFilter } from "@/lib/projectLifecycle";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import { filterTasksForWorkerView } from "@/lib/taskPlanningPermissions";
import { loadTaskProgressBatch } from "@/lib/projectTaskProgress";
import { listProjectPhases } from "@/services/projects/projectPhasesService";
import { listOrgMembers } from "@/lib/organizations";
import {
  buildGanttHierarchy,
  type GanttProjectNode,
  type GanttTaskNode,
} from "@/lib/ganttTimeline";
import { shiftTaskDate } from "@/lib/projectPlanningDates";
import { getTaskDateRange } from "@/lib/ganttTimeline";

export type GanttPlanningData = {
  projects: GanttProjectNode[];
  unscheduled: GanttTaskNode[];
  canEdit: boolean;
  tasksByProject: Record<string, TaskDoc[]>;
  projectList: ProjectDoc[];
  teamMembers: { id: string; name: string }[];
};

const MAX_PROJECTS = 30;

export async function fetchGanttPlanningData(
  workspace: ActiveWorkspace,
  userId: string,
  role?: WorkspaceRole
): Promise<GanttPlanningData> {
  const canEdit = canManageCompanyOperations(role);
  const allProjects = await listProjectsForWorkspace(workspace, userId);
  const progressByProject = await loadTaskProgressBatch(allProjects.map((p) => p.id)).catch(
    () => new Map<string, { percent: number }>()
  );
  const active = allProjects
    .filter(
      (p) =>
        isGanttEligibleProject(p) ||
        matchesProjectFilter(p, "active", {
          taskProgressPercent: progressByProject.get(p.id)?.percent ?? null,
        })
    )
    .slice(0, MAX_PROJECTS);

  const orgId = workspace.type === "company" ? (workspace.orgId ?? workspace.id) : null;
  const teamMembers = orgId
    ? (await listOrgMembers(orgId).catch(() => []))
        .filter((m) => m.status !== "removed")
        .map((m) => ({
          id: m.uid,
          name: m.displayName?.trim() || m.email || m.uid.slice(0, 8),
        }))
    : [];

  const phasesByProject = new Map<string, Awaited<ReturnType<typeof listProjectPhases>>>();
  const tasksByProject = new Map<string, TaskDoc[]>();

  await Promise.all(
    active.map(async (project) => {
      const [phases, tasks] = await Promise.all([
        listProjectPhases(project.id),
        listProjectTasks(project.id),
      ]);
      phasesByProject.set(project.id, phases);
      const visible = canEdit
        ? tasks
        : filterTasksForWorkerView(tasks, userId);
      tasksByProject.set(project.id, visible);
    })
  );

  const { projects, unscheduled } = buildGanttHierarchy({
    projects: active,
    phasesByProject,
    tasksByProject,
  });

  const tasksRecord: Record<string, TaskDoc[]> = {};
  for (const [k, v] of tasksByProject) tasksRecord[k] = v;

  return {
    projects,
    unscheduled,
    canEdit,
    tasksByProject: tasksRecord,
    projectList: active,
    teamMembers,
  };
}

export type TaskSchedulePatch = {
  plannedStart?: string | null;
  plannedEnd?: string | null;
  dueDate?: string | null;
};

export async function updateTaskSchedule(
  projectId: string,
  taskId: string,
  patch: TaskSchedulePatch
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.plannedStart !== undefined) data.plannedStart = patch.plannedStart;
  if (patch.plannedEnd !== undefined) data.plannedEnd = patch.plannedEnd;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;

  await updateDoc(doc(db, "projects", projectId, "tasks", taskId), data);
}

export async function assignTaskScheduleDate(
  projectId: string,
  taskId: string,
  dateYmd: string
): Promise<void> {
  await updateTaskSchedule(projectId, taskId, {
    plannedStart: dateYmd,
    dueDate: dateYmd,
    plannedEnd: null,
  });
}

export async function scheduleTaskOnTimeline(
  projectId: string,
  taskId: string,
  startYmd: string,
  durationDays = 1
): Promise<void> {
  const { addCalendarDays } = await import("@/lib/projectPlanningDates");
  const endYmd =
    durationDays <= 1 ? startYmd : addCalendarDays(startYmd, durationDays - 1);
  await updateTaskSchedule(projectId, taskId, {
    plannedStart: startYmd,
    plannedEnd: endYmd,
    dueDate: endYmd,
  });
}

export async function moveTaskScheduleByDays(
  projectId: string,
  task: TaskDoc,
  days: number,
  workingDaysOnly = false
): Promise<TaskSchedulePatch> {
  const range = getTaskDateRange(task);
  if (range.isUnscheduled || !range.startYmd) {
    throw new Error("Task has no schedule");
  }
  const newStart = shiftTaskDate(range.startYmd, days, workingDaysOnly);
  const newEnd = range.endYmd
    ? shiftTaskDate(range.endYmd, days, workingDaysOnly)
    : newStart;

  const patch: TaskSchedulePatch =
    range.canResize
      ? { plannedStart: newStart, plannedEnd: newEnd, dueDate: newEnd }
      : { plannedStart: newStart, dueDate: newStart, plannedEnd: null };

  await updateTaskSchedule(projectId, task.id, patch);
  return patch;
}

export async function shiftPhaseSchedule(
  projectId: string,
  tasks: TaskDoc[],
  phaseId: string,
  days: number,
  workingDaysOnly = false
): Promise<number> {
  const phaseTasks = tasks.filter((t) => {
    if (phaseId === "__general__") return !t.phaseId?.trim();
    return t.phaseId?.trim() === phaseId;
  });

  let count = 0;
  for (const task of phaseTasks) {
    const range = getTaskDateRange(task);
    if (range.isUnscheduled) continue;
    await moveTaskScheduleByDays(projectId, task, days, workingDaysOnly);
    count += 1;
  }
  return count;
}

export async function resizeTaskSchedule(
  projectId: string,
  task: TaskDoc,
  edge: "start" | "end",
  newDateYmd: string
): Promise<void> {
  const range = getTaskDateRange(task);
  if (!range.canResize) throw new Error("Task cannot be resized");

  if (edge === "start") {
    await updateTaskSchedule(projectId, task.id, {
      plannedStart: newDateYmd,
      dueDate: range.endYmd ?? newDateYmd,
    });
  } else {
    await updateTaskSchedule(projectId, task.id, {
      plannedEnd: newDateYmd,
      dueDate: newDateYmd,
    });
  }
}

export type { ProjectDoc, TaskDoc };
