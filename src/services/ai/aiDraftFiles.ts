import {
  getFirestoreInstance,
  getStorageInstance,
  ref,
  uploadBytes,
  collection,
  addDoc,
  serverTimestamp,
} from "@/lib/firebase";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import type { ActiveWorkspace } from "@/types/workspace";
import { isFirestorePermissionError } from "@/services/ai/mobileAiDraftUploadService";

export type UploadedAiDraftFile = {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
};

/** Firestore `workspaces/{ws}/aiDraftFiles/{id}` — excludes storage-path fallback ids. */
export function isRegisteredAiDraftFile(file: UploadedAiDraftFile): boolean {
  return !file.id.startsWith("path:") && !file.id.includes("/");
}

/** @deprecated Use isRegisteredAiDraftFile */
export function isOfficeRegisteredAiDraftFile(file: UploadedAiDraftFile): boolean {
  return isRegisteredAiDraftFile(file);
}

export function filterOfficeAttachedFileIds(files: UploadedAiDraftFile[]): string[] {
  return files.filter(isRegisteredAiDraftFile).map((f) => f.id);
}

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

export function createAiUploadSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createStorageOnlyDraftFile(
  storagePath: string,
  fileName: string,
  mimeType: string
): UploadedAiDraftFile {
  return {
    id: `path:${storagePath}`,
    fileName,
    mimeType,
    storagePath,
  };
}

export async function uploadAiDraftFile(
  workspace: ActiveWorkspace,
  uid: string,
  sessionId: string,
  file: File
): Promise<UploadedAiDraftFile> {
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

  const wsKey = getWorkspaceStorageKey(workspace, uid);
  const safeName = uploadName.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
  const storagePath = `workspaces/${wsKey}/ai-drafts/${sessionId}/${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, prepared, { contentType: uploadMime });

  try {
    const fileRef = await addDoc(collection(db, "workspaces", wsKey, "aiDraftFiles"), {
      fileName: uploadName,
      mimeType: uploadMime,
      storagePath,
      uploadedBy: uid,
      workspaceId: wsKey,
      uploadSessionId: sessionId,
      optimized: optimized || null,
      byteSize: prepared.size,
      createdAt: serverTimestamp(),
    });

    return { id: fileRef.id, fileName: uploadName, mimeType: uploadMime, storagePath };
  } catch (err) {
    if (isFirestorePermissionError(err)) {
      return createStorageOnlyDraftFile(storagePath, file.name, mime);
    }
    throw err;
  }
}
