/**
 * Read-only time tracking from root `timeEntries` collection — aligned with mobile.
 */
import {
  getFirestoreInstance,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
} from "@/lib/firebase";
import {
  hasProjectAccess,
  listProjectsForWorkspace,
  type ProjectDoc,
} from "@/lib/projects";
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceType, type WorkspaceRole } from "@/types/workspace";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import { fromLegacyWorkspace, type Workspace } from "@/lib/workspace-types";
import { isNormalizedActiveWorkspace } from "@/lib/projects";

export type TimerPause = {
  startedAt: string;
  endedAt?: string;
};

export type GpsPoint = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export type TimeEntryDoc = {
  id: string;
  projectId: string;
  projectNameSnapshot: string;
  userId: string;
  userNameSnapshot: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  mode: "timer" | "manual";
  date?: string;
  note?: string;
  gpsStart?: GpsPoint | null;
  gpsEnd?: GpsPoint | null;
  flags?: { reminded?: boolean; autoStopped?: boolean; lowAccuracy?: boolean };
  phaseId?: string | null;
  phaseNameSnapshot?: string | null;
  taskId?: string | null;
  taskTitleSnapshot?: string | null;
  pauses?: TimerPause[];
  workDurationMs?: number;
  createdAt?: string;
  updatedAt?: string;
};

export class FirestoreIndexError extends Error {
  constructor(
    message: string,
    public readonly indexFields?: string
  ) {
    super(message);
    this.name = "FirestoreIndexError";
  }
}

const IN_QUERY_CHUNK_SIZE = 10;
const USER_ENTRIES_LIMIT = 4000;
const PROJECT_CHUNK_LIMIT = 2500;

function wrapIndexError(e: unknown, indexFields: string): never {
  const err = e as { code?: string; message?: string };
  if (err?.code === "failed-precondition" || err?.message?.includes("index")) {
    throw new FirestoreIndexError(
      `Firestore index required for ${indexFields}. Create the index in Firebase Console.`,
      indexFields
    );
  }
  throw e;
}

