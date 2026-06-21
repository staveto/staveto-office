import {
  getFirestoreInstance,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "@/lib/firebase";

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
  const createdAt = toIso(data.createdAt);
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
          console.warn("[fieldNotesService] listOpenSharedFieldNotes failed:", e3);
        }
        return [];
      }
    }
  }
}

export function canViewOrgSharedFieldNotes(role: string | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export function snippetFieldNoteText(text: string, maxLen = 120): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}
