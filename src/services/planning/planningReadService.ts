/**
 * Read-only planning aggregation from existing mobile-compatible Firestore data.
 * No writes. No planningEvents. Graceful fallback when absences/timeEntries are unavailable.
 */
import {
  getFirestoreInstance,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "@/lib/firebase";
import {
  listProjectsForWorkspace,
  listProjectTasks,
  isFirebasePermissionDenied,
  type ProjectDoc,
  type TaskDoc,
} from "@/lib/projects";
import {
  getOrganization,
  listOrgMembers,
  getMemberDisplayName,
} from "@/lib/organizations";
import {
  buildCompanyTeamRows,
  type CanonicalCompanyRole,
} from "@/lib/companyRoles";
import { isActiveJob } from "@/lib/projectLifecycle";
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  toIsoDateLocal,
  startOfWeekMonday,
  weekDaysFromMonday,
  monthDays,
  dateOverlapsDay,
  isDateInRange,
  addDays,
  startOfMonth,
} from "@/lib/planningDates";

export type PlanningDataSourceStatus = "available" | "unavailable" | "empty";

export type MemberTodayStatus = "working" | "absent" | "no_record" | "unknown";

export type PlanningTaskItem = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  dueDate: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  status: string;
};

export type PlanningAbsenceItem = {
  id: string;
  userId: string;
  type: string;
  start: string;
  end: string;
  label?: string;
};

export type PlanningTimeEntryItem = {
  id: string;
  userId: string;
  projectId?: string;
  projectName?: string;
  date: string;
};

export type PlanningMember = {
  uid: string;
  displayName: string;
  email?: string;
  effectiveRole: CanonicalCompanyRole;
  assignedProjectCount: number;
  assignedProjectIds: string[];
  todayStatus: MemberTodayStatus;
};

export type PlanningProjectSummary = {
  project: ProjectDoc;
  assignedMemberIds: string[];
  assignedMemberNames: string[];
};

export type PlanningOverviewStats = {
  teamMemberCount: number;
  activeJobCount: number;
  assignedWorkerCount: number;
  absencesTodayCount: number | null;
  tasksWithDueDateCount: number;
  missingAttendanceCount: number | null;
};

export type PlanningAlertKind = "info" | "warning" | "placeholder";

export type PlanningAlert = {
  id: string;
  kind: PlanningAlertKind;
  messageKey: string;
  href?: string;
};

export type PlanningDashboardData = {
  orgId: string;
  orgName: string;
  members: PlanningMember[];
  activeProjects: PlanningProjectSummary[];
  stats: PlanningOverviewStats;
  tasksDueToday: PlanningTaskItem[];
  tasksDueThisWeek: PlanningTaskItem[];
  tasksDueThisMonth: PlanningTaskItem[];
  /** All open tasks with a due date (for week calendar navigation). */
  allTasksWithDueDate: PlanningTaskItem[];
  /** Raw task documents loaded for active projects (reused by Mission Control). */
  allTaskDocs: TaskDoc[];
  absencesToday: PlanningAbsenceItem[];
  absencesInWeek: PlanningAbsenceItem[];
  absencesInMonth: PlanningAbsenceItem[];
  /** Absences loaded for planning (approx. ±60–90 days). */
  absencesLoaded: PlanningAbsenceItem[];
  workingTodayUserIds: string[];
  timeEntriesToday: PlanningTimeEntryItem[];
  timeEntriesStatus: PlanningDataSourceStatus;
  absencesStatus: PlanningDataSourceStatus;
  alerts: PlanningAlert[];
  todayIso: string;
  weekStartIso: string;
  weekDays: string[];
  monthDays: string[];
  monthLabelIso: string;
};

function toIsoFromFirestore(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
  }
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return toIsoDateLocal((raw as { toDate: () => Date }).toDate());
  }
  return null;
}

function taskToPlanningItem(task: TaskDoc, projectName: string): PlanningTaskItem | null {
  if (!task.dueDate || task.status === "DONE") return null;
  const due = task.dueDate.slice(0, 10);
  return {
    id: task.id,
    projectId: task.projectId,
    projectName,
    title: task.title,
    dueDate: due,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    status: task.status,
  };
}

