/**
 * Mission Control dashboard aggregation — reuses planning, stats, tasks, equipment.
 * No new backend collections.
 */
import { type TaskDoc } from "@/lib/projects";
import { fetchDashboardStats, type DashboardStats } from "@/lib/dashboardStats";
import {
  getPlanningDashboardData,
  type PlanningDashboardData,
  type PlanningTaskItem,
} from "@/services/planning";
import { listMyEquipment } from "@/services/equipment/userEquipmentService";
import type { UserEquipmentDoc } from "@/services/equipment/types";
import type { ActiveWorkspace } from "@/types/workspace";
import {
  toIsoDateLocal,
  weekDaysFromMonday,
  startOfWeekMonday,
  monthDays,
  parseIsoDateLocal,
} from "@/lib/planningDates";
import {
  computeMemberWorkloads,
  computePlanningKpis,
  type MemberWorkload,
  type PlanningKpiMetrics,
} from "@/lib/taskPlanningMetrics";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import { listProjectsForWorkspace } from "@/lib/projects";
import {
  countOpenProblemsForProjects,
  listOpenProblemsForDashboard,
  type OpenProblemPreview,
} from "@/services/projects/projectProblemsReadService";
import {
  canViewOrgSharedFieldNotes,
  collectProjectOrgIds,
  fetchSharedFieldNotesForDashboard,
  type SharedFieldNotePreview,
} from "@/services/operations/fieldNotesService";
import {
  loadOrgLiveTimers,
  type ActiveTimerState,
} from "@/services/operations/teamLiveStatusService";
import { isCompanyWorkspaceType } from "@/types/workspace";

export type MissionControlAttentionItem = {
  id: string;
  labelKey: string;
  count: number;
  href: string;
  kind: "warning" | "info";
  params?: Record<string, number | string>;
};

export type MissionControlNotification = {
  id: string;
  labelKey: string;
  href: string;
  createdAt?: string;
  kind: "warning" | "info";
};

export type MissionControlKpi = {
  id: string;
  labelKey: string;
  value: number | null;
  href: string;
  pending?: boolean;
};

export type TodayAgendaRow = {
  id: string;
  time: string;
  title: string;
  projectName: string;
  projectId: string;
  workers: string[];
  status: string;
  href: string;
};

export type AgendaDayItem = {
  id: string;
  time: string;
  title: string;
  projectName: string;
  href: string;
};

export type AgendaDayGroup = {
  dateIso: string;
  items: AgendaDayItem[];
};

export type TeamMemberRow = {
  uid: string;
  name: string;
  statusKey: string;
  statusTone: "on_site" | "service" | "absent" | "free" | "unknown";
  /** Live timer from organizations/{orgId}/liveTimers — overrides static status when set. */
  liveStatus?: "working" | "paused";
  timerSeconds?: number;
  projectId?: string;
  projectName?: string;
};

export type VehicleRow = {
  id: string;
  name: string;
  statusKey: string;
  locationText?: string;
  href: string;
};

export type MissionControlFieldProof = {
  photos: number;
  docs: number;
  openProblems: number;
  openProblemItems: OpenProblemPreview[];
  fieldNotes: number;
  latestFieldNotes: SharedFieldNotePreview[];
};

export type MissionControlData = {
  planning: PlanningDashboardData;
  stats: DashboardStats;
  kpis: MissionControlKpi[];
  attention: MissionControlAttentionItem[];
  notifications: MissionControlNotification[];
  fieldProof: MissionControlFieldProof;
  todayRows: TodayAgendaRow[];
  agendaGroups: AgendaDayGroup[];
  team: TeamMemberRow[];
  workloads: MemberWorkload[];
  vehicles: VehicleRow[];
  taskMetrics: PlanningKpiMetrics;
  monthDays: string[];
  daysWithEvents: string[];
  todayIso: string;
};

