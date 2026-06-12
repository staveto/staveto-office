import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import {
  formatProjectAddress,
  getProjectStoredCoordinates,
} from "@/lib/projectLocation";
import {
  entryGpsEndVisible,
  entryGpsStartVisible,
  parseGpsPoint,
  resolveMemberGpsStatus,
  type GpsDisplayStatus,
  type ParsedGpsPoint,
} from "@/lib/operationsGps";
import type { TeamStatus } from "@/lib/operationsMetrics";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import type { OperationsDashboardData } from "@/services/operations/operationsDashboardService";

export type MapViewMember = {
  uid: string;
  name: string;
  status: TeamStatus;
  currentProject?: string;
  currentProjectId?: string;
  currentTask?: string;
  timerSeconds?: number;
  startedAt?: string;
  pauseSince?: string;
  todayMinutes: number;
  lastTimeEntry?: TimeEntryDoc;
  liveGpsStart: ParsedGpsPoint | null;
  completedGpsStart: ParsedGpsPoint | null;
  completedGpsEnd: ParsedGpsPoint | null;
  hasLiveGps: boolean;
  hasCompletedGps: boolean;
  gpsStatus: GpsDisplayStatus;
  absenceToday: boolean;
};

export type MapViewProject = {
  id: string;
  name: string;
  crew: { uid: string; name: string; status: TeamStatus }[];
  locationLabel?: string;
  lat?: number;
  lng?: number;
  todayMinutes: number;
  openTasks: number;
  unassignedTasks: number;
};

export type OperationsMapViewModel = {
  todayIso: string;
  members: MapViewMember[];
  projects: MapViewProject[];
};

export type WorkerMapMarker = {
  uid: string;
  name: string;
  lat: number;
  lng: number;
  status: TeamStatus;
  projectId?: string;
  projectName?: string;
  timerSeconds?: number;
  source: "live" | "completed";
  /** Set for completed-entry markers — managers can hide this GPS part. */
  entryId?: string;
  gpsPart?: "start" | "end";
  accuracyM?: number;
};

function todayEntriesForUser(entries: TimeEntryDoc[], uid: string, todayIso: string): TimeEntryDoc[] {
  return entries.filter(
    (e) => e.userId === uid && (e.date ?? e.startedAt).slice(0, 10) === todayIso
  );
}

function latestEntryForUser(entries: TimeEntryDoc[], uid: string): TimeEntryDoc | undefined {
  return entries
    .filter((e) => e.userId === uid)
    .sort((a, b) => new Date(b.endedAt || b.startedAt).getTime() - new Date(a.endedAt || a.startedAt).getTime())[0];
}

export function buildOperationsMapViewModel(input: {
  data: OperationsDashboardData;
  liveTimers: Map<string, ActiveTimerState>;
}): OperationsMapViewModel {
  const { data, liveTimers } = input;
  const todayIso = data.todayIso;
  const todayEntries = data.timeEntries.filter(
    (e) => (e.date ?? e.startedAt).slice(0, 10) === todayIso
  );

  const members: MapViewMember[] = data.teamStatus.map((m) => {
    const userEntries = todayEntriesForUser(todayEntries, m.uid, todayIso);
    const lastEntry = latestEntryForUser(todayEntries, m.uid);
    const liveTimer = liveTimers.get(m.uid);
    const liveGpsStart = liveTimer ? parseGpsPoint(liveTimer.gpsStart) : null;
    const completedGpsStart = lastEntry ? entryGpsStartVisible(lastEntry) : null;
    const completedGpsEnd = lastEntry ? entryGpsEndVisible(lastEntry) : null;
    const hasLiveGps = Boolean(liveGpsStart);
    const hasCompletedGps = Boolean(completedGpsStart || completedGpsEnd);

    return {
      uid: m.uid,
      name: m.name,
      status: m.status,
      currentProject: m.projectName,
      currentProjectId: m.projectId,
      currentTask: m.taskName,
      timerSeconds: m.timerSeconds,
      startedAt: m.startedAt,
      pauseSince: m.pauseSince,
      todayMinutes: m.todayWorkedMinutes ?? 0,
      lastTimeEntry: lastEntry,
      liveGpsStart,
      completedGpsStart,
      completedGpsEnd,
      hasLiveGps,
      hasCompletedGps,
      gpsStatus:
        m.gpsStatus ??
        resolveMemberGpsStatus({
          status: m.status,
          liveGpsStart,
          todayEntriesForUser: userEntries,
        }),
      absenceToday: m.status === "absent",
    };
  });

  const memberByUid = new Map(members.map((m) => [m.uid, m]));
  const minutesByProject = new Map<string, number>();
  for (const e of todayEntries) {
    if (!e.projectId) continue;
    minutesByProject.set(
      e.projectId,
      (minutesByProject.get(e.projectId) ?? 0) + Math.max(0, e.durationMinutes || 0)
    );
  }
  for (const m of members) {
    if (!m.currentProjectId || (m.status !== "working" && m.status !== "paused")) continue;
    const activeMin = typeof m.timerSeconds === "number" ? Math.floor(m.timerSeconds / 60) : 0;
    if (activeMin > 0) {
      minutesByProject.set(
        m.currentProjectId,
        (minutesByProject.get(m.currentProjectId) ?? 0) + activeMin
      );
    }
  }

  const tasksByProject = (projectId: string) =>
    data.tasks.filter((t: TaskDoc) => t.projectId === projectId && t.status !== "DONE");

  const projects: MapViewProject[] = data.projects.map((p: ProjectDoc) => {
    const coords = getProjectStoredCoordinates(p);
    const crewUids = new Set<string>([
      ...(p.assignedMemberIds ?? []),
      ...(p.ownerId ? [p.ownerId] : []),
    ]);
    const crew = [...crewUids]
      .map((uid) => memberByUid.get(uid))
      .filter((m): m is MapViewMember => Boolean(m))
      .map((m) => ({ uid: m.uid, name: m.name, status: m.status }));

    const projectTasks = tasksByProject(p.id);
    return {
      id: p.id,
      name: p.name,
      crew,
      locationLabel: formatProjectAddress(p) ?? undefined,
      lat: coords?.lat,
      lng: coords?.lng,
      todayMinutes: minutesByProject.get(p.id) ?? 0,
      openTasks: projectTasks.length,
      unassignedTasks: projectTasks.filter((t) => !t.assigneeId).length,
    };
  });

  return { todayIso, members, projects };
}