async function loadTasksForProjects(
  projects: ProjectDoc[]
): Promise<{ items: PlanningTaskItem[]; docs: TaskDoc[] }> {
  const items: PlanningTaskItem[] = [];
  const docs: TaskDoc[] = [];
  const batch = projects.slice(0, 30);
  await Promise.all(
    batch.map(async (project) => {
      try {
        const tasks = await listProjectTasks(project.id);
        for (const task of tasks) {
          docs.push(task);
          const item = taskToPlanningItem(task, project.name);
          if (item) items.push(item);
        }
      } catch {
        /* skip project on read error */
      }
    })
  );
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { items, docs };
}

async function tryLoadAbsences(
  orgId: string,
  rangeFrom: string,
  rangeTo: string
): Promise<{ status: PlanningDataSourceStatus; items: PlanningAbsenceItem[] }> {
  const db = getFirestoreInstance();
  if (!db) return { status: "unavailable", items: [] };

  const parseAbsenceDoc = (
    id: string,
    data: Record<string, unknown>
  ): PlanningAbsenceItem | null => {
    const userId =
      (data.userId as string) ||
      (data.uid as string) ||
      (data.memberId as string) ||
      "";
    const start =
      toIsoFromFirestore(data.start ?? data.startDate ?? data.from) ?? "";
    const end =
      toIsoFromFirestore(data.end ?? data.endDate ?? data.to ?? data.start) ??
      start;
    if (!userId || !start) return null;
    const endIso = end || start;
    if (!isDateInRange(start, rangeFrom, rangeTo) && !isDateInRange(endIso, rangeFrom, rangeTo)) {
      if (!(start <= rangeFrom && endIso >= rangeTo)) return null;
    }
    return {
      id,
      userId,
      type: String(data.type ?? data.absenceType ?? "absence"),
      start,
      end: endIso,
      label: (data.label as string) || (data.reason as string) || undefined,
    };
  };

  const collectFromSnap = (
    docs: { id: string; data: () => Record<string, unknown> }[]
  ): PlanningAbsenceItem[] => {
    const out: PlanningAbsenceItem[] = [];
    for (const d of docs) {
      const item = parseAbsenceDoc(d.id, d.data());
      if (item) out.push(item);
    }
    return out;
  };

  try {
    const orgRef = collection(db, "organizations", orgId, "absences");
    const snap = await getDocs(query(orgRef, limit(200)));
    const items = collectFromSnap(snap.docs);
    return { status: items.length ? "available" : "empty", items };
  } catch (e) {
    if (!isFirebasePermissionDenied(e)) {
      /* try fallback */
    }
  }

  try {
    const q = query(
      collection(db, "absences"),
      where("orgId", "==", orgId),
      limit(200)
    );
    const snap = await getDocs(q);
    const items = collectFromSnap(snap.docs);
    return { status: items.length ? "available" : "empty", items };
  } catch (e) {
    if (isFirebasePermissionDenied(e)) {
      return { status: "unavailable", items: [] };
    }
    return { status: "unavailable", items: [] };
  }
}

async function tryLoadTimeEntries(
  orgId: string,
  dayIso: string
): Promise<{ status: PlanningDataSourceStatus; items: PlanningTimeEntryItem[] }> {
  const db = getFirestoreInstance();
  if (!db) return { status: "unavailable", items: [] };

  const parseEntry = (
    id: string,
    data: Record<string, unknown>
  ): PlanningTimeEntryItem | null => {
    const userId =
      (data.userId as string) ||
      (data.uid as string) ||
      (data.ownerId as string) ||
      "";
    const date =
      toIsoFromFirestore(data.date ?? data.start ?? data.startedAt ?? data.createdAt) ??
      "";
    if (!userId || !date) return null;
    if (date.slice(0, 10) !== dayIso) return null;
    return {
      id,
      userId,
      projectId: (data.projectId as string) || undefined,
      date: date.slice(0, 10),
    };
  };

  try {
    const orgRef = collection(db, "organizations", orgId, "timeEntries");
    const snap = await getDocs(query(orgRef, limit(300)));
    const items = snap.docs
      .map((d) => parseEntry(d.id, d.data() as Record<string, unknown>))
      .filter((x): x is PlanningTimeEntryItem => x !== null);
    return { status: items.length ? "available" : "empty", items };
  } catch {
    /* fallback */
  }

  try {
    const q = query(
      collection(db, "timeEntries"),
      where("orgId", "==", orgId),
      limit(300)
    );
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => parseEntry(d.id, d.data() as Record<string, unknown>))
      .filter((x): x is PlanningTimeEntryItem => x !== null);
    return { status: items.length ? "available" : "empty", items };
  } catch (e) {
    if (isFirebasePermissionDenied(e)) {
      return { status: "unavailable", items: [] };
    }
    return { status: "unavailable", items: [] };
  }
}

