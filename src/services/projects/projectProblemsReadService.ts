/**
 * Read-only project problems — mirrors mobile `projects/{projectId}/problems`.
 */
import { collection, getDocs, getFirestoreInstance } from "@/lib/firebase";

export type ProblemStatus = "open" | "in_progress" | "fixed" | "verified" | "rejected";
export type ProblemPriority = "low" | "medium" | "high";

export type ProblemPhoto = {
  path: string;
  downloadURL?: string;
};

export type ProblemDoc = {
  id: string;
  projectId: string;
  shortDescription: string;
  detail?: string | null;
  priority: ProblemPriority | string;
  status: ProblemStatus | string;
  createdByUid: string;
  createdByName?: string;
  createdAt: string;
  photos: ProblemPhoto[];
};

function toIso(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

export async function listProjectProblems(projectId: string): Promise<ProblemDoc[]> {
  const db = getFirestoreInstance();
  if (!db || !projectId) return [];

  try {
    const snap = await getDocs(collection(db, "projects", projectId, "problems"));
    return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const photosRaw = Array.isArray(data.photos) ? data.photos : [];
    const photos: ProblemPhoto[] = photosRaw
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map((p) => ({
        path: String(p.path ?? ""),
        downloadURL: typeof p.downloadURL === "string" ? p.downloadURL : undefined,
      }));

    return {
      id: d.id,
      projectId,
      shortDescription: String(data.shortDescription ?? data.title ?? ""),
      detail: typeof data.detail === "string" ? data.detail : null,
      priority: String(data.priority ?? "medium"),
      status: String(data.status ?? "open"),
      createdByUid: String(data.createdByUid ?? ""),
      createdByName: typeof data.createdByName === "string" ? data.createdByName : undefined,
      createdAt: toIso(data.createdAt) ?? "",
      photos,
    };
  });
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[projectProblemsReadService] listProjectProblems failed:", projectId, e);
    }
    return [];
  }
}

export async function listProblemsForProjects(projectIds: string[]): Promise<ProblemDoc[]> {
  const chunks = await Promise.all(projectIds.map((id) => listProjectProblems(id)));
  return chunks.flat();
}

const OPEN_PROBLEM_STATUSES = new Set(["open", "in_progress"]);

/** Count non-archived open/in-progress problems across workspace projects. */
export async function countOpenProblemsForProjects(projectIds: string[]): Promise<number> {
  if (projectIds.length === 0) return 0;
  const uniqueIds = [...new Set(projectIds.filter(Boolean))].slice(0, 80);
  const all = await listProblemsForProjects(uniqueIds);
  return all.filter((p) => OPEN_PROBLEM_STATUSES.has(String(p.status).toLowerCase())).length;
}