function formatTimeFromIso(raw?: string | null): string {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function taskDocTimeLabel(task: TaskDoc): string {
  return formatTimeFromIso(task.plannedStart ?? task.dueDate);
}

function planningTaskHref(item: PlanningTaskItem): string {
  return `/app/projects/${item.projectId}?tab=tasks`;
}

function buildTodayRows(
  planning: PlanningDashboardData,
  taskDocs: TaskDoc[],
  todayIso: string
): TodayAgendaRow[] {
  const taskById = new Map(taskDocs.map((t) => [t.id, t]));
  const memberName = (id?: string | null) => {
    if (!id) return null;
    const m = planning.members.find((x) => x.uid === id);
    return m?.displayName ?? null;
  };

  const rows: TodayAgendaRow[] = planning.tasksDueToday.map((item) => {
    const doc = taskById.get(item.id);
    const workers = item.assigneeName
      ? [item.assigneeName]
      : doc?.assigneeId
        ? [memberName(doc.assigneeId) ?? doc.assigneeId.slice(0, 8)].filter(Boolean)
        : [];
    return {
      id: item.id,
      time: doc ? taskDocTimeLabel(doc) : "—",
      title: item.title,
      projectName: item.projectName,
      projectId: item.projectId,
      workers: workers as string[],
      status: item.status,
      href: planningTaskHref(item),
    };
  });

  if (rows.length > 0) {
    return rows.sort((a, b) => a.time.localeCompare(b.time));
  }

  for (const ps of planning.activeProjects) {
    if (ps.assignedMemberNames.length === 0) continue;
    rows.push({
      id: `project-${ps.project.id}`,
      time: "—",
      title: ps.project.name,
      projectName: ps.project.name,
      projectId: ps.project.id,
      workers: ps.assignedMemberNames,
      status: ps.project.lifecycleStatus ?? "active",
      href: `/app/projects/${ps.project.id}`,
    });
  }

  return rows.slice(0, 12);
}

function buildAgendaGroups(
  planning: PlanningDashboardData,
  taskDocs: TaskDoc[],
  weekStart: Date,
  todayIso: string
): AgendaDayGroup[] {
  const weekDayIsos = weekDaysFromMonday(weekStart);
  const taskById = new Map(taskDocs.map((t) => [t.id, t]));

  return weekDayIsos.map((dateIso) => {
    const dayTasks = planning.tasksDueThisWeek.filter((t) => t.dueDate === dateIso);
    const absenceItems = planning.absencesInWeek.filter(
      (a) => dateIso >= a.start.slice(0, 10) && dateIso <= a.end.slice(0, 10)
    );

    const items: AgendaDayItem[] = dayTasks.map((t) => {
      const doc = taskById.get(t.id);
      return {
        id: t.id,
        time: doc ? taskDocTimeLabel(doc) : "—",
        title: t.title,
        projectName: t.projectName,
        href: planningTaskHref(t),
      };
    });

    for (const abs of absenceItems) {
      const member = planning.members.find((m) => m.uid === abs.userId);
      items.push({
        id: `abs-${abs.id}-${dateIso}`,
        time: "—",
        title: abs.label ?? abs.type,
        projectName: member?.displayName ?? abs.userId.slice(0, 8),
        href: "/app/attendance",
      });
    }

    items.sort((a, b) => a.time.localeCompare(b.time));

    return { dateIso, items };
  }).filter((g) => g.items.length > 0 || g.dateIso === todayIso);
}

function activeTimerSeconds(timer: ActiveTimerState): number {
  const now = Date.now();
  const runningSince = timer.runningSince ?? timer.startedAt;
  const runningSinceMs = runningSince ? new Date(runningSince).getTime() : now;
  const base = timer.accumulatedMs ?? 0;
  if (timer.status === "paused") return Math.max(0, Math.round(base / 1000));
  return Math.max(0, Math.round((base + Math.max(0, now - runningSinceMs)) / 1000));
}

/** Merge org liveTimers into team rows — working employees surface first on the home card. */
export function applyLiveTimersToTeam(
  team: TeamMemberRow[],
  liveTimers: Map<string, ActiveTimerState>
): TeamMemberRow[] {
  if (liveTimers.size === 0) return team;

  const updated = team.map((member) => {
    const timer = liveTimers.get(member.uid);
    if (!timer) return member;

    const liveStatus: TeamMemberRow["liveStatus"] =
      timer.status === "paused" ? "paused" : "working";
    return {
      ...member,
      liveStatus,
      timerSeconds: activeTimerSeconds(timer),
      projectId: timer.projectId,
      projectName: timer.projectNameSnapshot,
      statusKey:
        liveStatus === "paused"
          ? "dashboard.mission.team.status.paused"
          : "dashboard.mission.team.status.working",
      statusTone: "on_site" as const,
    };
  });

  return updated.sort((a, b) => {
    const order = (m: TeamMemberRow) =>
      m.liveStatus === "working" ? 0 : m.liveStatus === "paused" ? 1 : m.statusTone === "on_site" ? 2 : 3;
    return order(a) - order(b) || a.name.localeCompare(b.name);
  });
}

export function recomputeTeamWithLiveTimers(
  planning: PlanningDashboardData,
  liveTimers: Map<string, ActiveTimerState>
): TeamMemberRow[] {
  return applyLiveTimersToTeam(buildTeamRows(planning), liveTimers);
}

function buildTeamRows(planning: PlanningDashboardData): TeamMemberRow[] {
  return planning.members
    .filter((m) => m.effectiveRole === "worker" || m.assignedProjectCount > 0)
    .map((m) => {
      let statusKey = "dashboard.mission.team.status.free";
      let statusTone: TeamMemberRow["statusTone"] = "free";

      if (m.todayStatus === "working") {
        statusKey = "dashboard.mission.team.status.onSite";
        statusTone = "on_site";
      } else if (m.todayStatus === "absent") {
        statusKey = "dashboard.mission.team.status.absent";
        statusTone = "absent";
      } else if (m.assignedProjectCount > 0) {
        statusKey = "dashboard.mission.team.status.onSite";
        statusTone = "on_site";
      }

      return {
        uid: m.uid,
        name: m.displayName,
        statusKey,
        statusTone,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function vehicleStatusKey(eq: UserEquipmentDoc): string {
  if (eq.status === "in_service") return "dashboard.mission.vehicle.service";
  if (eq.status === "assigned" || eq.assignedProjectId) {
    return "dashboard.mission.vehicle.onSite";
  }
  return "dashboard.mission.vehicle.free";
}

function buildVehicles(equipment: UserEquipmentDoc[]): VehicleRow[] {
  return equipment
    .filter((e) => e.category === "vehicle")
    .map((e) => ({
      id: e.id,
      name: e.name || e.model || e.kind || "Vehicle",
      statusKey: vehicleStatusKey(e),
      locationText: e.locationText?.trim() || undefined,
      href: `/app/equipment/${e.id}`,
    }));
}

function buildAttention(
  planning: PlanningDashboardData,
  stats: DashboardStats,
  taskMetrics: PlanningKpiMetrics,
  openProblems: number
): MissionControlAttentionItem[] {
  const items: MissionControlAttentionItem[] = [];

  if (openProblems > 0) {
    items.push({
      id: "open-problems",
      labelKey: "dashboard.attention.openProblems",
      count: openProblems,
      href: "/app/operations",
      kind: "warning",
    });
  }

  if (taskMetrics.withoutWorker > 0) {
    items.push({
      id: "tasks-unassigned",
      labelKey: "dashboard.mission.attention.unassignedTasks",
      count: taskMetrics.withoutWorker,
      href: "/app/planning",
      kind: "warning",
    });
  }

  if (taskMetrics.withoutTools > 0) {
    items.push({
      id: "tasks-no-tools",
      labelKey: "dashboard.mission.attention.noToolsTasks",
      count: taskMetrics.withoutTools,
      href: "/app/planning",
      kind: "warning",
    });
  }

  if (stats.delayedJobsCount > 0) {
    items.push({
      id: "delayed-jobs",
      labelKey: "dashboard.attention.delayedJobs",
      count: stats.delayedJobsCount,
      href: "/app/projects?filter=active",
      kind: "warning",
    });
  }

  if (stats.quotesAwaitingCount > 0) {
    items.push({
      id: "quotes-action",
      labelKey: "dashboard.attention.quotesAction",
      count: stats.quotesAwaitingCount,
      href: "/app/quotes",
      kind: "info",
    });
  }

  const missingAttendance = planning.stats.missingAttendanceCount;
  if (missingAttendance != null && missingAttendance > 0) {
    items.push({
      id: "missing-attendance",
      labelKey: "dashboard.mission.attention.missingAttendance",
      count: missingAttendance,
      href: "/app/attendance",
      kind: "warning",
    });
  }

  const unassignedJobs = planning.activeProjects.filter(
    (p) => p.assignedMemberIds.length === 0
  ).length;
  if (unassignedJobs > 0) {
    items.push({
      id: "unassigned-jobs",
      labelKey: "dashboard.mission.attention.unassignedJobs",
      count: unassignedJobs,
      href: "/app/projects?filter=active",
      kind: "info",
    });
  }

  return items;
}

function buildKpis(
  planning: PlanningDashboardData,
  stats: DashboardStats,
  taskMetrics: PlanningKpiMetrics
): MissionControlKpi[] {
  const openTasks = taskMetrics.total - taskMetrics.done;

  return [
    {
      id: "active-projects",
      labelKey: "dashboard.mission.kpi.activeProjects",
      value: planning.stats.activeJobCount,
      href: "/app/projects?filter=active",
    },
    {
      id: "workers-today",
      labelKey: "dashboard.mission.kpi.workersToday",
      value: planning.members.filter((m) => m.todayStatus === "working").length,
      href: "/app/planning",
    },
    {
      id: "open-tasks",
      labelKey: "dashboard.mission.kpi.openTasks",
      value: openTasks,
      href: "/app/planning",
    },
    {
      id: "unassigned-tasks",
      labelKey: "dashboard.mission.kpi.unassignedTasks",
      value: taskMetrics.withoutWorker,
      href: "/app/planning",
    },
    {
      id: "no-tools-tasks",
      labelKey: "dashboard.mission.kpi.noToolsTasks",
      value: taskMetrics.withoutTools,
      href: "/app/planning",
    },
    {
      id: "new-reports",
      labelKey: "dashboard.mission.kpi.newReports",
      value: null,
      href: "/app/help",
      pending: true,
    },
    {
      id: "complaints",
      labelKey: "dashboard.mission.kpi.complaints",
      value: null,
      href: "/app/help",
      pending: true,
    },
    {
      id: "absences-today",
      labelKey: "dashboard.mission.kpi.absencesToday",
      value: planning.stats.absencesTodayCount,
      href: "/app/attendance",
    },
  ];
}

function buildNotifications(attention: MissionControlAttentionItem[]): MissionControlNotification[] {
  return attention.slice(0, 8).map((a) => ({
    id: a.id,
    labelKey: a.labelKey,
    href: a.href,
    kind: a.kind,
  }));
}

export async function fetchMissionControlData(
  workspace: ActiveWorkspace,
  uid: string
): Promise<MissionControlData> {
  const today = new Date();
  const todayIso = toIsoDateLocal(today);
  const weekStart = startOfWeekMonday(today);
  const monthDayList = monthDays(today);

  const [planningRaw, stats, equipment, workspaceProjects] = await Promise.all([
    getPlanningDashboardData(workspace, uid),
    fetchDashboardStats(workspace, uid),
    listMyEquipment().catch(() => [] as UserEquipmentDoc[]),
    listProjectsForWorkspace(workspace, uid).catch(() => []),
  ]);

  if (!planningRaw) {
    throw new Error("Planning data unavailable");
  }
  const planning = planningRaw;

  // Reuse the task documents already loaded by the planning pipeline instead of
  // re-reading tasks for every active project a second time.
  const taskDocs = planning.allTaskDocs;
  const taskMetrics = computePlanningKpis(taskDocs);

  const memberRecords: ProjectMemberRecord[] = planning.members.map((m) => ({
    id: m.uid,
    userId: m.uid,
    name: m.displayName,
    email: m.email,
  }));
  const workloads = computeMemberWorkloads(taskDocs, memberRecords);

  const openProblems = await countOpenProblemsForProjects(workspaceProjects.map((p) => p.id)).catch(
    () => 0
  );
  const openProblemItems = await listOpenProblemsForDashboard(
    workspaceProjects.map((p) => ({ id: p.id, name: p.name }))
  ).catch(() => []);

  const orgId = workspace.orgId ?? (workspace.type === "company" ? workspace.id : "");
  const liveTimers =
    isCompanyWorkspaceType(workspace.type) && orgId.trim()
      ? await loadOrgLiveTimers(orgId).catch(() => new Map<string, ActiveTimerState>())
      : new Map<string, ActiveTimerState>();
  const canViewFieldNotes = canViewOrgSharedFieldNotes(workspace.role);
  let sharedFieldNotes: SharedFieldNotePreview[] = [];
  if (orgId && canViewFieldNotes) {
    const extraOrgIds = collectProjectOrgIds(workspaceProjects);
    try {
      sharedFieldNotes = await fetchSharedFieldNotesForDashboard(orgId, extraOrgIds);
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[missionControlData] fetchSharedFieldNotesForDashboard failed:", orgId, e);
      }
      sharedFieldNotes = [];
    }
  }

  const attention = buildAttention(planning, stats, taskMetrics, openProblems);
  const daysWithEvents = [
    ...new Set([
      ...planning.allTasksWithDueDate.map((t) => t.dueDate),
      ...planning.absencesInWeek.map((a) => a.start.slice(0, 10)),
    ]),
  ];

  return {
    planning,
    stats,
    kpis: buildKpis(planning, stats, taskMetrics),
    attention,
    notifications: buildNotifications(attention),
    fieldProof: {
      photos: 0,
      docs: 0,
      openProblems,
      openProblemItems,
      fieldNotes: sharedFieldNotes.length,
      latestFieldNotes: sharedFieldNotes.slice(0, 50),
    },
    todayRows: buildTodayRows(planning, taskDocs, todayIso),
    agendaGroups: buildAgendaGroups(planning, taskDocs, weekStart, todayIso),
    team: recomputeTeamWithLiveTimers(planning, liveTimers),
    workloads: workloads.filter((w) => w.taskCount > 0).slice(0, 8),
    vehicles: buildVehicles(equipment),
    taskMetrics,
    monthDays: monthDayList,
    daysWithEvents,
    todayIso,
  };
}

/** Lightweight fetch for header notification badge. */
export async function fetchMissionControlNotificationCount(
  workspace: ActiveWorkspace,
  uid: string
): Promise<number> {
  try {
    const data = await fetchMissionControlData(workspace, uid);
    return data.attention.reduce((sum, a) => sum + a.count, 0);
  } catch {
    return 0;
  }
}

export function formatAgendaDayLabel(dateIso: string, todayIso: string): string {
  const d = parseIsoDateLocal(dateIso);
  const today = parseIsoDateLocal(todayIso);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toIsoDateLocal(tomorrow);

  if (dateIso === todayIso) return "today";
  if (dateIso === tomorrowIso) return "tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}
