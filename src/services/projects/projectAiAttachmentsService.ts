/**
 * Copy AI wizard attachments from draft storage into project documents.
 */
import {
  getCallable,
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

/** Paths saved on the project or standard wizard prefixes — not limited to active workspace id. */
function isSafeWizardStoragePath(
  storagePath: string,
  uid: string,
  projectId: string
): boolean {
  if (isProjectDocumentStoragePath(storagePath, projectId)) return true;
  if (storagePath.startsWith(`users/${uid}/aiProjectDrafts/`)) return true;
  return storagePath.startsWith("workspaces/") && storagePath.includes("/ai-drafts/");
}

function workspaceKeysForProject(
  project: ProjectDoc,
  workspace: ActiveWorkspace,
  uid: string
): string[] {
  const keys = new Set<string>();
  keys.add(getWorkspaceStorageKey(workspace, uid));
  if (project.orgId?.trim()) keys.add(project.orgId.trim());
  if (project.workspaceId?.trim()) keys.add(project.workspaceId.trim());
  if (project.ownerId?.trim()) keys.add(project.ownerId.trim());
  for (const storagePath of project.aiWizardAttachmentPaths ?? []) {
    const match = storagePath.match(/^workspaces\/([^/]+)\//);
    if (match?.[1]) keys.add(match[1]);
  }
  return [...keys];
}

function isProjectDocumentStoragePath(storagePath: string, projectId: string): boolean {
  return storagePath.startsWith(`projects/${projectId}/documents/`);
}

function fileFromProjectDocumentPath(storagePath: string): UploadedAiDraftFile {
  return {
    id: `path:${storagePath}`,
    fileName: fileNameFromStoragePath(storagePath),
    mimeType: guessMimeType(storagePath),
    storagePath,
  };
}

function fileFromStoragePath(storagePath: string): UploadedAiDraftFile {
  return {
    id: `path:${storagePath}`,
    fileName: fileNameFromStoragePath(storagePath),
    mimeType: guessMimeType(storagePath),
    storagePath,
  };
}

async function readStorageBytes(storagePath: string, timeoutMs = 90_000): Promise<Uint8Array> {
  const storage = getStorageInstance();
  if (!storage) throw new Error("Storage not configured");
  const srcRef = ref(storage, storagePath);

  const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });

  try {
    const { getBytes } = await import("firebase/storage");
    const bytes = await withTimeout(getBytes(srcRef), "Storage read");
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  } catch {
    const url = await withTimeout(getDownloadURL(srcRef), "Storage URL");
    const res = await withTimeout(fetch(url), "Storage download");
    if (!res.ok) throw new Error(`Could not read file from storage (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

async function listExistingProjectDocuments(
  projectId: string
): Promise<{ paths: Set<string>; names: Set<string>; byPath: Map<string, ProjectDocumentRecord> }> {
  const db = getFirestoreInstance();
  const paths = new Set<string>();
  const names = new Set<string>();
  const byPath = new Map<string, ProjectDocumentRecord>();
  if (!db) return { paths, names, byPath };

  const snap = await getDocs(collection(db, "projects", projectId, "documents"));
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const path = String(data.storagePath ?? "");
    const fileName = String(data.fileName ?? "");
    const record: ProjectDocumentRecord = {
      id: d.id,
      projectId,
      fileName: fileName || "file",
      mimeType: String(data.mimeType ?? guessMimeType(path)),
      storagePath: path,
    };
    if (path) {
      paths.add(path);
      byPath.set(path, record);
    }
    if (fileName) names.add(fileName);
  }
  return { paths, names, byPath };
}

async function ensureProjectDocumentRecord(
  projectId: string,
  uid: string,
  storagePath: string,
  fileName: string,
  mimeType: string,
  existing?: Awaited<ReturnType<typeof listExistingProjectDocuments>>
): Promise<ProjectDocumentRecord> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const catalog = existing ?? (await listExistingProjectDocuments(projectId));
  const linked = catalog.byPath.get(storagePath);
  if (linked) return linked;

  const safeName = sanitizeFileName(fileName || fileNameFromStoragePath(storagePath));
  const docRef = await addDoc(collection(db, "projects", projectId, "documents"), {
    fileName: fileName || safeName,
    mimeType: mimeType || guessMimeType(safeName),
    storagePath,
    uploadedBy: uid,
    source: "ai_wizard",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    projectId,
    fileName: fileName || safeName,
    mimeType: mimeType || guessMimeType(safeName),
    storagePath,
  };
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

  const safeName = sanitizeFileName(file.fileName || fileNameFromStoragePath(file.storagePath));
  const destPath = `projects/${projectId}/documents/${safeName}`;
  const mime = file.mimeType || guessMimeType(safeName);

  if (
    file.storagePath === destPath ||
    isProjectDocumentStoragePath(file.storagePath, projectId)
  ) {
    return ensureProjectDocumentRecord(
      projectId,
      uid,
      file.storagePath,
      file.fileName || safeName,
      mime
    );
  }

  const bytes = await readStorageBytes(file.storagePath);

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
  fileId: string,
  project?: ProjectDoc
): Promise<UploadedAiDraftFile | null> {
  if (fileId.startsWith("path:")) {
    const storagePath = fileId.slice("path:".length);
    if (storagePath.startsWith("projects/") && storagePath.includes("/documents/")) {
      return fileFromProjectDocumentPath(storagePath);
    }
    if (
      project &&
      isSafeWizardStoragePath(storagePath, uid, project.id)
    ) {
      return fileFromStoragePath(storagePath);
    }
    if (!isAllowedAiDraftStoragePath(storagePath, uid, getWorkspaceStorageKey(workspace, uid))) {
      return null;
    }
    return fileFromStoragePath(storagePath);
  }

  if (fileId.includes("/")) {
    const storagePath = fileId;
    if (project && isSafeWizardStoragePath(storagePath, uid, project.id)) {
      return fileFromStoragePath(storagePath);
    }
    if (!isAllowedAiDraftStoragePath(storagePath, uid, getWorkspaceStorageKey(workspace, uid))) {
      return null;
    }
    return fileFromStoragePath(storagePath);
  }

  const db = getFirestoreInstance();
  if (!db) return null;
  const wsKeys = project
    ? workspaceKeysForProject(project, workspace, uid)
    : [getWorkspaceStorageKey(workspace, uid)];

  for (const wsKey of wsKeys) {
    const snap = await getDoc(doc(db, "workspaces", wsKey, "aiDraftFiles", fileId));
    if (!snap.exists()) continue;
    const data = snap.data() as Record<string, unknown>;
    const storagePath = String(data.storagePath ?? "");
    if (!storagePath) continue;
    return {
      id: fileId,
      fileName: String(data.fileName ?? fileNameFromStoragePath(storagePath)),
      mimeType: String(data.mimeType ?? guessMimeType(storagePath)),
      storagePath,
    };
  }
  return null;
}

async function loadAttachmentsFromProjectDraft(
  workspace: ActiveWorkspace,
  uid: string,
  draftId: string,
  project: ProjectDoc
): Promise<UploadedAiDraftFile[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const wsKeys = workspaceKeysForProject(project, workspace, uid);
  const files: UploadedAiDraftFile[] = [];
  const seen = new Set<string>();

  const addFile = (file: UploadedAiDraftFile | null) => {
    if (!file || seen.has(file.storagePath)) return;
    seen.add(file.storagePath);
    files.push(file);
  };

  for (const wsKey of wsKeys) {
    const snap = await getDoc(doc(db, "workspaces", wsKey, "projectDrafts", draftId));
    if (!snap.exists()) continue;

    const data = snap.data() as Record<string, unknown>;
    const draft = data.draft as { source?: { attachedFileIds?: string[] } } | undefined;
    const attachedIds = draft?.source?.attachedFileIds ?? [];
    const storagePaths = Array.isArray(data.attachmentStoragePaths)
      ? (data.attachmentStoragePaths as string[]).filter(Boolean)
      : [];

    for (const storagePath of storagePaths) {
      if (storagePath.startsWith("projects/") && storagePath.includes("/documents/")) {
        addFile(fileFromProjectDocumentPath(storagePath));
        continue;
      }
      if (
        isSafeWizardStoragePath(storagePath, uid, project.id) ||
        isAllowedAiDraftStoragePath(storagePath, uid, wsKey)
      ) {
        addFile(fileFromStoragePath(storagePath));
      }
    }

    for (const fileId of attachedIds) {
      addFile(await loadAiDraftFileById(workspace, uid, fileId, project));
    }
  }

  return files;
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
    if (isProjectDocumentStoragePath(storagePath, project.id)) {
      byPath.set(storagePath, fileFromProjectDocumentPath(storagePath));
      continue;
    }
    if (
      isSafeWizardStoragePath(storagePath, uid, project.id) ||
      isAllowedAiDraftStoragePath(storagePath, uid, wsKey)
    ) {
      byPath.set(storagePath, fileFromStoragePath(storagePath));
    }
  }

  for (const fileId of fileIds) {
    const file = await loadAiDraftFileById(workspace, uid, fileId, project);
    if (file) byPath.set(file.storagePath, file);
  }

  if (byPath.size === 0 && project.aiDraftId) {
    const fromDraft = await loadAttachmentsFromProjectDraft(
      workspace,
      uid,
      project.aiDraftId,
      project
    );
    for (const file of fromDraft) {
      byPath.set(file.storagePath, file);
    }
  }

  return [...byPath.values()];
}

export type ImportAiAttachmentsResult = {
  imported: ProjectDocumentRecord[];
  errors: string[];
};

type ServerImportResponse = {
  documents?: ProjectDocumentRecord[];
  errors?: string[];
};

async function importAiWizardAttachmentsViaServer(
  projectId: string
): Promise<ImportAiAttachmentsResult | null> {
  try {
    const callable = getCallable<{ projectId: string }, ServerImportResponse>(
      "importProjectDraftAttachments",
      { timeoutMs: 60_000 }
    );
    const res = await callable({ projectId });
    const data = res.data;
    if (!data) return null;
    return {
      imported: data.documents ?? [],
      errors: data.errors ?? [],
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[ai attachments] server import unavailable", err);
    }
    return null;
  }
}

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
  const alreadyListed = await listExistingProjectDocuments(input.projectId);
  if (alreadyListed.byPath.size > 0) {
    return { imported: [...alreadyListed.byPath.values()], errors: [] };
  }

  const serverResult = await importAiWizardAttachmentsViaServer(input.projectId);
  if (serverResult) {
    return serverResult;
  }

  const attachments = await resolveAiWizardAttachments(
    input.project,
    input.workspace,
    input.userId
  );
  if (attachments.length === 0) return { imported: [], errors: [] };

  const imported: ProjectDocumentRecord[] = [];
  const errors: string[] = [];
  const existingNames = new Set(alreadyListed.names);
  const existingPaths = new Set(alreadyListed.paths);
  let catalog = alreadyListed;

  for (const file of attachments) {
    const safeName = sanitizeFileName(file.fileName);
    const expectedDest =
      isProjectDocumentStoragePath(file.storagePath, input.projectId)
        ? file.storagePath
        : `projects/${input.projectId}/documents/${safeName}`;

    if (existingPaths.has(expectedDest) || existingNames.has(file.fileName)) {
      try {
        const linked = await ensureProjectDocumentRecord(
          input.projectId,
          input.userId,
          expectedDest,
          file.fileName,
          file.mimeType,
          catalog
        );
        imported.push(linked);
        catalog.byPath.set(linked.storagePath, linked);
        existingPaths.add(linked.storagePath);
        existingNames.add(linked.fileName);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.fileName}: ${msg}`);
      }
      continue;
    }

    try {
      const record = await copyAttachmentToProjectDocument(
        input.projectId,
        input.userId,
        file,
        input.workspace
      );
      imported.push(record);
      catalog.byPath.set(record.storagePath, record);
      existingPaths.add(record.storagePath);
      existingNames.add(record.fileName);
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
