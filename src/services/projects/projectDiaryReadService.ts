/**
 * Read-only construction diary — mirrors mobile `projects/{projectId}/constructionDiary`.
 */
import { collection, getDocs, getFirestoreInstance } from "@/lib/firebase";

export type DiaryEntryRecord = {
  id: string;
  projectId: string;
  projectName?: string;
  date: string;
  workDescription: string;
  weather?: string;
  workers?: string;
  materials?: string;
  notes?: string;
  createdBy: string;
  createdAt?: string;
  attachments?: string[];
};

function toIso(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

function diaryDayYmd(entry: { date?: string; createdAt?: string }): string {
  if (entry.date && /^\d{4}-\d{2}-\d{2}/.test(entry.date)) return entry.date.slice(0, 10);
  if (entry.createdAt) {
    const d = new Date(entry.createdAt);
    if (Number.isFinite(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  return "";
}

export async function listProjectDiaryEntries(projectId: string): Promise<DiaryEntryRecord[]> {
  const db = getFirestoreInstance();
  if (!db || !projectId) return [];

  const snap = await getDocs(collection(db, "projects", projectId, "constructionDiary"));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const dateIso = toIso(data.date) ?? (typeof data.date === "string" ? data.date : "");
    return {
      id: d.id,
      projectId,
      date: dateIso,
      workDescription: String(data.workDescription ?? ""),
      weather: typeof data.weather === "string" ? data.weather : undefined,
      workers: typeof data.workers === "string" ? data.workers : undefined,
      materials: typeof data.materials === "string" ? data.materials : undefined,
      notes: typeof data.notes === "string" ? data.notes : undefined,
      createdBy: String(data.createdBy ?? ""),
      createdAt: toIso(data.createdAt),
      attachments: Array.isArray(data.attachments) ? (data.attachments as string[]) : undefined,
    };
  });
}

export async function listDiaryForProjects(
  projects: { id: string; name: string }[],
  userId: string,
  dateYmd: string
): Promise<DiaryEntryRecord[]> {
  const all: DiaryEntryRecord[] = [];
  for (const p of projects) {
    const entries = await listProjectDiaryEntries(p.id);
    for (const e of entries) {
      if (e.createdBy !== userId) continue;
      if (diaryDayYmd(e) !== dateYmd) continue;
      all.push({ ...e, projectName: p.name });
    }
  }
  return all;
}
