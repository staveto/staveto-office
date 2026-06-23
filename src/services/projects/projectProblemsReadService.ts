/**

 * Read-only project problems — mirrors mobile `projects/{projectId}/problems`.

 */

import { collection, getDocs, getFirestoreInstance } from "@/lib/firebase";

import {

  parseProblemPhotosFromData,

  resolvePhotosForProjectProblems,

} from "./projectProblemPhotosService";



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

  category?: string;

  createdByUid: string;

  createdByName?: string;

  assigneeUid?: string;

  assigneeName?: string;

  resolutionNote?: string | null;

  location?: string | null;

  createdAt: string;

  photos: ProblemPhoto[];

  attachments?: string[];

  dueDate?: string | null;

  blocksWork?: boolean | null;

};



function toIso(raw: unknown): string | undefined {

  if (!raw) return undefined;

  if (typeof raw === "string") return raw;

  if (typeof raw === "object" && raw !== null && "toDate" in raw) {

    return (raw as { toDate: () => Date }).toDate().toISOString();

  }

  return undefined;

}



function mapProblemFields(

  id: string,

  projectId: string,

  data: Record<string, unknown>,

  photos: ProblemPhoto[]

): ProblemDoc {

  return {

    id,

    projectId,

    shortDescription: String(data.shortDescription ?? data.title ?? ""),

    detail: typeof data.detail === "string" ? data.detail : null,

    priority: String(data.priority ?? "medium"),

    status: String(data.status ?? "open"),

    category: typeof data.category === "string" ? data.category : undefined,

    createdByUid: String(data.createdByUid ?? ""),

    createdByName: typeof data.createdByName === "string" ? data.createdByName : undefined,

    assigneeUid: typeof data.assigneeUid === "string" ? data.assigneeUid : undefined,

    assigneeName: typeof data.assigneeName === "string" ? data.assigneeName : undefined,

    resolutionNote: typeof data.resolutionNote === "string" ? data.resolutionNote : null,

    location:

      typeof data.location === "string"

        ? data.location

        : ((data.locationHint as string | null) ?? null),

    createdAt: toIso(data.createdAt) ?? "",

    photos,

    attachments: Array.isArray(data.attachments)

      ? (data.attachments as unknown[]).map(String).filter(Boolean)

      : undefined,

    dueDate: toIso(data.dueDate) ?? (typeof data.dueDate === "string" ? data.dueDate : null),

    blocksWork: typeof data.blocksWork === "boolean" ? data.blocksWork : null,

  };

}



export async function listProjectProblems(projectId: string): Promise<ProblemDoc[]> {

  const db = getFirestoreInstance();

  if (!db || !projectId) return [];



  try {

    const snap = await getDocs(collection(db, "projects", projectId, "problems"));

    const rawItems = snap.docs.map((d) => ({

      id: d.id,

      data: d.data() as Record<string, unknown>,

    }));



    const photoMap = await resolvePhotosForProjectProblems(projectId, rawItems);



    return rawItems.map(({ id, data }) => {

      const photos = photoMap.get(id) ?? parseProblemPhotosFromData(data);

      return mapProblemFields(id, projectId, data, photos);

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



export type OpenProblemPreview = {

  id: string;

  projectId: string;

  projectName: string;

  shortDescription: string;

  priority: string;

  status: string;

  createdAt: string;

  createdByName?: string;

  photoCount?: number;

};



function isOpenProblemStatus(status: string): boolean {

  return OPEN_PROBLEM_STATUSES.has(String(status).toLowerCase());

}



/** Open / in-progress problems with project context — for dashboard drill-down. */

export async function listOpenProblemsForDashboard(

  projects: Array<{ id: string; name: string }>

): Promise<OpenProblemPreview[]> {

  if (projects.length === 0) return [];

  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const uniqueIds = [...new Set(projects.map((p) => p.id).filter(Boolean))].slice(0, 80);

  const all = await listProblemsForProjects(uniqueIds);

  return all

    .filter((p) => isOpenProblemStatus(String(p.status)))

    .map((p) => ({

      id: p.id,

      projectId: p.projectId,

      projectName: nameById.get(p.projectId) ?? p.projectId.slice(0, 8),

      shortDescription: p.shortDescription,

      priority: String(p.priority),

      status: String(p.status),

      createdAt: p.createdAt,

      createdByName: p.createdByName,

      photoCount: p.photos.length,

    }))

    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

}



/** Count non-archived open/in-progress problems across workspace projects. */

export async function countOpenProblemsForProjects(projectIds: string[]): Promise<number> {

  if (projectIds.length === 0) return 0;

  const uniqueIds = [...new Set(projectIds.filter(Boolean))].slice(0, 80);

  const all = await listProblemsForProjects(uniqueIds);

  return all.filter((p) => isOpenProblemStatus(String(p.status))).length;

}


