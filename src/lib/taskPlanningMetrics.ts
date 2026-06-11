import type { TaskDoc } from "./projects";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import {
  getTaskPlanDate,
  taskMissingAssignee,
  taskMissingTools,
} from "./taskPlanningDisplay";

export type PlanningKpiMetrics = {
  total: number;
  assigned: number;
  withoutWorker: number;
  withoutTools: number;
  plannedHours: number | null;
  done: number;
};

export type MemberWorkload = {
  userId: string;
  name: string;
  taskCount: number;
  plannedHours: number | null;
  loadPercent: number;
  hasConflict?: boolean;
};

function parseIsoDateTime(raw?: string): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Estimated hours from plannedStart/plannedEnd when both exist. */
export function estimateTaskHours(task: TaskDoc): number | null {
  const start = parseIsoDateTime(task.plannedStart);
  const end = parseIsoDateTime(task.plannedEnd);
  if (!start || !end || end <= start) return null;
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return hours > 0 && hours < 168 ? Math.round(hours * 10) / 10 : null;
}

export function computePlanningKpis(tasks: TaskDoc[]): PlanningKpiMetrics {
  const open = tasks.filter((t) => t.status !== "DONE");
  let hoursSum = 0;
  let hoursKnown = 0;

  for (const task of open) {
    const h = estimateTaskHours(task);
    if (h != null) {
      hoursSum += h;
      hoursKnown += 1;
    }
  }

  return {
    total: tasks.length,
    assigned: open.filter((t) => !taskMissingAssignee(t)).length,
    withoutWorker: open.filter((t) => taskMissingAssignee(t)).length,
    withoutTools: open.filter((t) => taskMissingTools(t)).length,
    plannedHours: hoursKnown > 0 ? Math.round(hoursSum * 10) / 10 : null,
    done: tasks.filter((t) => t.status === "DONE").length,
  };
}

export function computeMemberWorkloads(
  tasks: TaskDoc[],
  members: ProjectMemberRecord[],
  conflictUserIds: Set<string> = new Set()
): MemberWorkload[] {
  const open = tasks.filter((t) => t.status !== "DONE");
  const byUser = new Map<string, { count: number; hours: number; hoursKnown: number }>();

  for (const task of open) {
    const uid = task.assigneeId?.trim();
    if (!uid) continue;
    const row = byUser.get(uid) ?? { count: 0, hours: 0, hoursKnown: 0 };
    row.count += 1;
    const h = estimateTaskHours(task);
    if (h != null) {
      row.hours += h;
      row.hoursKnown += 1;
    }
    byUser.set(uid, row);
  }

  const workloads: MemberWorkload[] = members.map((m) => {
    const row = byUser.get(m.userId);
    const taskCount = row?.count ?? 0;
    const plannedHours =
      row && row.hoursKnown > 0 ? Math.round(row.hours * 10) / 10 : null;
    return {
      userId: m.userId,
      name: m.name?.trim() || m.email || m.userId,
      taskCount,
      plannedHours,
      loadPercent: 0,
      hasConflict: conflictUserIds.has(m.userId),
    };
  });

  const maxTasks = Math.max(1, ...workloads.map((w) => w.taskCount));
  const maxHours = Math.max(
    1,
    ...workloads.map((w) => w.plannedHours ?? 0).filter((h) => h > 0)
  );
  const anyHours = workloads.some((w) => w.plannedHours != null && w.plannedHours > 0);

  for (const w of workloads) {
    if (anyHours && w.plannedHours != null) {
      w.loadPercent = Math.min(100, Math.round((w.plannedHours / maxHours) * 100));
    } else {
      w.loadPercent = Math.min(100, Math.round((w.taskCount / maxTasks) * 100));
    }
  }

  return workloads.sort((a, b) => b.taskCount - a.taskCount);
}

export function countUnassignedOpenTasks(tasks: TaskDoc[]): number {
  return tasks.filter((t) => t.status !== "DONE" && taskMissingAssignee(t)).length;
}
