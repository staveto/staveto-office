import type { TaskDoc } from "./projects";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";

/** Per-phase progress used by the phase workflow stepper and overview. */
export type PhaseMetric = {
  id: string;
  name: string;
  order: number;
  total: number;
  done: number;
  open: number;
  percent: number;
  assignedCount: number;
  isGeneral: boolean;
  /** Current phase the crew should be working on. */
  isActive: boolean;
  /** All tasks in the phase are DONE (and there is at least one task). */
  isComplete: boolean;
};

export type ProjectPhaseMetrics = {
  phases: PhaseMetric[];
  activePhaseId: string | null;
  activePhaseName: string | null;
  overallPercent: number;
  totalTasks: number;
  doneTasks: number;
  hasPhases: boolean;
};

const GENERAL_ID = "__general__";

function activeTasks(tasks: TaskDoc[]): TaskDoc[] {
  return tasks.filter((t) => t.isActive !== false);
}

/**
 * Build ordered phase metrics from the real `projects/{id}/phases` records
 * plus the project tasks. Tasks whose `phaseId` does not match any phase
 * (or have none) fall into a trailing "General" bucket — but only when such
 * tasks exist. The active phase is the first incomplete phase by order.
 */
export function computeProjectPhaseMetrics(
  phases: ProjectPhaseRecord[],
  tasks: TaskDoc[]
): ProjectPhaseMetrics {
  const list = activeTasks(tasks);
  const knownPhaseIds = new Set(phases.map((p) => p.id));

  const buildMetric = (
    id: string,
    name: string,
    order: number,
    phaseTasks: TaskDoc[],
    isGeneral: boolean
  ): PhaseMetric => {
    const total = phaseTasks.length;
    const done = phaseTasks.filter((t) => t.status === "DONE").length;
    const assignedCount = phaseTasks.filter((t) => t.assigneeId?.trim()).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return {
      id,
      name,
      order,
      total,
      done,
      open: total - done,
      percent,
      assignedCount,
      isGeneral,
      isActive: false,
      isComplete: total > 0 && done === total,
    };
  };

  const metrics: PhaseMetric[] = phases
    .slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((phase, index) =>
      buildMetric(
        phase.id,
        phase.name,
        phase.order ?? index,
        list.filter((t) => t.phaseId?.trim() === phase.id),
        false
      )
    );

  const generalTasks = list.filter(
    (t) => !t.phaseId?.trim() || !knownPhaseIds.has(t.phaseId.trim())
  );
  if (generalTasks.length > 0) {
    metrics.push(
      buildMetric(GENERAL_ID, GENERAL_ID, metrics.length, generalTasks, true)
    );
  }

  // Active phase = first phase (by order) that still has open tasks.
  // If everything is complete, the last phase is the active/current one.
  let activeIndex = metrics.findIndex((m) => m.total > 0 && m.done < m.total);
  if (activeIndex === -1 && metrics.length > 0) {
    activeIndex = metrics.length - 1;
  }
  if (activeIndex >= 0 && metrics[activeIndex]) {
    metrics[activeIndex].isActive = true;
  }

  const totalTasks = list.length;
  const doneTasks = list.filter((t) => t.status === "DONE").length;
  const overallPercent =
    totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);
  const active = activeIndex >= 0 ? metrics[activeIndex] : null;

  return {
    phases: metrics,
    activePhaseId: active?.id ?? null,
    activePhaseName: active && !active.isGeneral ? active.name : null,
    overallPercent,
    totalTasks,
    doneTasks,
    hasPhases: phases.length > 0,
  };
}

export function isGeneralPhaseId(id: string | null | undefined): boolean {
  return !id || id === GENERAL_ID;
}

export const GENERAL_PHASE_ID = GENERAL_ID;
