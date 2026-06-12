import type { ProjectDoc, TaskDoc } from "./projects";
import type { ProjectPhaseMetrics } from "./projectPhaseMetrics";
import { taskMissingAssignee, taskMissingTools, getTaskPlanDate } from "./taskPlanningDisplay";

export type ProjectHealthStatus = "ON_TRACK" | "ATTENTION" | "BLOCKED";

export type ProjectHealthReason = {
  /** i18n key under projects.health.reason.* */
  key: string;
  params?: Record<string, string | number>;
  severity: "blocked" | "attention";
};

export type ProjectHealth = {
  status: ProjectHealthStatus;
  reasons: ProjectHealthReason[];
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function isOpen(task: TaskDoc): boolean {
  const s = (task.status ?? "OPEN").toUpperCase();
  return s !== "DONE";
}

function isBlockedStatus(task: TaskDoc): boolean {
  return (task.status ?? "").toUpperCase() === "BLOCKED";
}

function isOverdue(task: TaskDoc, today: string): boolean {
  if (!isOpen(task)) return false;
  const date = getTaskPlanDate(task);
  return !!date && date < today;
}

/** Critical task proxy: `required` flagged tasks (no explicit priority model yet). */
function isCritical(task: TaskDoc): boolean {
  return task.required === true;
}

/**
 * Derive a manager-facing project health signal from existing data only.
 * No new fields, no fake data. When a priority model is missing, overdue /
 * blocked / active-phase-without-assignee are treated as critical.
 */
export function computeProjectHealth(input: {
  project: ProjectDoc;
  tasks: TaskDoc[];
  phaseMetrics: ProjectPhaseMetrics;
  assignedCrewCount: number;
}): ProjectHealth {
  const { tasks, phaseMetrics, assignedCrewCount } = input;
  const today = todayYmd();
  const open = tasks.filter((t) => t.isActive !== false && isOpen(t));

  const reasons: ProjectHealthReason[] = [];

  // ---- BLOCKED signals ----
  const blockedTasks = open.filter(isBlockedStatus);
  const overdueCritical = open.filter((t) => isOverdue(t, today) && isCritical(t));
  const criticalNoAssignee = open.filter(
    (t) => isCritical(t) && taskMissingAssignee(t)
  );

  const activePhase = phaseMetrics.phases.find((p) => p.isActive) ?? null;
  const activePhaseHasNoCrew =
    !!activePhase && activePhase.total > 0 && activePhase.assignedCount === 0;

  if (blockedTasks.length > 0) {
    reasons.push({
      key: "projects.health.reason.blockedTasks",
      params: { count: blockedTasks.length },
      severity: "blocked",
    });
  }
  if (overdueCritical.length > 0) {
    reasons.push({
      key: "projects.health.reason.overdueCritical",
      params: { count: overdueCritical.length },
      severity: "blocked",
    });
  }
  if (activePhaseHasNoCrew && activePhase) {
    reasons.push({
      key: "projects.health.reason.activePhaseNoCrew",
      params: { phase: activePhase.name },
      severity: "blocked",
    });
  }
  if (criticalNoAssignee.length > 0) {
    reasons.push({
      key: "projects.health.reason.criticalNoAssignee",
      params: { count: criticalNoAssignee.length },
      severity: "blocked",
    });
  }

  // ---- ATTENTION signals ----
  const noAssignee = open.filter(taskMissingAssignee);
  const noTools = open.filter(taskMissingTools);
  const overdue = open.filter((t) => isOverdue(t, today));
  const plannedNoDate = open.filter(
    (t) => !!t.assigneeId?.trim() && !getTaskPlanDate(t)
  );

  if (assignedCrewCount === 0) {
    reasons.push({
      key: "projects.health.reason.noCrew",
      severity: "attention",
    });
  }
  if (noAssignee.length > 0) {
    reasons.push({
      key: "projects.health.reason.tasksNoAssignee",
      params: { count: noAssignee.length },
      severity: "attention",
    });
  }
  if (overdue.length > 0) {
    reasons.push({
      key: "projects.health.reason.overdueTasks",
      params: { count: overdue.length },
      severity: "attention",
    });
  }
  if (noTools.length > 0) {
    reasons.push({
      key: "projects.health.reason.tasksNoTools",
      params: { count: noTools.length },
      severity: "attention",
    });
  }
  if (plannedNoDate.length > 0) {
    reasons.push({
      key: "projects.health.reason.plannedNoDate",
      params: { count: plannedNoDate.length },
      severity: "attention",
    });
  }

  const hasBlocked = reasons.some((r) => r.severity === "blocked");
  const hasAttention = reasons.some((r) => r.severity === "attention");

  const status: ProjectHealthStatus = hasBlocked
    ? "BLOCKED"
    : hasAttention
      ? "ATTENTION"
      : "ON_TRACK";

  // Keep blocked reasons first, most relevant for the manager.
  reasons.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "blocked" ? -1 : 1));

  return { status, reasons };
}
