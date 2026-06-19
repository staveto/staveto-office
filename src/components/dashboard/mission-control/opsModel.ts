/**
 * Company Home view model — a workflow-centric operations board derived from the
 * existing MissionControlData. Pure transformation, no new backend calls.
 */
import type { MissionControlData } from "@/lib/missionControlData";
import type { OpsTone } from "./opsStyles";

export type OpsActionPriority = "high" | "medium" | "normal";

export type OpsAction = {
  id: string;
  titleKey: string;
  titleParams?: Record<string, number | string>;
  descKey: string;
  priority: OpsActionPriority;
  actionLabelKey: string;
  href: string;
};

export type OpsResource = {
  id: string;
  name: string;
  statusKey: string;
  tone: OpsTone;
  href?: string;
};

export type OpsFinanceRow = {
  id: string;
  labelKey: string;
  value: number;
  href: string;
  emphasize: boolean;
};

export type OpsStatusChip = {
  id: string;
  labelKey: string;
  params?: Record<string, number | string>;
};

export type OpsWorkflowStageId = "quotes" | "planned" | "active" | "review" | "done";

export type OpsWorkflowStage = {
  id: OpsWorkflowStageId;
  labelKey: string;
  value: number;
  href: string;
  tone: OpsTone;
};

export type OpsView = {
  workflow: OpsWorkflowStage[];
  workflowInsight: boolean;
  nextActions: OpsAction[];
  finance: OpsFinanceRow[];
  team: OpsResource[];
  vehicles: OpsResource[];
  capacity: {
    workersAvailable: number;
    vehiclesAvailable: number;
    absences: number;
    activeJobs: number;
    quotes: number;
    todayTitle: string | null;
  };
  statusChips: OpsStatusChip[];
  statusTone: "calm" | "attention";
  statusLabelKey: string;
  statusMessageKey: string;
  statusMessageParams?: Record<string, number | string>;
};

const VEHICLE_FREE_KEY = "dashboard.mission.vehicle.free";
const VEHICLE_SERVICE_KEY = "dashboard.mission.vehicle.service";

