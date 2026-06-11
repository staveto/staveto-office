import type { TaskDoc } from "./projects";
import type { ProjectDoc } from "./projects";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";

export function getTaskPlanDate(task: TaskDoc): string | undefined {
  const raw = task.plannedStart?.slice(0, 10) || task.dueDate?.slice(0, 10);
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

export function taskMissingAssignee(task: TaskDoc): boolean {
  return !task.assigneeId?.trim();
}

export function taskMissingTools(task: TaskDoc): boolean {
  const tools = task.assignedTools ?? [];
  const ids = task.assignedToolIds ?? [];
  return tools.length === 0 && ids.length === 0;
}

export function getTaskToolsLabel(task: TaskDoc): string {
  const tools = task.assignedTools ?? [];
  if (tools.length > 0) return tools.map((t) => t.name).join(", ");
  if ((task.assignedToolIds ?? []).length > 0) {
    return `${task.assignedToolIds!.length}`;
  }
  return "";
}

export function shouldGroupTasksByPhase(project: ProjectDoc, tasks: TaskDoc[]): boolean {
  if (tasks.some((t) => !!t.phaseId?.trim())) return true;
  if (project.projectType === "BUILD") return true;
  return false;
}

export function buildPhaseLabelMap(phases: ProjectPhaseRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const phase of phases) {
    map.set(phase.id, phase.name);
  }
  return map;
}

export function resolvePhaseLabel(
  phaseId: string | null | undefined,
  phaseLabels: Map<string, string>,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (!phaseId?.trim()) return t("projects.dashboard.phaseGeneral");
  return phaseLabels.get(phaseId) ?? phaseId;
}
