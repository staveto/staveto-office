import {
  getFirestoreInstance,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from "@/lib/firebase";
import type { OrgMemberRow } from "@/lib/organizations";
import { getBestUserDisplayName } from "@/lib/userDisplay";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { ProjectDoc } from "@/lib/projects";
import type { TeamLiveStatusItem } from "@/lib/operationsMetrics";
import { parseGpsPoint, resolveMemberGpsStatus, type ParsedGpsPoint } from "@/lib/operationsGps";

/**
 * TODO Phase 2 (mobile): extend orgLiveTimer.syncOrgLiveTimer to publish into
 * organizations/{orgId}/liveTimers/{uid}:
 *   - gpsStart, gpsAccuracyM, gpsTimestamp, pauseSince, taskTitleSnapshot
 * Without that mobile change the web dashboard has no reliable live GPS source.
 */

export type ActiveTimerState = {
  uid: string;
  status: "running" | "paused";
  startedAt?: string;
  runningSince?: string;
  accumulatedMs?: number;
  projectId?: string;
  projectNameSnapshot?: string;
  taskId?: string;
  taskTitleSnapshot?: string;
  gpsStart?: ParsedGpsPoint | null;
  pauseSince?: string;
  pauses?: Array<{ startedAt?: string; endedAt?: string }>;
};

function toIso(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && typeof (raw as { toDate?: unknown }).toDate === "function") {
    try {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseActiveTimer(uid: string, raw: unknown): ActiveTimerState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const at = raw as Record<string, unknown>;
  const status = at.status === "paused" ? "paused" : "running";
  return {
    uid,
    status,
    startedAt: toIso(at.startedAt),
    runningSince: toIso(at.runningSince),
    accumulatedMs: typeof at.accumulatedMs === "number" ? at.accumulatedMs : undefined,
    projectId: typeof at.projectId === "string" ? at.projectId : undefined,
    projectNameSnapshot:
      typeof at.projectNameSnapshot === "string" ? at.projectNameSnapshot : undefined,
    taskId: typeof at.taskId === "string" ? at.taskId : undefined,
    taskTitleSnapshot:
      typeof at.taskTitleSnapshot === "string" ? at.taskTitleSnapshot : undefined,
    gpsStart: parseGpsPoint(at.gpsStart),
    pauseSince: toIso(at.pauseSince) ?? (typeof at.pauseSince === "string" ? at.pauseSince : undefined),
    pauses: Array.isArray(at.pauses)
      ? (at.pauses as Array<{ startedAt?: string; endedAt?: string }>)
      : undefined,
  };
}

function activeTimerSeconds(timer: ActiveTimerState): number {
  const now = Date.now();
  const runningSince = timer.runningSince ?? timer.startedAt;
  const runningSinceMs = runningSince ? new Date(runningSince).getTime() : now;
  const base = timer.accumulatedMs ?? 0;
  if (timer.status === "paused") return Math.max(0, Math.round(base / 1000));
  return Math.max(0, Math.round((base + Math.max(0, now - runningSinceMs)) / 1000));
}

/** Crew timers published to organizations/{orgId}/liveTimers/{uid} from mobile. */
export async function loadOrgLiveTimers(orgId: string): Promise<Map<string, ActiveTimerState>> {
  const db = getFirestoreInstance();
  const map = new Map<string, ActiveTimerState>();
  const normalized = orgId.trim();
  if (!db || !normalized) return map;

  try {
    const snap = await getDocs(collection(db, "organizations", normalized, "liveTimers"));
    for (const d of snap.docs) {
      const parsed = parseActiveTimer(d.id, d.data());
      if (parsed) map.set(d.id, parsed);
    }
  } catch {
    /* permission or empty */
  }
  return map;
}

export function subscribeOrgLiveTimers(
  orgId: string,
  onUpdate: (map: Map<string, ActiveTimerState>) => void
): () => void {
  const db = getFirestoreInstance();
  const normalized = orgId.trim();
  if (!db || !normalized) {
    onUpdate(new Map());
    return () => {};
  }

  return onSnapshot(
    collection(db, "organizations", normalized, "liveTimers"),
    (snap) => {
      const map = new Map<string, ActiveTimerState>();
      for (const d of snap.docs) {
        const parsed = parseActiveTimer(d.id, d.data());
        if (parsed) map.set(d.id, parsed);
      }
      onUpdate(map);
    },
    () => onUpdate(new Map())
  );
}

export async function loadActiveTimers(memberIds: string[]): Promise<Map<string, ActiveTimerState>> {
  const db = getFirestoreInstance();
  const map = new Map<string, ActiveTimerState>();
  if (!db || memberIds.length === 0) return map;

  await Promise.all(
    memberIds.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const timer = parseActiveTimer(uid, data.activeTimer);
        if (timer) map.set(uid, timer);
      } catch {
        /* ignore read errors */
      }
    })
  );

  return map;
}

