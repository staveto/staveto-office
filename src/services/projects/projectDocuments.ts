/**
 * Project documents — Storage + Firestore under projects/{projectId}/documents.
 * Mirrors metadata to workspaces/{wsKey}/aiDraftFiles for AI callables (attachedFileIds).
 */
import {
  getFirestoreInstance,
  getStorageInstance,
  ref,
  uploadBytes,
  collection,
  addDoc,
  setDoc,
  doc,
  getDocs,
  serverTimestamp,
} from "@/lib/firebase";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import type { ActiveWorkspace } from "@/types/workspace";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";

export type ProjectDocumentRecord = UploadedAiDraftFile & {
  projectId: string;
  createdAt?: string;
  /** Set for mobile work photos (`projects/{id}/attachments`). */
  uploadedByName?: string;
  comment?: string;
  kind?: string;
};

import { ATTACHMENT_SIZE_POLICY } from "@/lib/attachmentSizePolicy";
import { prepareProjectAttachmentFile } from "@/lib/prepareProjectAttachmentFile";

const MAX_FILE_BYTES = ATTACHMENT_SIZE_POLICY.maxUploadBytes;
const ALLOWED_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
}

function toIso(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

export async function listProjectDocuments(
  projectId: string
): Promise<ProjectDocumentRecord[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const snap = await getDocs(collection(db, "projects", projectId, "documents"));
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        projectId,
        fileName: (data.fileName as string) ?? "file",
        mimeType: (data.mimeType as string) ?? "application/octet-stream",
        storagePath: (data.storagePath as string) ?? "",
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/**
 * Site / work photos from mobile (`projects/{id}/attachments`, kind work_photo or image).
 * Office overview historically only read `documents/` — without this, quick-add photos never appear.
 */
export async function listProjectWorkPhotos(
  projectId: string
): Promise<ProjectDocumentRecord[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  try {
    const snap = await getDocs(collection(db, "projects", projectId, "attachments"));
    const rows: ProjectDocumentRecord[] = [];
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const expenseId = typeof data.expenseId === "string" ? data.expenseId.trim() : "";
      if (expenseId) continue; // receipt scans stay out of site photo gallery

      const kind = typeof data.kind === "string" ? data.kind.trim().toLowerCase() : "";
      const fileType = typeof data.fileType === "string" ? data.fileType.trim().toLowerCase() : "";
      const mime =
        (typeof data.mimeType === "string" && data.mimeType) ||
        (typeof data.contentType === "string" && data.contentType) ||
        "";
      const isImage =
        kind === "work_photo" ||
        fileType === "image" ||
        mime.startsWith("image/");
      if (!isImage) continue;

      const storagePath =
        (typeof data.storagePath === "string" && data.storagePath) ||
        (typeof data.filePath === "string" && data.filePath) ||
        "";
      if (!storagePath.trim()) continue;

      rows.push({
        id: `att-${d.id}`,
        projectId,
        fileName: (typeof data.fileName === "string" && data.fileName) || "photo.jpg",
        mimeType: mime.startsWith("image/") ? mime : "image/jpeg",
        storagePath,
        createdAt: toIso(data.createdAt),
        uploadedByName:
          typeof data.uploadedByName === "string" ? data.uploadedByName : undefined,
        comment: typeof data.comment === "string" ? data.comment : undefined,
        kind: kind || "work_photo",
      });
    }
    return rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  } catch (err) {
    console.warn("[projectDocuments] listProjectWorkPhotos failed", projectId, err);
    return [];
  }
}

/** Documents tab + overview photos: office uploads + mobile work photos. */
export async function listProjectDocumentsAndWorkPhotos(
  projectId: string
): Promise<ProjectDocumentRecord[]> {
  const [docs, photos] = await Promise.all([
    listProjectDocuments(projectId),
    listProjectWorkPhotos(projectId),
  ]);
  const byPath = new Map<string, ProjectDocumentRecord>();
  for (const row of [...docs, ...photos]) {
    const key = row.storagePath?.trim() || row.id;
    if (!byPath.has(key)) byPath.set(key, row);
  }
  return [...byPath.values()].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  );
}

export async function uploadProjectDocument(
  projectId: string,
  workspace: ActiveWorkspace,
  uid: string,
  file: File
): Promise<ProjectDocumentRecord> {
  const storage = getStorageInstance();
  const db = getFirestoreInstance();
  if (!storage || !db) throw new Error("Firebase not configured");

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mime) && !file.name.endsWith(".txt")) {
    throw new Error("FILE_TYPE_UNSUPPORTED");
  }

  const { file: prepared, optimized } = await prepareProjectAttachmentFile(file);
  const uploadMime = prepared.type || mime;
  const uploadName = prepared.name || file.name;

  const safeName = sanitizeFileName(uploadName);
  const storagePath = `projects/${projectId}/documents/${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, prepared, { contentType: uploadMime });

  const docRef = await addDoc(collection(db, "projects", projectId, "documents"), {
    fileName: uploadName,
    mimeType: uploadMime,
    storagePath,
    uploadedBy: uid,
    source: "upload",
    optimized: optimized || null,
    byteSize: prepared.size,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const wsKey = getWorkspaceStorageKey(workspace, uid);
  await setDoc(doc(db, "workspaces", wsKey, "aiDraftFiles", docRef.id), {
    fileName: uploadName,
    mimeType: uploadMime,
    storagePath,
    uploadedBy: uid,
    workspaceId: wsKey,
    projectId,
    projectDocumentId: docRef.id,
    byteSize: prepared.size,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    fileName: uploadName,
    mimeType: uploadMime,
    storagePath,
    projectId,
  };
}
