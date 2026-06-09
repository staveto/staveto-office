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

export type UploadedAiDraftFile = {
  id: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
};

/** Firestore `workspaces/{ws}/aiDraftFiles/{id}` — not a raw Storage path used as id. */
export function isRegisteredAiDraftFile(file: UploadedAiDraftFile): boolean {
  return !file.id.includes("/");
}

/** @deprecated Use isRegisteredAiDraftFile */
export function isOfficeRegisteredAiDraftFile(file: UploadedAiDraftFile): boolean {
  return isRegisteredAiDraftFile(file);
}

export function filterOfficeAttachedFileIds(files: UploadedAiDraftFile[]): string[] {
  return files.filter(isRegisteredAiDraftFile).map((f) => f.id);
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
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

  const wsKey = getWorkspaceStorageKey(workspace, uid);
  const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
  const storagePath = `workspaces/${wsKey}/ai-drafts/${sessionId}/${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mime });

  const fileRef = await addDoc(collection(db, "workspaces", wsKey, "aiDraftFiles"), {
    fileName: file.name,
    mimeType: mime,
    storagePath,
    uploadedBy: uid,
    workspaceId: wsKey,
    uploadSessionId: sessionId,
    createdAt: serverTimestamp(),
  });

  return { id: fileRef.id, fileName: file.name, mimeType: mime, storagePath };
}
