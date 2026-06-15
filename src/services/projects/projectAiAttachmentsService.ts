/**
 * Copy AI wizard attachments from draft storage into project documents.
 */
import {
  getFirestoreInstance,
  getStorageInstance,
  ref,
  uploadBytes,
  getDownloadURL,
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "@/lib/firebase";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import type { ActiveWorkspace } from "@/types/workspace";
import type { ProjectDoc } from "@/lib/projects";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
}

function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function fileNameFromStoragePath(storagePath: string): string {
  const parts = storagePath.split("/");
  return parts[parts.length - 1] || "attachment";
}

function isAllowedAiDraftStoragePath(
  storagePath: string,
  uid: string,
  wsKey: string
): boolean {
  return (
    storagePath.startsWith(`workspaces/${wsKey}/ai-drafts/`) ||
    storagePath.startsWith(`users/${uid}/aiProjectDrafts/`)
  );
}

function fileFromStoragePath(storagePath: string): UploadedAiDraftFile {
  return {
    id: `path:${storagePath}`,
    fileName: fileNameFromStoragePath(storagePath),
    mimeType: guessMimeType(storagePath),
    storagePath,
  };
}

async function readStorageBytes(storagePath: string): Promise<Uint8Array> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Storage not configured");
  const srcRef = ref(storage, storagePath);
  try {
    const { getBytes } = await import("firebase/storage");
    const bytes = await getBytes(srcRef);
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  } catch {
    const url = await getDownloadURL(srcRef);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not read file from storage (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

export async function copyAttachmentToProjectDocument(
  projectId: string,
  uid: string,
  file: Pick<UploadedAiDraftFile, "id" | "fileName" | "mimeType" | "storagePath">,
  workspace?: ActiveWorkspace
): Promise<ProjectDocumentRecord> {
  const storage = getStorageInstance();
  const db = getFirestoreInstance();
  if (!storage || !db) throw new Error("Firebase not configured");

  const bytes = await readStorageBytes(file.storagePath);
  const safeName = sanitizeFileName(file.fileName || fileNameFromStoragePath(file.storagePath));
  const destPath = `projects/${projectId}/documents/${safeName}`;
  const mime = file.mimeType || guessMimeType(safeName);

  await uploadBytes(ref(storage, destPath), bytes, { contentType: mime });

  const docRef = await addDoc(collection(db, "projects", projectId, "documents"), {
    fileName: file.fileName || safeName,
    mimeType: mime,
    storagePath: destPath,
    uploadedBy: uid,
    source: "ai_wizard",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (workspace && file.id && !file.id.startsWith("path:")) {
    const wsKey = getWorkspaceStorageKey(workspace, uid);
    await setDoc(
      doc(db, "workspaces", wsKey, "aiDraftFiles", file.id),
      { projectId, projectDocumentId: docRef.id },
      { merge: true }
    ).catch(() => undefined);
  }

  return {
    id: docRef.id,
    projectId,
    fileName: file.fileName || safeName,
    mimeType: mime,
    storagePath: destPath,
  };
}

async function loadAiDraftFileById(
  workspace: ActiveWorkspace,
  uid: string,
  fileId: string
): Promise<UploadedAiDraftFile | null> {
  if (fileId.startsWith("path:")) {
    const storagePath = fileId.slice("path:".length);
    if (!isAllowedAiDraftStoragePath(storagePath, uid, getWorkspaceStorageKey(workspace, uid))) {
      return null;
    }
    return fileFromStoragePath(storagePath);
  }

  if (fileId.includes("/")) {
    const storagePath = fileId;
    if (!isAllowedAiDraftStoragePath(storagePath, uid, getWorkspaceStorageKey(workspace, uid))) {
      return null;
    }
    return fileFromStoragePath(storagePath);
  }

  const db = getFirestoreInstance();
  if (!db) return null;
  const wsKey = getWorkspaceStorageKey(workspace, uid);
  const snap = await getDoc(doc(db, "workspaces", wsKey, "aiDraftFiles", fileId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const storagePath = String(data.storagePath ?? "");
  if (!storagePath) return null;
  return {
    id: fileId,
    fileName: String(data.fileName ?? fileNameFromStoragePath(storagePath)),
    mimeType: String(data.mimeType ?? guessMimeType(storagePath)),
    storagePath,
  };
}

async function loadAttachmentsFromProjectDraft(
  workspace: ActiveWorkspace,
  uid: string,
  draftId: string
): Promise<UploadedAiDraftFile[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const wsKey = getWorkspaceStorageKey(workspace, uid);
  const snap = await getDoc(doc(db, "workspaces", wsKey, "projectDrafts", draftId));
  if (!snap.exists()) return [];

  const data = snap.data() as Record<string, unknown>;
  const draft = data.draft as { source?: { attachedFileIds?: string[] } } | undefined;
  const attachedIds = draft?.source?.attachedFileIds ?? [];
  const files: UploadedAiDraftFile[] = [];

  for (const fileId of attachedIds) {
    const file = await loadAiDraftFileById(workspace, uid, fileId);
    if (file) files.push(file);
  }

  return files;
}

async function loadWorkspaceAiDraftFilesForProject(
  workspace: ActiveWorkspace,
  uid: string,
  _projectId: string
): Promise<UploadedAiDraftFile[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const wsKey = getWorkspaceStorageKey(workspace, uid);
  const snap = await getDocs(collection(db, "workspaces", wsKey, "aiDraftFiles"));
  const candidates: Array<UploadedAiDraftFile & { createdAtMs: number }> = [];

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const linkedProjectId = String(data.projectId ?? "");
    const uploadedBy = String(data.uploadedBy ?? "");
    const storagePath = String(data.storagePath ?? "");
    if (!storagePath) continue;
    if (linkedProjectId) continue;
    if (uploadedBy !== uid) continue;
    if (!isAllowedAiDraftStoragePath(storagePath, uid, wsKey)) continue;

    const mime = String(data.mimeType ?? guessMimeType(storagePath));
    if (!mime.startsWith("image/") && mime !== "application/pdf") continue;

    const createdAtRaw = data.createdAt;
    let createdAtMs = 0;
    if (
      createdAtRaw &&
      typeof createdAtRaw === "object" &&
      createdAtRaw !== null &&
      "toDate" in createdAtRaw
    ) {
      createdAtMs = (createdAtRaw as { toDate: () => Date }).toDate().getTime();
    }

    candidates.push({
      id: d.id,
      fileName: String(data.fileName ?? fileNameFromStoragePath(storagePath)),
      mimeType: mime,
      storagePath,
      createdAtMs,
    });
  }

  return candidates
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 3)
    .map(({ createdAtMs: _ignored, ...file }) => file);
}

export function resolveAiAttachmentSources(project: ProjectDoc): {
  paths: string[];
  fileIds: string[];
} {
  const paths = [...(project.aiWizardAttachmentPaths ?? [])].filter(Boolean);
  const fileIds = [...(project.attachedFileIds ?? [])].filter(Boolean);
  return { paths, fileIds };
}

export async function resolveAiWizardAttachments(
  project: ProjectDoc,
  workspace: ActiveWorkspace,
  uid: string
): Promise<UploadedAiDraftFile[]> {
  const { paths, fileIds } = resolveAiAttachmentSources(project);
  const byPath = new Map<string, UploadedAiDraftFile>();
  const wsKey = getWorkspaceStorageKey(workspace, uid);

  for (const storagePath of paths) {
    if (!isAllowedAiDraftStoragePath(storagePath, uid, wsKey)) continue;
    byPath.set(storagePath, fileFromStoragePath(storagePath));
  }

  for (const fileId of fileIds) {
    const file = await loadAiDraftFileById(workspace, uid, fileId);
    if (file) byPath.set(file.storagePath, file);
  }

  if (byPath.size === 0 && project.aiDraftId) {
    const fromDraft = await loadAttachmentsFromProjectDraft(workspace, uid, project.aiDraftId);
    for (const file of fromDraft) {
      byPath.set(file.storagePath, file);
    }
  }

  if (byPath.size === 0 && project.createdByAI) {
    const fromWorkspace = await loadWorkspaceAiDraftFilesForProject(workspace, uid, project.id);
    for (const file of fromWorkspace) {
      byPath.set(file.storagePath, file);
    }
  }

  return [...byPath.values()];
}

async function listExistingDestPaths(projectId: string): Promise<Set<string>> {
  const db = getFirestoreInstance();
  if (!db) return new Set();
  const snap = await getDocs(collection(db, "projects", projectId, "documents"));
  const names = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const path = String(data.storagePath ?? "");
    if (path) names.add(path);
    const fileName = String(data.fileName ?? "");
    if (fileName) names.add(fileName);
  }
  return names;
}

export type ImportAiAttachmentsResult = {
  imported: ProjectDocumentRecord[];
  errors: string[];
};

export async function importAiWizardAttachmentsToProject(input: {
  projectId: string;
  workspace: ActiveWorkspace;
  userId: string;
  project: ProjectDoc;
}): Promise<ProjectDocumentRecord[]> {
  const result = await importAiWizardAttachmentsToProjectDetailed(input);
  return result.imported;
}

export async function importAiWizardAttachmentsToProjectDetailed(input: {
  projectId: string;
  workspace: ActiveWorkspace;
  userId: string;
  project: ProjectDoc;
}): Promise<ImportAiAttachmentsResult> {
  const attachments = await resolveAiWizardAttachments(
    input.project,
    input.workspace,
    input.userId
  );
  if (attachments.length === 0) return { imported: [], errors: [] };

  const existing = await listExistingDestPaths(input.projectId);
  const imported: ProjectDocumentRecord[] = [];
  const errors: string[] = [];

  for (const file of attachments) {
    const safeName = sanitizeFileName(file.fileName);
    const expectedDest = `projects/${input.projectId}/documents/${safeName}`;
    if (existing.has(expectedDest) || existing.has(file.fileName)) continue;

    try {
      const record = await copyAttachmentToProjectDocument(
        input.projectId,
        input.userId,
        file,
        input.workspace
      );
      imported.push(record);
      existing.add(record.storagePath);
      existing.add(record.fileName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${file.fileName}: ${msg}`);
      if (process.env.NODE_ENV === "development") {
        console.warn("[ai attachments] copy failed", file.storagePath, err);
      }
    }
  }

  return { imported, errors };
}