export function buildOpsView(
  data: MissionControlData,
  opts: { showFinance: boolean }
): OpsView {
  const { planning, stats, taskMetrics } = data;

  const quotes = stats.quotesAwaitingCount;
  const planned = stats.draftJobsCount;
  const activeJobs = planning.stats.activeJobCount;
  const absences = planning.stats.absencesTodayCount ?? 0;
  const unassignedTasks = taskMetrics.withoutWorker;
  const noToolsTasks = taskMetrics.withoutTools;
  const delayedJobs = stats.delayedJobsCount;
  const missingAttendance = planning.stats.missingAttendanceCount ?? 0;
  const todayHasWork = data.todayRows.length > 0;
  const todayTitle = todayHasWork ? data.todayRows[0].title : null;

  const workersAvailable = data.team.filter((m) => m.statusTone === "free").length;
  const vehiclesAvailable = data.vehicles.filter((v) => v.statusKey === VEHICLE_FREE_KEY).length;
  const unassignedJobs = planning.activeProjects.filter(
    (p) => p.assignedMemberIds.length === 0
  ).length;

  // ---- Workflow board (the dominant element) -------------------------------
  // Review / Done are not tracked in the data layer yet → safe 0 fallback.
  // Tones stay neutral by default; the board emphasizes a single active stage
  // (the earliest stage that still holds open work) with the orange accent so
  // colour is reserved for the one place that needs attention.
  const workflow: OpsWorkflowStage[] = [
    { id: "quotes", labelKey: "dashboard.ops.flow.quotes", value: quotes, href: "/app/quotes", tone: quotes > 0 ? "warning" : "neutral" },
    { id: "planned", labelKey: "dashboard.ops.flow.planned", value: planned, href: "/app/projects", tone: "neutral" },
    { id: "active", labelKey: "dashboard.ops.flow.active", value: activeJobs, href: "/app/projects?filter=active", tone: "neutral" },
    { id: "review", labelKey: "dashboard.ops.flow.review", value: 0, href: "/app/projects", tone: "neutral" },
    { id: "done", labelKey: "dashboard.ops.flow.done", value: 0, href: "/app/projects", tone: "neutral" },
  ];
  const workflowInsight = quotes > 0 && activeJobs === 0;

  // ---- Next steps (max 3) --------------------------------------------------
  const actions: OpsAction[] = [];

  if (opts.showFinance && quotes > 0) {
    actions.push({
      id: "quotes",
      titleKey: "dashboard.ops.action.quotes.title",
      titleParams: { count: quotes },
      descKey: "dashboard.ops.action.quotes.desc",
      priority: "high",
      actionLabelKey: "dashboard.ops.action.quotes.cta",
      href: "/app/quotes",
    });
  }
  if (delayedJobs > 0) {
    actions.push({
      id: "delayed",
      titleKey: "dashboard.ops.action.delayed.title",
      titleParams: { count: delayedJobs },
      descKey: "dashboard.ops.action.delayed.desc",
      priority: "high",
      actionLabelKey: "dashboard.ops.action.delayed.cta",
      href: "/app/projects?filter=active",
    });
  }
  if (!todayHasWork) {
    actions.push({
      id: "no-work",
      titleKey: "dashboard.ops.action.noWork.title",
      descKey: "dashboard.ops.action.noWork.desc",
      priority: "medium",
      actionLabelKey: "dashboard.ops.action.noWork.cta",
      href: "/app/planning",
    });
  }
  if (unassignedTasks > 0) {
    actions.push({
      id: "unassigned-tasks",
      titleKey: "dashboard.ops.action.unassignedTasks.title",
      titleParams: { count: unassignedTasks },
      descKey: "dashboard.ops.action.unassignedTasks.desc",
      priority: "medium",
      actionLabelKey: "dashboard.ops.action.unassignedTasks.cta",
      href: "/app/planning",
    });
  }
  if (missingAttendance > 0) {
    actions.push({
      id: "attendance",
      titleKey: "dashboard.ops.action.attendance.title",
      titleParams: { count: missingAttendance },
      descKey: "dashboard.ops.action.attendance.desc",
      priority: "medium",
      actionLabelKey: "dashboard.ops.action.attendance.cta",
      href: "/app/attendance",
    });
  }
  if (noToolsTasks > 0) {
    actions.push({
      id: "no-tools",
      titleKey: "dashboard.ops.action.noTools.title",
      titleParams: { count: noToolsTasks },
      descKey: "dashboard.ops.action.noTools.desc",
      priority: "normal",
      actionLabelKey: "dashboard.ops.action.noTools.cta",
      href: "/app/planning",
    });
  }
  if (unassignedJobs > 0) {
    actions.push({
      id: "unassigned-jobs",
      titleKey: "dashboard.ops.action.unassignedJobs.title",
      titleParams: { count: unassignedJobs },
      descKey: "dashboard.ops.action.unassignedJobs.desc",
      priority: "normal",
      actionLabelKey: "dashboard.ops.action.unassignedJobs.cta",
      href: "/app/projects?filter=active",
    });
  }
  if (workersAvailable > 0) {
    actions.push({
      id: "workers-free",
      titleKey: "dashboard.ops.action.workersFree.title",
      titleParams: { count: workersAvailable },
      descKey: "dashboard.ops.action.workersFree.desc",
      priority: "normal",
      actionLabelKey: "dashboard.ops.action.workersFree.cta",
      href: "/app/planning",
    });
  }

  // ---- Resources -----------------------------------------------------------
  const team: OpsResource[] = data.team.map((m) => ({
    id: m.uid,
    name: m.name,
    statusKey: m.statusKey,
    tone:
      m.statusTone === "on_site"
        ? "success"
        : m.statusTone === "absent"
          ? "danger"
          : m.statusTone === "service"
            ? "warning"
            : "neutral",
  }));

  const vehicles: OpsResource[] = data.vehicles.map((v) => ({
    id: v.id,
    name: v.name,
    statusKey: v.statusKey,
    tone:
      v.statusKey === VEHICLE_FREE_KEY
        ? "success"
        : v.statusKey === VEHICLE_SERVICE_KEY
          ? "warning"
          : "neutral",
    href: v.href,
  }));

  // ---- Finance -------------------------------------------------------------
  const finance: OpsFinanceRow[] = [];
  if (opts.showFinance) {
    finance.push({
      id: "quotes",
      labelKey: "dashboard.ops.finance.quotesPending",
      value: quotes,
      href: "/app/quotes",
      emphasize: quotes > 0,
    });
    finance.push({
      id: "expenses",
      labelKey: "dashboard.ops.finance.expensesOpen",
      value: 0,
      href: "/app/expenses",
      emphasize: false,
    });
  }

  // ---- Status strip + header chips -----------------------------------------
  const statusChips: OpsStatusChip[] = [
    { id: "quotes", labelKey: "dashboard.ops.chip.quotes", params: { count: quotes } },
    { id: "active", labelKey: "dashboard.ops.chip.active", params: { count: activeJobs } },
    { id: "workers", labelKey: "dashboard.ops.chip.workers", params: { count: workersAvailable } },
    { id: "vehicles", labelKey: "dashboard.ops.chip.vehicles", params: { count: vehiclesAvailable } },
    { id: "absences", labelKey: "dashboard.ops.chip.absences", params: { count: absences } },
  ];

  const needsAttention =
    delayedJobs > 0 ||
    unassignedTasks > 0 ||
    missingAttendance > 0 ||
    (opts.showFinance && quotes > 0) ||
    (!todayHasWork && activeJobs === 0);

  let statusMessageKey: string;
  let statusMessageParams: Record<string, number | string> | undefined;
  if (todayHasWork) {
    statusMessageKey = "dashboard.ops.status.onTrack";
    statusMessageParams = { count: data.todayRows.length };
  } else if (opts.showFinance && quotes > 0) {
    statusMessageKey = "dashboard.ops.status.quotesNoWork";
    statusMessageParams = { count: quotes };
  } else if (activeJobs > 0) {
    statusMessageKey = "dashboard.ops.status.activeNoSchedule";
    statusMessageParams = { count: activeJobs };
  } else {
    statusMessageKey = "dashboard.ops.status.allClear";
  }

  return {
    workflow,
    workflowInsight,
    nextActions: actions.slice(0, 3),
    finance,
    team,
    vehicles,
    capacity: {
      workersAvailable,
      vehiclesAvailable,
      absences,
      activeJobs,
      quotes,
      todayTitle,
    },
    statusChips,
    statusTone: needsAttention ? "attention" : "calm",
    statusLabelKey: needsAttention ? "dashboard.ops.status.attentionLabel" : "dashboard.ops.status.calmLabel",
    statusMessageKey,
    statusMessageParams,
  };
}
