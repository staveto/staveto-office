/**
 * Planning Command Center model.
 *
 * Pure, framework-agnostic aggregation built on top of the existing
 * `PlanningDashboardData` (see `services/planning/planningReadService`).
 * No fetches, no writes, no schema changes — it only re-shapes data already
 * loaded for the planning page into a manager-focused "what needs action next"
 * cockpit.
 */
import type { TaskDoc } from "@/lib/projects";
import type {
  PlanningDashboardData,
  PlanningMember,
  PlanningProjectSummary,
} from "@/services/planning";

export type NormalizedTaskStatus = "open" | "doing" | "done" | "blocked";

export function normalizeTaskStatus(raw: string | null | undefined): NormalizedTaskStatus {
  const s = (raw ?? "OPEN").toString().trim().toUpperCase();
  if (s === "DONE" || s === "COMPLETED" || s === "CLOSED") return "done";
  if (s === "BLOCKED" || s === "ON_HOLD") return "blocked";
  if (s === "IN_PROGRESS" || s === "IN_WORK" || s === "DOING" || s === "STARTED") return "doing";
  return "open";
}

/** Single planned date for a task (planned start, else due date). */
export function taskPlanDate(task: TaskDoc): string | null {
  const planned = task.plannedStart?.slice(0, 10);
  if (planned && /^\d{4}-\d{2}-\d{2}$/.test(planned)) return planned;
  const due = task.dueDate?.slice(0, 10);
  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  return null;
}

export function taskHasAssignee(task: TaskDoc): boolean {
  return !!task.assigneeId && task.assigneeId.trim().length > 0;
}

export type PlanningIssueKind =
  | "jobsWithoutCrew"
  | "tasksWithoutAssignee"
  | "tasksWithoutDate"
  | "overdueTasks"
  | "blockedTasks"
  | "fieldNotes";

export type PlanningIssueAction = "assign" | "plan" | "review" | "gantt";

export type PlanningIssueRow = {
  kind: PlanningIssueKind;
  count: number;
  action: PlanningIssueAction;
  href: string;
};

export type PlanningStatusStrip = {
  teamMembers: number;
  activeJobs: number;
  assignedWorkers: number;
  absencesToday: number | null;
  tasksDueToday: number;
  unplannedTasks: number;
};

export type WorkerCapacityStatus = "free" | "assigned" | "working" | "absent" | "unknown";

export type WorkerCapacity = {
  uid: string;
  name: string;
  status: WorkerCapacityStatus;
  openTaskCount: number;
  assignedJobCount: number;
  /** Overloaded heuristic: many open tasks for a single worker. */
  overloaded: boolean;
};

export type JobHealth = "ok" | "warn" | "risk";

export type JobRequiringPlanning = {
  projectId: string;
  name: string;
  customer: string | null;
  crewCount: number;
  openTaskCount: number;
  unplannedTaskCount: number;
  unassignedTaskCount: number;
  blockedCount: number;
  health: JobHealth;
  /** Machine-readable reasons (i18n keys resolved in the UI). */
  reasons: PlanningIssueKind[];
};

export type UnplannedTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  phaseId: string | null;
  date: string | null;
  assigneeName: string | null;
  hasAssignee: boolean;
  hasDate: boolean;
  overdue: boolean;
  blocked: boolean;
};

export type UnplannedWorkGroups = {
  withoutAssignee: UnplannedTask[];
  withoutDate: UnplannedTask[];
  overdue: UnplannedTask[];
  blocked: UnplannedTask[];
};

export type PlanningCommandCenter = {
  statusStrip: PlanningStatusStrip;
  issues: PlanningIssueRow[];
  hasPlanningWork: boolean;
  workers: WorkerCapacity[];
  jobsRequiringPlanning: JobRequiringPlanning[];
  unplannedWork: UnplannedWorkGroups;
  totals: {
    jobsWithoutCrew: number;
    tasksWithoutAssignee: number;
    tasksWithoutDate: number;
    overdueTasks: number;
    blockedTasks: number;
  };
};

const GANTT_HREF = "/app/planning/gantt";
const OVERLOAD_THRESHOLD = 8;

function projectCustomer(summary: PlanningProjectSummary): string | null {
  const p = summary.project;
  return (
    p.customerName?.trim() ||
    p.customerCompanyName?.trim() ||
    p.customerContactPersonName?.trim() ||
    null
  );
}

