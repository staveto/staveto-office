import { getAdminDb } from "@/lib/firebaseAdmin";
import type { SharedFieldNotePreview } from "@/services/operations/fieldNotesService";

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

/** Admin read — bypasses client Firestore list-query rule quirks. */
export async function listOpenSharedFieldNotesAdmin(
  orgId: string,
  max = 50
): Promise<SharedFieldNotePreview[]> {
  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_UNAVAILABLE");

  const normalized = orgId.trim();
  if (!normalized) return [];

  const snap = await db.collection(`organizations/${normalized}/fieldNotes`).limit(100).get();
  const items: SharedFieldNotePreview[] = [];

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    if (data.shareWithManager === false) continue;
    if (data.status !== "open") continue;
    const row = mapDoc(docSnap.id, data);
    if (row) items.push(row);
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, max);
}