export function buildWorkerMapMarkers(members: MapViewMember[]): WorkerMapMarker[] {
  const markers: WorkerMapMarker[] = [];
  for (const m of members) {
    if (m.hasLiveGps && m.liveGpsStart) {
      markers.push({
        uid: m.uid,
        name: m.name,
        lat: m.liveGpsStart.lat,
        lng: m.liveGpsStart.lng,
        status: m.status,
        projectId: m.currentProjectId,
        projectName: m.currentProject,
        timerSeconds: m.timerSeconds,
        source: "live",
        accuracyM: m.liveGpsStart.accuracyM,
      });
      continue;
    }

    if (m.status === "working" || m.status === "paused") continue;

    const entry = m.lastTimeEntry;
    const endPoint = m.completedGpsEnd;
    const startPoint = m.completedGpsStart;
    const point = endPoint ?? startPoint;
    if (!point || !entry) continue;

    markers.push({
      uid: m.uid,
      name: m.name,
      lat: point.lat,
      lng: point.lng,
      status: m.status,
      projectId: m.currentProjectId,
      projectName: m.currentProject,
      timerSeconds: m.timerSeconds,
      source: "completed",
      entryId: entry.id,
      gpsPart: endPoint ? "end" : "start",
      accuracyM: point.accuracyM,
    });
  }
  return markers;
}

export function memberMatchesMapFilter(
  m: MapViewMember,
  filter: MapViewFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "with_gps") return m.hasLiveGps || m.hasCompletedGps;
  if (filter === "without_gps") return !m.hasLiveGps && !m.hasCompletedGps;
  if (filter === "working") return m.status === "working";
  if (filter === "paused") return m.status === "paused";
  if (filter === "not_started") return m.status === "not_started";
  if (filter === "absent") return m.status === "absent";
  return m.status === "offline";
}

export type MapViewFilter =
  | "all"
  | "working"
  | "paused"
  | "not_started"
  | "absent"
  | "with_gps"
  | "without_gps";

export type MapViewGroupMode = "employee" | "project";

export function groupMembersByProject(
  members: MapViewMember[],
  projects: MapViewProject[],
  withoutProjectLabel = "—"
): { key: string; label: string; items: MapViewMember[] }[] {
  const byProject = new Map<string, MapViewMember[]>();
  for (const m of members) {
    const key = m.currentProjectId ?? "__none__";
    const list = byProject.get(key) ?? [];
    list.push(m);
    byProject.set(key, list);
  }
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  return [...byProject.entries()]
    .map(([key, items]) => ({
      key,
      label:
        key === "__none__"
          ? withoutProjectLabel
          : projectNames.get(key) ?? items[0]?.currentProject ?? key,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return a.label.localeCompare(b.label);
    });
}
