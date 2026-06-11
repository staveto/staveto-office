import type { TaskDoc } from "./projects";
import { getTaskPlanDate } from "./taskPlanningDisplay";

export type ToolConflict = {
  type: "TOOL_CONFLICT";
  toolId: string;
  toolName: string;
  taskIds: string[];
  message: string;
};

export type WorkerConflict = {
  type: "WORKER_CONFLICT";
  assigneeId: string;
  assigneeName: string;
  taskIds: string[];
  message: string;
};

type TimeRange = { start: number; end: number };

function parseDateOnly(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function getTaskTimeRange(task: TaskDoc): TimeRange | null {
  const startRaw = task.plannedStart?.trim();
  const endRaw = task.plannedEnd?.trim();
  const planDate = getTaskPlanDate(task);

  if (startRaw && endRaw) {
    const start = new Date(startRaw).getTime();
    const end = new Date(endRaw).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      return { start, end };
    }
  }

  if (planDate) {
    const dayStart = parseDateOnly(planDate);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;
    return { start: dayStart, end: dayEnd };
  }

  return null;
}

function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function toolNameFromTask(task: TaskDoc, toolId: string): string {
  const tool = task.assignedTools?.find((t) => t.id === toolId);
  return tool?.name?.trim() || toolId;
}

export function detectToolConflicts(tasks: TaskDoc[]): ToolConflict[] {
  const open = tasks.filter((t) => t.status !== "DONE");
  const byTool = new Map<string, TaskDoc[]>();

  for (const task of open) {
    const ids = task.assignedToolIds ?? task.assignedTools?.map((t) => t.id) ?? [];
    for (const toolId of ids) {
      if (!toolId) continue;
      const list = byTool.get(toolId) ?? [];
      list.push(task);
      byTool.set(toolId, list);
    }
  }

  const conflicts: ToolConflict[] = [];

  for (const [toolId, toolTasks] of byTool) {
    if (toolTasks.length < 2) continue;

    const conflictingIds = new Set<string>();
    for (let i = 0; i < toolTasks.length; i++) {
      const rangeA = getTaskTimeRange(toolTasks[i]);
      if (!rangeA) continue;
      for (let j = i + 1; j < toolTasks.length; j++) {
        const rangeB = getTaskTimeRange(toolTasks[j]);
        if (!rangeB) continue;
        if (rangesOverlap(rangeA, rangeB)) {
          conflictingIds.add(toolTasks[i].id);
          conflictingIds.add(toolTasks[j].id);
        }
      }
    }

    if (conflictingIds.size >= 2) {
      const taskIds = [...conflictingIds];
      const name = toolNameFromTask(toolTasks[0], toolId);
      conflicts.push({
        type: "TOOL_CONFLICT",
        toolId,
        toolName: name,
        taskIds,
        message: name,
      });
    }
  }

  return conflicts;
}

export function detectWorkerConflicts(tasks: TaskDoc[]): WorkerConflict[] {
  const open = tasks.filter((t) => t.status !== "DONE" && t.assigneeId?.trim());
  const byWorker = new Map<string, TaskDoc[]>();

  for (const task of open) {
    const uid = task.assigneeId!.trim();
    const list = byWorker.get(uid) ?? [];
    list.push(task);
    byWorker.set(uid, list);
  }

  const conflicts: WorkerConflict[] = [];

  for (const [assigneeId, workerTasks] of byWorker) {
    if (workerTasks.length < 2) continue;
    const conflictingIds = new Set<string>();

    for (let i = 0; i < workerTasks.length; i++) {
      const rangeA = getTaskTimeRange(workerTasks[i]);
      if (!rangeA) continue;
      for (let j = i + 1; j < workerTasks.length; j++) {
        const rangeB = getTaskTimeRange(workerTasks[j]);
        if (!rangeB) continue;
        if (rangesOverlap(rangeA, rangeB)) {
          conflictingIds.add(workerTasks[i].id);
          conflictingIds.add(workerTasks[j].id);
        }
      }
    }

    if (conflictingIds.size >= 2) {
      conflicts.push({
        type: "WORKER_CONFLICT",
        assigneeId,
        assigneeName: workerTasks[0].assigneeName?.trim() || assigneeId,
        taskIds: [...conflictingIds],
        message: workerTasks[0].assigneeName?.trim() || assigneeId,
      });
    }
  }

  return conflicts;
}

export function workerConflictUserIds(conflicts: WorkerConflict[]): Set<string> {
  return new Set(conflicts.map((c) => c.assigneeId));
}