function toUnplannedTask(
  task: TaskDoc,
  projectName: string,
  todayIso: string
): UnplannedTask {
  const date = taskPlanDate(task);
  const status = normalizeTaskStatus(task.status);
  const hasAssignee = taskHasAssignee(task);
  return {
    id: task.id,
    projectId: task.projectId,
    projectName,
    title: task.title,
    phaseId: task.phaseId ?? null,
    date,
    assigneeName: task.assigneeName?.trim() || null,
    hasAssignee,
    hasDate: !!date,
    overdue: !!date && date < todayIso,
    blocked: status === "blocked",
  };
}

/**
 * Build the manager command-center model.
 *
 * @param data   Existing planning dashboard data (members, projects, tasks…).
 * @param options.fieldNotesCount Open shared field notes (optional, separate read).
 */
export function buildPlanningCommandCenter(
  data: PlanningDashboardData,
  options?: { fieldNotesCount?: number | null }
): PlanningCommandCenter {
  const todayIso = data.todayIso;

  const projectById = new Map<string, PlanningProjectSummary>();
  for (const ps of data.activeProjects) projectById.set(ps.project.id, ps);

  const activeProjectIds = new Set(projectById.keys());

  // Only consider open, non-archived tasks belonging to active jobs.
  const openTasks = data.allTaskDocs.filter((t) => {
    if (t.isActive === false) return false;
    if (!activeProjectIds.has(t.projectId)) return false;
    return normalizeTaskStatus(t.status) !== "done";
  });

  const tasksWithoutAssignee: UnplannedTask[] = [];
  const tasksWithoutDate: UnplannedTask[] = [];
  const overdueTasks: UnplannedTask[] = [];
  const blockedTasks: UnplannedTask[] = [];

  // Per-job rollups.
  const jobOpen = new Map<string, number>();
  const jobUnassigned = new Map<string, number>();
  const jobUndated = new Map<string, number>();
  const jobBlocked = new Map<string, number>();
  const jobUnplanned = new Map<string, number>();

  // Per-worker open task counts.
  const openTaskByAssignee = new Map<string, number>();

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const task of openTasks) {
    const summary = projectById.get(task.projectId);
    const projectName = summary?.project.name ?? task.projectId.slice(0, 8);
    const row = toUnplannedTask(task, projectName, todayIso);

    bump(jobOpen, task.projectId);
    if (row.hasAssignee && task.assigneeId) {
      bump(openTaskByAssignee, task.assigneeId.trim());
    }

    let unplanned = false;
    if (!row.hasAssignee) {
      tasksWithoutAssignee.push(row);
      bump(jobUnassigned, task.projectId);
      unplanned = true;
    }
    if (!row.hasDate) {
      tasksWithoutDate.push(row);
      bump(jobUndated, task.projectId);
      unplanned = true;
    }
    if (row.overdue) overdueTasks.push(row);
    if (row.blocked) {
      blockedTasks.push(row);
      bump(jobBlocked, task.projectId);
    }
    if (unplanned) bump(jobUnplanned, task.projectId);
  }

  const sortByDate = (a: UnplannedTask, b: UnplannedTask) =>
    (a.date ?? "9999").localeCompare(b.date ?? "9999");
  tasksWithoutAssignee.sort(sortByDate);
  tasksWithoutDate.sort((a, b) => a.projectName.localeCompare(b.projectName));
  overdueTasks.sort(sortByDate);

  // Jobs without crew (active jobs with empty assignedMemberIds).
  const jobsWithoutCrew = data.activeProjects.filter(
    (ps) => (ps.assignedMemberIds?.length ?? 0) === 0
  );

  // Jobs requiring planning: missing crew, unplanned tasks, or blocked work.
  const jobsRequiringPlanning: JobRequiringPlanning[] = [];
  for (const ps of data.activeProjects) {
    const id = ps.project.id;
    const crewCount = ps.assignedMemberIds?.length ?? 0;
    const openCount = jobOpen.get(id) ?? 0;
    const unassigned = jobUnassigned.get(id) ?? 0;
    const undated = jobUndated.get(id) ?? 0;
    const blocked = jobBlocked.get(id) ?? 0;
    const unplanned = jobUnplanned.get(id) ?? 0;

    const reasons: PlanningIssueKind[] = [];
    if (crewCount === 0) reasons.push("jobsWithoutCrew");
    if (unassigned > 0) reasons.push("tasksWithoutAssignee");
    if (undated > 0) reasons.push("tasksWithoutDate");
    if (blocked > 0) reasons.push("blockedTasks");
    if (reasons.length === 0) continue;

    const health: JobHealth =
      blocked > 0 || (crewCount === 0 && openCount > 0)
        ? "risk"
        : "warn";

    jobsRequiringPlanning.push({
      projectId: id,
      name: ps.project.name,
      customer: projectCustomer(ps),
      crewCount,
      openTaskCount: openCount,
      unplannedTaskCount: unplanned,
      unassignedTaskCount: unassigned,
      blockedCount: blocked,
      health,
      reasons,
    });
  }
  // Risk first, then most unplanned work.
  jobsRequiringPlanning.sort((a, b) => {
    const order = { risk: 0, warn: 1, ok: 2 } as const;
    if (order[a.health] !== order[b.health]) return order[a.health] - order[b.health];
    return b.unplannedTaskCount + b.blockedCount - (a.unplannedTaskCount + a.blockedCount);
  });

  // Worker capacity from members + open task assignment + today status.
  const workers: WorkerCapacity[] = data.members
    .map<WorkerCapacity>((m: PlanningMember) => {
      const openTaskCount = openTaskByAssignee.get(m.uid) ?? 0;
      let status: WorkerCapacityStatus;
      if (m.todayStatus === "absent") status = "absent";
      else if (m.todayStatus === "working") status = "working";
      else if (openTaskCount > 0) status = "assigned";
      else if (m.todayStatus === "no_record") status = "free";
      else status = "unknown";
      return {
        uid: m.uid,
        name: m.displayName,
        status,
        openTaskCount,
        assignedJobCount: m.assignedProjectCount,
        overloaded: openTaskCount >= OVERLOAD_THRESHOLD,
      };
    })
    .sort((a, b) => {
      const rank: Record<WorkerCapacityStatus, number> = {
        absent: 0,
        working: 1,
        assigned: 2,
        free: 3,
        unknown: 4,
      };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return b.openTaskCount - a.openTaskCount;
    });

  const unplannedTasksCount = openTasks.filter(
    (t) => !taskHasAssignee(t) || !taskPlanDate(t)
  ).length;

  const statusStrip: PlanningStatusStrip = {
    teamMembers: data.stats.teamMemberCount,
    activeJobs: data.stats.activeJobCount,
    assignedWorkers: data.stats.assignedWorkerCount,
    absencesToday: data.stats.absencesTodayCount,
    tasksDueToday: data.tasksDueToday.length,
    unplannedTasks: unplannedTasksCount,
  };

  const fieldNotesCount = options?.fieldNotesCount ?? null;

  const issues: PlanningIssueRow[] = [];
  if (jobsWithoutCrew.length > 0) {
    issues.push({
      kind: "jobsWithoutCrew",
      count: jobsWithoutCrew.length,
      action: "gantt",
      href: GANTT_HREF,
    });
  }
  if (tasksWithoutAssignee.length > 0) {
    issues.push({
      kind: "tasksWithoutAssignee",
      count: tasksWithoutAssignee.length,
      action: "assign",
      href: `${GANTT_HREF}?filter=unassigned`,
    });
  }
  if (tasksWithoutDate.length > 0) {
    issues.push({
      kind: "tasksWithoutDate",
      count: tasksWithoutDate.length,
      action: "plan",
      href: GANTT_HREF,
    });
  }
  if (overdueTasks.length > 0) {
    issues.push({
      kind: "overdueTasks",
      count: overdueTasks.length,
      action: "review",
      href: `${GANTT_HREF}?filter=overdue`,
    });
  }
  if (blockedTasks.length > 0) {
    issues.push({
      kind: "blockedTasks",
      count: blockedTasks.length,
      action: "review",
      href: GANTT_HREF,
    });
  }
  if (typeof fieldNotesCount === "number" && fieldNotesCount > 0) {
    issues.push({
      kind: "fieldNotes",
      count: fieldNotesCount,
      action: "review",
      href: "/app",
    });
  }

  return {
    statusStrip,
    issues,
    hasPlanningWork: issues.some((i) => i.kind !== "fieldNotes"),
    workers,
    jobsRequiringPlanning,
    unplannedWork: {
      withoutAssignee: tasksWithoutAssignee,
      withoutDate: tasksWithoutDate,
      overdue: overdueTasks,
      blocked: blockedTasks,
    },
    totals: {
      jobsWithoutCrew: jobsWithoutCrew.length,
      tasksWithoutAssignee: tasksWithoutAssignee.length,
      tasksWithoutDate: tasksWithoutDate.length,
      overdueTasks: overdueTasks.length,
      blockedTasks: blockedTasks.length,
    },
  };
}
