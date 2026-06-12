import {
  getFirestoreInstance,
  collection,
  query,
  where,
  getDocs,
} from "@/lib/firebase";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import { listProjectTasks } from "@/lib/projects";
import { listOrgMembers } from "@/lib/organizations";
import {
  listBusinessOrgProjects,
  canAccessBusinessTeamProject,
} from "@/services/projects/businessProjectAssignmentService";
import {
  listTimeEntriesForProjects,
  type TimeEntryDoc,
} from "@/services/attendance/timeTrackingReadService";
import {
  loadOrgLiveTimers,
  resolveTeamLiveStatus,
  subscribeOrgLiveTimers,
  type ActiveTimerState,
} from "@/services/operations/teamLiveStatusService";
import { buildUnassignedWork } from "@/services/operations/unassignedWorkService";
import { buildTimeInvestment } from "@/services/operations/timeInvestmentService";
import { buildTaskProgressBoard } from "@/services/operations/taskProgressService";
import {
  summarizeTodayOverview,
  type TeamLiveStatusItem,
  type TodayOverviewMetrics,
  type UnassignedWorkGroup,
  type TaskProgressItem,
  type TimeInvestmentByProject,
  type TimeInvestmentByTask,
  type TimeInvestmentByEmployee,
} from "@/lib/operationsMetrics";
import { buildOperationsAlerts, type OperationsAlert } from "@/lib/operationsAlerts";
import { canViewOperationsDashboard } from "@/lib/operationsPermissions";
import { getCompanyIdForCallable } from "@/lib/workspaceStorage";
import {
  buildDayTimeline,
  buildProjectInvestmentCards,
  buildTeamWorkload,
} from "@/lib/operationsCenterBuilders";
import type {
  DayTimelineEvent,
  ProjectInvestmentCard,
  TeamWorkloadRow,
} from "@/lib/operationsMetrics";

export type OperationsTimeWindow = "today" | "week" | "month";

export type OperationsDashboardData = {
  todayIso: string;
  projects: ProjectDoc[];
  tasks: TaskDoc[];
  teamStatus: TeamLiveStatusItem[];
  todayOverview: TodayOverviewMetrics;
  unassigned: UnassignedWorkGroup[];
  alerts: OperationsAlert[];
  taskProgress: TaskProgressItem[];
  timeByProject: TimeInvestmentByProject[];
  timeByTask: TimeInvestmentByTask[];
  timeByEmployee: TimeInvestmentByEmployee[];
  timeEntries: TimeEntryDoc[];
  workloadWeek: TeamWorkloadRow[];
  workloadMonth: TeamWorkloadRow[];
  projectInvestments: ProjectInvestmentCard[];
  timeline: DayTimelineEvent[];
};

function isoYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeForWindow(window: OperationsTimeWindow): { fromYmd: string; toYmd: string } {
  const now = new Date();
  if (window === "today") {
    const today = isoYmd(now);
    return { fromYmd: today, toYmd: today };
  }
  if (window === "week") {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    return { fromYmd: isoYmd(start), toYmd: isoYmd(now) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { fromYmd: isoYmd(start), toYmd: isoYmd(now) };
}

async function listTodayAbsentUserIds(orgId: string, todayIso: string): Promise<Set<string>> {
  const db = getFirestoreInstance();
  if (!db || !orgId) return new Set();

  try {
    const q = query(collection(db, "absences"), where("orgId", "==", orgId));
    const snap = await getDocs(q);
    const set = new Set<string>();
    for (const d of snap.docs) {
      const row = d.data() as Record<string, unknown>;
      const uid = (row.userId as string) || (row.uid as string) || "";
      const start = String(row.startDate ?? row.start ?? "");
      const end = String(row.endDate ?? row.end ?? start);
      if (!uid || !start) continue;
      const s = start.slice(0, 10);
      const e = end.slice(0, 10);
      if (s <= todayIso && e >= todayIso) set.add(uid);
    }
    return set;
  } catch {
    return new Set();
  }
}

async function loadTasksForProjects(projects: ProjectDoc[]): Promise<TaskDoc[]> {
  const tasks: TaskDoc[] = [];
  await Promise.all(
    projects.slice(0, 60).map(async (project) => {
      try {
        const list = await listProjectTasks(project.id);
        tasks.push(...list);
      } catch {
        /* ignore project errors */
      }
    })
  );
  return tasks;
}

export async function fetchOperationsDashboardData(input: {
  workspace: ActiveWorkspace;
  uid: string;
  role?: WorkspaceRole;
  window: OperationsTimeWindow;
  activeTimersOverride?: Map<string, ActiveTimerState>;
}): Promise<OperationsDashboardData> {
  const { workspace, uid, role, window } = input;
  if (!canViewOperationsDashboard(role)) {
    throw new Error("Operations dashboard not allowed for this role");
  }

  const projectsRaw = await listBusinessOrgProjects(workspace, uid);
  const projects = projectsRaw.filter((p) => canAccessBusinessTeamProject(p, uid, role));
  const tasks = await loadTasksForProjects(projects);
  const projectIds = projects.map((p) => p.id);
  const orgId = getCompanyIdForCallable(workspace) ?? "";

  const [{ fromYmd, toYmd }, members, todayAbsentUserIds] = await Promise.all([
    Promise.resolve(rangeForWindow(window)),
    listOrgMembers(orgId),
    listTodayAbsentUserIds(orgId, isoYmd(new Date())),
  ]);
  const activeTimers = input.activeTimersOverride
    ? input.activeTimersOverride
    : orgId.trim()
      ? await loadOrgLiveTimers(orgId)
      : new Map<string, ActiveTimerState>();

  const weekRange = rangeForWindow("week");
  const monthRange = rangeForWindow("month");
  const todayYmd = isoYmd(new Date());

  const [timeEntries, weekEntries, monthEntries] = await Promise.all([
    projectIds.length > 0
      ? listTimeEntriesForProjects(projectIds, fromYmd, toYmd)
      : Promise.resolve([]),
    projectIds.length > 0
      ? listTimeEntriesForProjects(projectIds, weekRange.fromYmd, weekRange.toYmd)
      : Promise.resolve([]),
    projectIds.length > 0
      ? listTimeEntriesForProjects(projectIds, monthRange.fromYmd, monthRange.toYmd)
      : Promise.resolve([]),
  ]);

  const teamStatus = resolveTeamLiveStatus({
    members,
    projects,
    todayEntries: timeEntries.filter((e) => (e.date ?? e.startedAt).slice(0, 10) === isoYmd(new Date())),
    todayAbsentUserIds,
    activeTimers,
  });

  const unassigned = buildUnassignedWork(projects, tasks);
  const timeInvestment = buildTimeInvestment(timeEntries, projects);
  const taskProgress = buildTaskProgressBoard(tasks, projects, timeInvestment.minutesByTaskId);
  const todayOverviewRaw = summarizeTodayOverview(
    teamStatus,
    tasks,
    timeEntries.filter((e) => (e.date ?? e.startedAt).slice(0, 10) === isoYmd(new Date())),
    isoYmd(new Date())
  );
  const todayOverview = {
    ...todayOverviewRaw,
    projectsWithoutCrew: unassigned.filter((p) => p.withoutCrew).length,
  };
  const alerts = buildOperationsAlerts({
    today: todayOverview,
    unassigned,
    team: teamStatus,
    tasks,
    todayIso: todayYmd,
  });

  const weekInvestment = buildTimeInvestment(weekEntries, projects);
  const monthInvestment = buildTimeInvestment(monthEntries, projects);
  const todayEntries = timeEntries.filter(
    (e) => (e.date ?? e.startedAt).slice(0, 10) === todayYmd
  );

  return {
    todayIso: isoYmd(new Date()),
    projects,
    tasks,
    teamStatus,
    todayOverview,
    unassigned,
    alerts,
    taskProgress,
    timeByProject: timeInvestment.byProject,
    timeByTask: timeInvestment.byTask,
    timeByEmployee: timeInvestment.byEmployee,
    timeEntries,
    workloadWeek: buildTeamWorkload(teamStatus, weekInvestment.byEmployee),
    workloadMonth: buildTeamWorkload(teamStatus, monthInvestment.byEmployee),
    projectInvestments: buildProjectInvestmentCards(projects, tasks, timeInvestment.byProject),
    timeline: buildDayTimeline(teamStatus, todayEntries, todayYmd),
  };
}

export async function fetchTeamLiveStatus(input: {
  workspace: ActiveWorkspace;
  uid: string;
  role?: WorkspaceRole;
  activeTimersOverride?: Map<string, ActiveTimerState>;
}): Promise<TeamLiveStatusItem[]> {
  if (!canViewOperationsDashboard(input.role)) return [];

  const orgId = getCompanyIdForCallable(input.workspace) ?? "";
  const projectsRaw = await listBusinessOrgProjects(input.workspace, input.uid);
  const projects = projectsRaw.filter((p) => canAccessBusinessTeamProject(p, input.uid, input.role));
  const members = await listOrgMembers(orgId);
  const todayAbsentUserIds = await listTodayAbsentUserIds(orgId, isoYmd(new Date()));
  const projectIds = projects.map((p) => p.id);
  const activeTimers = input.activeTimersOverride
    ? input.activeTimersOverride
    : orgId.trim()
      ? await loadOrgLiveTimers(orgId)
      : new Map<string, ActiveTimerState>();

  const timeEntries =
    projectIds.length > 0
      ? await listTimeEntriesForProjects(projectIds, isoYmd(new Date()), isoYmd(new Date()))
      : [];

  return resolveTeamLiveStatus({
    members,
    projects,
    todayEntries: timeEntries,
    todayAbsentUserIds,
    activeTimers,
  });
}

export function subscribeOperationsActiveTimers(
  orgId: string | null | undefined,
  _memberIds: string[],
  onUpdate: (timers: Map<string, ActiveTimerState>) => void
): () => void {
  const normalized = orgId?.trim();
  if (normalized) return subscribeOrgLiveTimers(normalized, onUpdate);
  onUpdate(new Map());
  return () => {};
}