function resolveMemberName(
  uid: string,
  memberMap: Map<string, { displayName: string }>
): string {
  return memberMap.get(uid)?.displayName ?? uid.slice(0, 8);
}

function computeTodayStatus(
  uid: string,
  absencesToday: PlanningAbsenceItem[],
  workingUserIds: Set<string>,
  timeEntriesStatus: PlanningDataSourceStatus,
  absencesStatus: PlanningDataSourceStatus
): MemberTodayStatus {
  if (absencesStatus === "available") {
    if (absencesToday.some((a) => a.userId === uid)) return "absent";
  }
  if (timeEntriesStatus === "available") {
    if (workingUserIds.has(uid)) return "working";
    return "no_record";
  }
  return "unknown";
}

export async function getPlanningDashboardData(
  workspace: ActiveWorkspace,
  uid: string
): Promise<PlanningDashboardData | null> {
  if (!isCompanyWorkspaceType(workspace.type)) return null;

  const orgId = workspace.orgId ?? workspace.id;
  const now = new Date();
  const todayIso = toIsoDateLocal(now);
  const weekStart = startOfWeekMonday(now);
  const weekStartIso = toIsoDateLocal(weekStart);
  const weekDays = weekDaysFromMonday(weekStart);
  const weekEndIso = weekDays[6];
  const monthDaysList = monthDays(now);
  const monthStartIso = monthDaysList[0];
  const monthEndIso = monthDaysList[monthDaysList.length - 1];
  const absencesRangeFrom = toIsoDateLocal(addDays(now, -60));
  const absencesRangeTo = toIsoDateLocal(addDays(now, 120));

  const [org, membersList, projects, absencesLoaded, timeEntriesToday] = await Promise.all([
    getOrganization(orgId),
    listOrgMembers(orgId),
    listProjectsForWorkspace(workspace, uid),
    tryLoadAbsences(orgId, absencesRangeFrom, absencesRangeTo),
    tryLoadTimeEntries(orgId, todayIso),
  ]);

  const db = getFirestoreInstance();
  let ownerDisplayName: string | null = null;
  if (db && org?.ownerUid) {
    ownerDisplayName = await getMemberDisplayName(db, org.ownerUid);
  }

  const teamRows =
    org != null
      ? buildCompanyTeamRows({
          org,
          members: membersList,
          ownerDisplayName,
        })
      : [];

  const activeMembers = teamRows.filter(
    (m) => m.status !== "removed" && m.status !== "invited"
  );

  const activeProjects = projects.filter(isActiveJob);
  const memberMap = new Map<string, { displayName: string; role: CanonicalCompanyRole }>();
  for (const m of activeMembers) {
    const id = m.userId ?? m.uid;
    memberMap.set(id, {
      displayName: m.displayName?.trim() || m.email || id.slice(0, 8),
      role: m.effectiveRole,
    });
  }

  const projectSummaries: PlanningProjectSummary[] = activeProjects.map((project) => {
    const ids = project.assignedMemberIds ?? [];
    return {
      project,
      assignedMemberIds: ids,
      assignedMemberNames: ids.map((id) => resolveMemberName(id, memberMap)),
    };
  });

  const assignedWorkerIds = new Set<string>();
  for (const ps of projectSummaries) {
    for (const id of ps.assignedMemberIds) assignedWorkerIds.add(id);
  }

  const { items: allTasks, docs: allTaskDocs } = await loadTasksForProjects(activeProjects);
  const tasksDueToday = allTasks.filter((t) => t.dueDate === todayIso);
  const tasksDueThisWeek = allTasks.filter((t) =>
    isDateInRange(t.dueDate, weekStartIso, weekEndIso)
  );
  const tasksDueThisMonth = allTasks.filter((t) =>
    isDateInRange(t.dueDate, monthStartIso, monthEndIso)
  );

  const absencesInWeek = absencesLoaded.items.filter((a) =>
    rangesOverlapWeek(a.start, a.end, weekStartIso, weekEndIso)
  );
  const absencesInMonth = absencesLoaded.items.filter((a) =>
    isDateInRange(a.start, monthStartIso, monthEndIso) ||
    isDateInRange(a.end, monthStartIso, monthEndIso) ||
    (a.start <= monthStartIso && a.end >= monthEndIso)
  );
  const absencesToday = absencesLoaded.items.filter((a) =>
    dateOverlapsDay(a.start, a.end, todayIso)
  );

  const workingUserIds = new Set(timeEntriesToday.items.map((e) => e.userId));
  const timeEntriesStatus = timeEntriesToday.status;
  const absencesStatus = absencesLoaded.status;

  const members: PlanningMember[] = activeMembers.map((m) => {
    const id = m.userId ?? m.uid;
    const assignedProjectIds = projectSummaries
      .filter((ps) => ps.assignedMemberIds.includes(id))
      .map((ps) => ps.project.id);
    return {
      uid: id,
      displayName: memberMap.get(id)?.displayName ?? id.slice(0, 8),
      email: m.email,
      effectiveRole: m.effectiveRole,
      assignedProjectCount: assignedProjectIds.length,
      assignedProjectIds,
      todayStatus: computeTodayStatus(
        id,
        absencesToday,
        workingUserIds,
        timeEntriesStatus,
        absencesStatus
      ),
    };
  });

  let missingAttendanceCount: number | null = null;
  if (timeEntriesStatus === "available" && absencesStatus === "available") {
    missingAttendanceCount = members.filter(
      (m) =>
        m.effectiveRole === "worker" &&
        m.todayStatus === "no_record" &&
        m.assignedProjectCount > 0
    ).length;
  } else if (timeEntriesStatus === "available") {
    missingAttendanceCount = members.filter(
      (m) => m.effectiveRole === "worker" && m.todayStatus === "no_record"
    ).length;
  }

  const absencesTodayCount =
    absencesStatus === "unavailable" ? null : absencesToday.length;

  const stats: PlanningOverviewStats = {
    teamMemberCount: activeMembers.length,
    activeJobCount: activeProjects.length,
    assignedWorkerCount: assignedWorkerIds.size,
    absencesTodayCount,
    tasksWithDueDateCount: tasksDueThisWeek.length,
    missingAttendanceCount,
  };

  const alerts: PlanningAlert[] = [];
  if (timeEntriesStatus === "unavailable") {
    alerts.push({
      id: "time-unavailable",
      kind: "placeholder",
      messageKey: "planning.alert.timeUnavailable",
    });
  }
  if (absencesStatus === "unavailable") {
    alerts.push({
      id: "absences-unavailable",
      kind: "placeholder",
      messageKey: "planning.alert.absencesUnavailable",
    });
  }
  if (tasksDueToday.length > 0) {
    alerts.push({
      id: "tasks-today",
      kind: "warning",
      messageKey: "planning.alert.tasksDueToday",
    });
  }
  const unassignedActive = activeProjects.filter(
    (p) => !(p.assignedMemberIds?.length ?? 0)
  );
  if (unassignedActive.length > 0) {
    alerts.push({
      id: "unassigned-jobs",
      kind: "info",
      messageKey: "planning.alert.unassignedJobs",
      href: "/app/projects?filter=active",
    });
  }

  return {
    orgId,
    orgName: org?.name ?? workspace.name,
    members,
    activeProjects: projectSummaries,
    stats,
    tasksDueToday,
    tasksDueThisWeek,
    tasksDueThisMonth,
    allTasksWithDueDate: allTasks,
    allTaskDocs,
    absencesToday,
    absencesInWeek,
    absencesInMonth,
    absencesLoaded: absencesLoaded.items,
    workingTodayUserIds: [...workingUserIds],
    timeEntriesToday: timeEntriesToday.items,
    timeEntriesStatus,
    absencesStatus,
    alerts,
    todayIso,
    weekStartIso,
    weekDays,
    monthDays: monthDaysList,
    monthLabelIso: toIsoDateLocal(startOfMonth(now)),
  };
}

function rangesOverlapWeek(
  aStart: string,
  aEnd: string,
  weekStart: string,
  weekEnd: string
): boolean {
  return aStart <= weekEnd && aEnd >= weekStart;
}

/** Stable accent color per project for timeline chips. */
export function planningProjectColor(projectId: string): string {
  const palette = ["#1D376A", "#E85D04", "#2A9D8F", "#6A4C93", "#457B9D", "#BC4749"];
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}
