/**
 * Company / workspace-wide documents & site photos from existing project data.
 * Reads projects/{projectId}/documents and problem photos — no schema changes.
 */
import { getStorageInstance, ref, getDownloadURL } from "@/lib/firebase";
import { listProjectsForWorkspace, type ProjectDoc } from "@/lib/projects";
import {
  listProjectDocuments,
  type ProjectDocumentRecord,
} from "@/services/projects/projectDocuments";
import { listProjectProblems, type ProblemDoc } from "@/services/projects/projectProblemsReadService";
import type { ActiveWorkspace } from "@/types/workspace";

export type WorkspaceDocumentSource = "project_document" | "problem_photo";

export type WorkspaceDocumentRow = {
  id: string;
  projectId: string;
  projectName: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  createdAt?: string;
  source: WorkspaceDocumentSource;
  problemId?: string;
  problemTitle?: string;
  /** Cached after first resolve (optional). */
  previewUrl?: string;
};

export type WorkspaceDocumentsBundle = {
  projects: ProjectDoc[];
  rows: WorkspaceDocumentRow[];
};

const MAX_PROJECTS = 40;

function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}

export function isSitePhotoRow(row: WorkspaceDocumentRow): boolean {
  if (row.source === "problem_photo") return true;
  return isImageMime(row.mimeType);
}

export function isFileDocumentRow(row: WorkspaceDocumentRow): boolean {
  if (row.source === "problem_photo") return false;
  return !isImageMime(row.mimeType);
}

function mapProjectDocument(
  doc: ProjectDocumentRecord,
  project: ProjectDoc
): WorkspaceDocumentRow {
  return {
    id: doc.id,
    projectId: project.id,
    projectName: project.name,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    storagePath: doc.storagePath,
    createdAt: doc.createdAt,
    source: "project_document",
  };
}

function mapProblemPhotos(problem: ProblemDoc, project: ProjectDoc): WorkspaceDocumentRow[] {
  const rows: WorkspaceDocumentRow[] = [];
  problem.photos.forEach((photo, index) => {
    if (!photo.path?.trim()) return;
    rows.push({
      id: `${problem.id}-photo-${index}`,
      projectId: project.id,
      projectName: project.name,
      fileName: photo.path.split("/").pop() ?? `problem-${problem.id}.jpg`,
      mimeType: "image/jpeg",
      storagePath: photo.path,
      createdAt: problem.createdAt,
      source: "problem_photo",
      problemId: problem.id,
      problemTitle: problem.shortDescription,
      previewUrl: photo.downloadURL,
    });
  });
  return rows;
}

export async function listWorkspaceDocuments(
  workspace: ActiveWorkspace,
  userId: string
): Promise<WorkspaceDocumentsBundle> {
  const projects = (await listProjectsForWorkspace(workspace, userId)).slice(0, MAX_PROJECTS);
  const rows: WorkspaceDocumentRow[] = [];

  await Promise.all(
    projects.map(async (project) => {
      const [docs, problems] = await Promise.all([
        listProjectDocuments(project.id).catch(() => [] as ProjectDocumentRecord[]),
        listProjectProblems(project.id).catch(() => [] as ProblemDoc[]),
      ]);

      for (const doc of docs) {
        rows.push(mapProjectDocument(doc, project));
      }
      for (const problem of problems) {
        rows.push(...mapProblemPhotos(problem, project));
      }
    })
  );

  rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return { projects, rows };
}

export async function resolveDocumentDownloadUrl(
  row: WorkspaceDocumentRow
): Promise<string | null> {
  if (row.previewUrl) return row.previewUrl;
  if (!row.storagePath) return null;
  const storage = getStorageInstance();
  if (!storage) return null;
  try {
    return await getDownloadURL(ref(storage, row.storagePath));
  } catch {
    return null;
  }
}

export function filterDocumentRows(
  rows: WorkspaceDocumentRow[],
  mode: "documents" | "photos",
  options?: { projectId?: string; query?: string }
): WorkspaceDocumentRow[] {
  let filtered = rows.filter((row) =>
    mode === "photos" ? isSitePhotoRow(row) : isFileDocumentRow(row)
  );

  if (options?.projectId) {
    filtered = filtered.filter((row) => row.projectId === options.projectId);
  }

  const q = options?.query?.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (row) =>
        row.fileName.toLowerCase().includes(q) ||
        row.projectName.toLowerCase().includes(q) ||
        (row.problemTitle?.toLowerCase().includes(q) ?? false)
    );
  }

  return filtered;
}
