import {
  getFirestoreInstance,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "@/lib/firebase";
import { waitForAuthUser } from "@/lib/firebase";

export type SharedFieldNotePreview = {
  id: string;
  text: string;
  createdByName: string | null;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
};

function toIso(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && typeof (raw as { toDate?: unknown }).toDate === "function") {
    try {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

function mapDoc(id: string, data: Record<string, unknown>): SharedFieldNotePreview | null {
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) return null;
  const createdAt = toIso(data.createdAt) || toIso(data.updatedAt);
  if (!createdAt) return null;
  return {
    id,
    text,
    createdByName: typeof data.createdByName === "string" ? data.createdByName : null,
    createdAt,
    projectId: typeof data.projectId === "string" ? data.projectId : null,
    projectName: typeof data.projectName === "string" ? data.projectName : null,
  };
}

function dedupeNotes(rows: SharedFieldNotePreview[]): SharedFieldNotePreview[] {
  const byId = new Map<string, SharedFieldNotePreview>();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fetchSharedFieldNotesViaApi(orgId: string): Promise<SharedFieldNotePreview[]> {
  const user = await waitForAuthUser();
  if (!user) return [];
  const token = await user.getIdToken();
  const res = await fetch(`/api/operations/field-notes?orgId=${encodeURIComponent(orgId.trim())}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (process.env.NODE_ENV === "development") {
      const body = await res.json().catch(() => ({}));
      console.warn("[fieldNotesService] API fetch failed:", orgId, res.status, body);
    }
    return [];
  }
  const data = (await res.json()) as { notes?: SharedFieldNotePreview[] };
  return data.notes ?? [];
}

/** Open shared field notes for org managers (newest first). */
export async function listOpenSharedFieldNotes(
  orgId: string,
  max = 50
): Promise<SharedFieldNotePreview[]> {
  const db = getFirestoreInstance();
  if (!db || !orgId.trim()) return [];

  const ref = collection(db, `organizations/${orgId.trim()}/fieldNotes`);

  const mapSnap = (docs: { id: string; data: () => Record<string, unknown> }[]) => {
    const items: SharedFieldNotePreview[] = [];
    for (const docSnap of docs) {
      const data = docSnap.data() as Record<string, unknown>;
      if (data.shareWithManager === false) continue;
      if (data.status !== "open") continue;
      const row = mapDoc(docSnap.id, data);
      if (row) items.push(row);
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.slice(0, max);
  };

  try {
    const snap = await getDocs(ref);
    const rows = mapSnap(snap.docs);
    if (rows.length > 0) return rows;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fieldNotesService] collection read failed:", e);
    }
  }

  const q = query(
    ref,
    where("shareWithManager", "==", true),
    where("status", "==", "open"),
    orderBy("createdAt", "desc"),
    limit(max)
  );

  try {
    const snap = await getDocs(q);
    return mapSnap(snap.docs);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fieldNotesService] indexed query failed, trying fallback:", e);
    }
    try {
      const fallbackQ = query(ref, where("status", "==", "open"), orderBy("createdAt", "desc"), limit(max));
      const snap = await getDocs(fallbackQ);
      return mapSnap(snap.docs);
    } catch (e2) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[fieldNotesService] fallback query failed, loading all:", e2);
      }
      try {
        const snap = await getDocs(ref);
        return mapSnap(snap.docs);
      } catch (e3) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[fieldNotesService] client read failed, trying API:", e3);
        }
        return fetchSharedFieldNotesViaApi(orgId);
      }
    }
  }
}

/** Dashboard loader: client Firestore first, API/admin fallback, multiple org ids. */
export async function fetchSharedFieldNotesForDashboard(
  primaryOrgId: string,
  extraOrgIds: string[] = []
): Promise<SharedFieldNotePreview[]> {
  const orgIds = [...new Set([primaryOrgId.trim(), ...extraOrgIds.map((id) => id.trim())].filter(Boolean))];
  if (orgIds.length === 0) return [];

  const merged: SharedFieldNotePreview[] = [];
  for (const orgId of orgIds) {
    let rows = await listOpenSharedFieldNotes(orgId).catch(() => [] as SharedFieldNotePreview[]);
    if (rows.length === 0) {
      rows = await fetchSharedFieldNotesViaApi(orgId).catch(() => []);
    }
    merged.push(...rows);
  }
  return dedupeNotes(merged);
}

export function canViewOrgSharedFieldNotes(role: string | undefined): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "accountant"
  );
}

export function snippetFieldNoteText(text: string, maxLen = 120): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

export function collectProjectOrgIds(
  projects: Array<{ orgId?: string | null; workspaceId?: string | null }>
): string[] {
  const ids = new Set<string>();
  for (const p of projects) {
    const orgId = p.orgId?.trim() || p.workspaceId?.trim();
    if (orgId) ids.add(orgId);
  }
  return [...ids];
}
