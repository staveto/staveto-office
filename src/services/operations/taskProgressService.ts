import type { TaskDoc, ProjectDoc } from "@/lib/projects";
import { buildTaskProgress, type TaskProgressItem } from "@/lib/operationsMetrics";

export function buildTaskProgressBoard(
  tasks: TaskDoc[],
  projects: ProjectDoc[],
  minutesByTaskId: Map<string, number>
): TaskProgressItem[] {
  const map = new Map(projects.map((p) => [p.id, p]));
  return buildTaskProgress(tasks, map, minutesByTaskId);
}