function normalizeIsoLikeString(s: string): string {
  const t = s.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00.000Z`;
  if (/^\d{4}-\d{2}-\d{2}\s+\d/.test(t)) return t.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  return t;
}

function toIso(ts: unknown): string | undefined {
  if (ts == null || ts === "") return undefined;
  if (typeof ts === "object" && ts !== null && typeof (ts as { toDate?: unknown }).toDate === "function") {
    try {
      const d = (ts as { toDate: () => Date }).toDate();
      return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
    } catch {
      /* fall through */
    }
  }
  if (typeof ts === "string") {
    const raw = ts.trim();
    if (!raw) return undefined;
    const n = normalizeIsoLikeString(raw);
    const d = new Date(n);
    if (Number.isFinite(d.getTime())) return d.toISOString();
    const d2 = new Date(raw);
    return Number.isFinite(d2.getTime()) ? d2.toISOString() : undefined;
  }
  if (typeof ts === "number" && Number.isFinite(ts)) {
    const ms = Math.abs(ts) < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
  }
  if (typeof ts === "object" && ts !== null) {
    const anyTs = ts as { seconds?: number; nanoseconds?: number };
    if (typeof anyTs.seconds === "number") {
      const nano = typeof anyTs.nanoseconds === "number" ? anyTs.nanoseconds : 0;
      const d = new Date(anyTs.seconds * 1000 + nano / 1e6);
      return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
    }
  }
  return undefined;
}

function coerceManualDateYmd(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return undefined;
  }
  const iso = toIso(raw);
  if (!iso) return undefined;
  return localCalendarYmdFromIso(iso);
}

function coerceDurationMinutes(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return 0;
}

function coerceProjectIdFromFirestore(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") {
    const path = (raw as { path?: unknown }).path;
    if (typeof path === "string" && path.length > 0) {
      const prefix = "projects/";
      return (path.startsWith(prefix) ? path.slice(prefix.length) : path.split("/").pop() ?? "").trim();
    }
  }
  return String(raw).trim();
}

function ymdLocalStartToIso(ymd: string): string | undefined {
  const parts = ymd.split("-").map((x) => parseInt(x, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : undefined;
}

function localCalendarYmdFromIso(iso: string): string {
  const n = normalizeIsoLikeString(iso);
  const d = new Date(n || iso);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function entryCalendarDayYmd(e: TimeEntryDoc): string {
  const dateStr =
    typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(e.date.trim()) ? e.date.trim().slice(0, 10) : "";
  const manualMode =
    e.mode === "manual" || (typeof e.mode === "string" && e.mode.trim().toLowerCase() === "manual");
  if (manualMode && dateStr) return dateStr;
  const fromStarted = e.startedAt ? localCalendarYmdFromIso(e.startedAt) : "";
  if (fromStarted) return fromStarted;
  const fromEnded = e.endedAt ? localCalendarYmdFromIso(e.endedAt) : "";
  if (fromEnded) return fromEnded;
  if (e.createdAt) {
    const y = localCalendarYmdFromIso(e.createdAt);
    if (y) return y;
  }
  return dateStr;
}

export function entryCalendarDayInRange(e: TimeEntryDoc, fromYmd: string, toYmd: string): boolean {
  const dayKey = entryCalendarDayYmd(e);
  if (!dayKey) return false;
  return dayKey >= fromYmd && dayKey <= toYmd;
}

function entrySortKeyMs(e: TimeEntryDoc): number {
  if (e.startedAt) {
    const n = normalizeIsoLikeString(e.startedAt);
    const t = new Date(n || e.startedAt).getTime();
    if (Number.isFinite(t) && t !== 0) return t;
  }
  const day = entryCalendarDayYmd(e);
  if (day) return new Date(`${day}T12:00:00`).getTime();
  return 0;
}

function sortEntriesByStartedDesc(a: TimeEntryDoc, b: TimeEntryDoc): number {
  return entrySortKeyMs(b) - entrySortKeyMs(a);
}

export function parseTimeEntryDoc(id: string, data: Record<string, unknown>): TimeEntryDoc {
  let startedAt = toIso(data.startedAt) ?? (typeof data.startedAt === "string" ? data.startedAt : "");
  let endedAt = toIso(data.endedAt) ?? (typeof data.endedAt === "string" ? data.endedAt : "");
  if (!startedAt && endedAt) startedAt = endedAt;

  const durationMinutes = coerceDurationMinutes(data.durationMinutes);
  const dateField = coerceManualDateYmd(data.date);
  const modeRaw = data.mode;
  const modeStr = typeof modeRaw === "string" ? modeRaw : typeof modeRaw === "number" ? String(modeRaw) : "";
  const mode: "timer" | "manual" = modeStr.trim().toLowerCase() === "manual" ? "manual" : "timer";

  if (!startedAt && dateField) {
    startedAt = ymdLocalStartToIso(dateField) ?? `${dateField}T00:00:00.000Z`;
    if (!endedAt) endedAt = startedAt;
  }

  return {
    id,
    projectId: coerceProjectIdFromFirestore(data.projectId),
    projectNameSnapshot: (data.projectNameSnapshot as string) ?? "",
    userId: String((data.userId as string) ?? "").trim(),
    userNameSnapshot: (data.userNameSnapshot as string) ?? "",
    startedAt,
    endedAt,
    durationMinutes,
    mode,
    date: dateField,
    note: typeof data.note === "string" ? data.note : undefined,
    gpsStart: (data.gpsStart as GpsPoint | null) ?? null,
    gpsEnd: (data.gpsEnd as GpsPoint | null) ?? null,
    phaseId: (data.phaseId as string) ?? undefined,
    phaseNameSnapshot: (data.phaseNameSnapshot as string) ?? undefined,
    taskId: (data.taskId as string) ?? undefined,
    taskTitleSnapshot: (data.taskTitleSnapshot as string) ?? undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export function getMonthRangeYmd(year: number, month: number): { fromYmd: string; toYmd: string } {
  const fromYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toYmd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { fromYmd, toYmd };
}

export async function listTimeEntriesForUser(
  userId: string,
  fromYmd: string,
  toYmd: string
): Promise<TimeEntryDoc[]> {
  const db = getFirestoreInstance();
  if (!db || !userId) return [];

  const c = collection(db, "timeEntries");
  try {
    const q = query(c, where("userId", "==", userId), orderBy("startedAt", "desc"), limit(USER_ENTRIES_LIMIT));
    const snap = await getDocs(q);
    const mapped: TimeEntryDoc[] = [];
    for (const d of snap.docs) {
      try {
        mapped.push(parseTimeEntryDoc(d.id, d.data() as Record<string, unknown>));
      } catch {
        /* skip malformed */
      }
    }
    return mapped.filter((e) => entryCalendarDayInRange(e, fromYmd, toYmd)).sort(sortEntriesByStartedDesc);
  } catch (e) {
    wrapIndexError(e, "timeEntries: userId (Asc), startedAt (Desc)");
  }
}

export async function listTimeEntriesForProjects(
  projectIds: string[],
  fromYmd: string,
  toYmd: string
): Promise<TimeEntryDoc[]> {
  const db = getFirestoreInstance();
  if (!db || projectIds.length === 0) return [];

  const c = collection(db, "timeEntries");
  const chunks: string[][] = [];
  for (let i = 0; i < projectIds.length; i += IN_QUERY_CHUNK_SIZE) {
    chunks.push(projectIds.slice(i, i + IN_QUERY_CHUNK_SIZE));
  }

  const allDocs: { id: string; data: Record<string, unknown> }[] = [];
  try {
    for (const chunk of chunks) {
      const q = query(c, where("projectId", "in", chunk), orderBy("startedAt", "desc"), limit(PROJECT_CHUNK_LIMIT));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        allDocs.push({ id: d.id, data: d.data() as Record<string, unknown> });
      }
    }
  } catch (e) {
    wrapIndexError(e, "timeEntries: projectId (in), startedAt (Desc)");
  }

  const seen = new Set<string>();
  const mapped: TimeEntryDoc[] = [];
  for (const d of allDocs) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    try {
      mapped.push(parseTimeEntryDoc(d.id, d.data));
    } catch {
      /* skip */
    }
  }
  return mapped.filter((e) => entryCalendarDayInRange(e, fromYmd, toYmd)).sort(sortEntriesByStartedDesc);
}

function toActiveWorkspace(workspace: Workspace | ActiveWorkspace, uid: string): ActiveWorkspace {
  if (isNormalizedActiveWorkspace(workspace)) return workspace;
  return fromLegacyWorkspace(workspace, uid);
}

export async function getTeamTimeProjectIds(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  role: WorkspaceRole | undefined
): Promise<{ projectIds: string[]; canSeeTeam: boolean; isManagerView: boolean }> {
  const active = toActiveWorkspace(workspace, uid);
  const projects = await listProjectsForWorkspace(active, uid);
  const isCompany = isCompanyWorkspaceType(active.type);
  const isManager = isCompany && canManageCompanyOperations(role);

  if (isManager) {
    const orgId = active.orgId?.trim();
    const ids = projects
      .filter((p) => !orgId || p.orgId === orgId || !p.orgId)
      .map((p) => p.id);
    return { projectIds: ids, canSeeTeam: ids.length > 0, isManagerView: true };
  }

  const ids: string[] = [];
  for (const p of projects) {
    if (p.ownerId === uid) {
      ids.push(p.id);
      continue;
    }
    const { allowed } = await hasProjectAccess(p.id, uid);
    if (allowed && p.orgId) ids.push(p.id);
  }
  return { projectIds: ids, canSeeTeam: ids.length > 0, isManagerView: false };
}

export type MemberRatesMap = Map<string, Map<string, number>>;

export async function loadMemberRatesForEntries(entries: TimeEntryDoc[]): Promise<MemberRatesMap> {
  const db = getFirestoreInstance();
  const ratesMap: MemberRatesMap = new Map();
  if (!db || entries.length === 0) return ratesMap;

  const allProjectIds = [...new Set(entries.map((e) => e.projectId).filter(Boolean))];
  const allUserIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))];

  const profileRates = new Map<string, number>();
  await Promise.all(
    allUserIds.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const data = snap.data() as { hourlyRateEur?: number };
          if (typeof data.hourlyRateEur === "number" && data.hourlyRateEur > 0) {
            profileRates.set(uid, data.hourlyRateEur);
          }
        }
      } catch {
        /* ignore */
      }
    })
  );

  const userIdsByProject = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.userId || !e.projectId) continue;
    const set = userIdsByProject.get(e.projectId) ?? new Set();
    set.add(e.userId);
    userIdsByProject.set(e.projectId, set);
  }

  await Promise.all(
    allProjectIds.map(async (pid) => {
      try {
        const membersSnap = await getDocs(collection(db, "projects", pid, "members"));
        const byUser = new Map<string, number>();
        for (const m of membersSnap.docs) {
          const data = m.data() as { userId?: string; hourlyRateEur?: number };
          const uid = data.userId ?? m.id;
          const rate =
            typeof data.hourlyRateEur === "number" && data.hourlyRateEur > 0
              ? data.hourlyRateEur
              : profileRates.get(uid);
          if (rate != null && rate > 0) byUser.set(uid, rate);
        }
        for (const uid of userIdsByProject.get(pid) ?? []) {
          if (!byUser.has(uid) && profileRates.has(uid)) {
            byUser.set(uid, profileRates.get(uid)!);
          }
        }
        if (byUser.size > 0) ratesMap.set(pid, byUser);
      } catch {
        /* ignore */
      }
    })
  );

  return ratesMap;
}

export type AttendanceLoadResult = {
  myEntries: TimeEntryDoc[];
  teamEntries: TimeEntryDoc[];
  allEntries: TimeEntryDoc[];
  canSeeTeam: boolean;
  isManagerView: boolean;
  projects: ProjectDoc[];
};

export async function loadAttendanceForMonth(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  role: WorkspaceRole | undefined,
  year: number,
  month: number
): Promise<AttendanceLoadResult> {
  const { fromYmd, toYmd } = getMonthRangeYmd(year, month);
  const active = toActiveWorkspace(workspace, uid);
  const { projectIds, canSeeTeam, isManagerView } = await getTeamTimeProjectIds(active, uid, role);
  const projects = await listProjectsForWorkspace(active, uid);

  const myEntries = await listTimeEntriesForUser(uid, fromYmd, toYmd);

  if (!canSeeTeam || projectIds.length === 0) {
    return {
      myEntries,
      teamEntries: [],
      allEntries: myEntries,
      canSeeTeam: false,
      isManagerView,
      projects,
    };
  }

  const teamEntries = await listTimeEntriesForProjects(projectIds, fromYmd, toYmd);
  const byId = new Map<string, TimeEntryDoc>();
  for (const e of [...myEntries, ...teamEntries]) {
    byId.set(e.id, e);
  }
  const allEntries = [...byId.values()].sort(sortEntriesByStartedDesc);

  return {
    myEntries,
    teamEntries,
    allEntries,
    canSeeTeam: true,
    isManagerView,
    projects,
  };
}
