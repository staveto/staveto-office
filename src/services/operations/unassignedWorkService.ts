import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import { computeUnassignedWork, type UnassignedWorkGroup } from "@/lib/operationsMetrics";

export function buildUnassignedWork(
  projects: ProjectDoc[],
  tasks: TaskDoc[]
): UnassignedWorkGroup[] {
  return computeUnassignedWork(projects, tasks);
}