export function subscribeActiveTimers(
  memberIds: string[],
  onUpdate: (map: Map<string, ActiveTimerState>) => void
): () => void {
  const db = getFirestoreInstance();
  if (!db || memberIds.length === 0) {
    onUpdate(new Map());
    return () => {};
  }

  const timers = new Map<string, ActiveTimerState>();
  const unsubscribers = memberIds.map((uid) =>
    onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const data = (snap.data() ?? {}) as Record<string, unknown>;
        const parsed = parseActiveTimer(uid, data.activeTimer);
        if (parsed) timers.set(uid, parsed);
        else timers.delete(uid);
        onUpdate(new Map(timers));
      },
      () => {
        timers.delete(uid);
        onUpdate(new Map(timers));
      }
    )
  );

  return () => {
    for (const unsub of unsubscribers) unsub();
  };
}

function todayWorkedMinutesForUser(
  uid: string,
  todayEntries: TimeEntryDoc[],
  timerSeconds?: number
): number {
  const completed = todayEntries
    .filter((e) => e.userId === uid)
    .reduce((sum, e) => sum + Math.max(0, e.durationMinutes || 0), 0);
  const active = typeof timerSeconds === "number" ? Math.floor(timerSeconds / 60) : 0;
  return completed + active;
}

function entriesForUser(uid: string, todayEntries: TimeEntryDoc[]): TimeEntryDoc[] {
  return todayEntries.filter((e) => e.userId === uid);
}

export function resolveTeamLiveStatus(input: {
  members: OrgMemberRow[];
  projects: ProjectDoc[];
  todayEntries: TimeEntryDoc[];
  todayAbsentUserIds: Set<string>;
  activeTimers: Map<string, ActiveTimerState>;
}): TeamLiveStatusItem[] {
  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  const latestEntryByUser = new Map<string, TimeEntryDoc>();
  for (const entry of input.todayEntries) {
    if (!entry.userId) continue;
    const prev = latestEntryByUser.get(entry.userId);
    if (!prev) {
      latestEntryByUser.set(entry.userId, entry);
      continue;
    }
    const prevMs = new Date(prev.endedAt || prev.startedAt).getTime();
    const curMs = new Date(entry.endedAt || entry.startedAt).getTime();
    if (curMs > prevMs) latestEntryByUser.set(entry.userId, entry);
  }

  const resolveName = (member: OrgMemberRow, entry?: TimeEntryDoc) =>
    getBestUserDisplayName({
      displayName: member.displayName,
      userNameSnapshot: entry?.userNameSnapshot,
      email: member.email,
      uid: member.uid,
    });

  return input.members
    .filter((m) => m.status !== "removed")
    .map((member) => {
      const uid = member.uid;
      const timer = input.activeTimers.get(uid);
      const absent = input.todayAbsentUserIds.has(uid);
      const userEntries = entriesForUser(uid, input.todayEntries);

      if (absent) {
        const last = latestEntryByUser.get(uid);
        return {
          uid,
          name: resolveName(member, last),
          email: member.email,
          status: "absent" as const,
          todayWorkedMinutes: todayWorkedMinutesForUser(uid, input.todayEntries),
          gpsStatus: "none" as const,
        } satisfies TeamLiveStatusItem;
      }

      if (timer) {
        const pauseSince =
          timer.status === "paused"
            ? timer.pauseSince ?? timer.pauses?.at(-1)?.startedAt
            : undefined;
        const projectName =
          timer.projectNameSnapshot ||
          (timer.projectId ? projectById.get(timer.projectId)?.name : undefined);
        const timerSeconds = activeTimerSeconds(timer);
        const status = (timer.status === "paused" ? "paused" : "working") as "paused" | "working";
        return {
          uid,
          name: resolveName(member, userEntries[userEntries.length - 1]),
          email: member.email,
          status,
          projectId: timer.projectId,
          projectName,
          taskId: timer.taskId,
          taskName: timer.taskTitleSnapshot,
          timerSeconds,
          startedAt: timer.startedAt ?? timer.runningSince,
          pauseSince,
          todayWorkedMinutes: todayWorkedMinutesForUser(uid, input.todayEntries, timerSeconds),
          gpsStatus: resolveMemberGpsStatus({
            status,
            liveGpsStart: timer.gpsStart ?? null,
            todayEntriesForUser: userEntries,
          }),
        } satisfies TeamLiveStatusItem;
      }

      const last = latestEntryByUser.get(uid);
      const status = (last ? "offline" : "not_started") as "offline" | "not_started";
      return {
        uid,
        name: resolveName(member, last),
        email: member.email,
        status,
        projectId: last?.projectId,
        projectName: last?.projectNameSnapshot,
        taskId: last?.taskId ?? undefined,
        taskName: last?.taskTitleSnapshot ?? undefined,
        todayWorkedMinutes: todayWorkedMinutesForUser(uid, input.todayEntries),
        gpsStatus: resolveMemberGpsStatus({
          status,
          liveGpsStart: null,
          todayEntriesForUser: userEntries,
        }),
      } satisfies TeamLiveStatusItem;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
