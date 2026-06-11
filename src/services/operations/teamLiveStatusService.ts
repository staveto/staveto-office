import {
  getFirestoreInstance,
  doc,
  getDoc,
  onSnapshot,
} from "@/lib/firebase";
import type { OrgMemberRow } from "@/lib/organizations";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { ProjectDoc } from "@/lib/projects";
import type { TeamLiveStatusItem } from "@/lib/operationsMetrics";

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
  gpsStart?: { lat?: number; lng?: number } | null;
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
    gpsStart: (at.gpsStart as { lat?: number; lng?: number } | null) ?? null,
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
    if (!entry.userId || latestEntryByUser.has(entry.userId)) continue;
    latestEntryByUser.set(entry.userId, entry);
  }

  return input.members
    .filter((m) => m.status !== "removed")
    .map((member) => {
      const uid = member.uid;
      const timer = input.activeTimers.get(uid);
      const absent = input.todayAbsentUserIds.has(uid);

      if (absent) {
        return {
          uid,
          name: member.displayName ?? member.email ?? uid,
          email: member.email,
          status: "absent" as const,
        } satisfies TeamLiveStatusItem;
      }

      if (timer) {
        const pauseSince = timer.status === "paused" ? timer.pauses?.at(-1)?.startedAt : undefined;
        const projectName =
          timer.projectNameSnapshot ||
          (timer.projectId ? projectById.get(timer.projectId)?.name : undefined);
        return {
          uid,
          name: member.displayName ?? member.email ?? uid,
          email: member.email,
          status: (timer.status === "paused" ? "paused" : "working") as
            | "paused"
            | "working",
          projectId: timer.projectId,
          projectName,
          taskId: timer.taskId,
          taskName: timer.taskTitleSnapshot,
          timerSeconds: activeTimerSeconds(timer),
          pauseSince,
          locationLabel:
            typeof timer.gpsStart?.lat === "number" && typeof timer.gpsStart?.lng === "number"
              ? `${timer.gpsStart.lat.toFixed(3)}, ${timer.gpsStart.lng.toFixed(3)}`
              : undefined,
        } satisfies TeamLiveStatusItem;
      }

      const last = latestEntryByUser.get(uid);
      return {
        uid,
        name: member.displayName ?? member.email ?? uid,
        email: member.email,
        status: (last ? "offline" : "not_started") as "offline" | "not_started",
        projectId: last?.projectId,
        projectName: last?.projectNameSnapshot,
        taskId: last?.taskId ?? undefined,
        taskName: last?.taskTitleSnapshot ?? undefined,
      } satisfies TeamLiveStatusItem;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
