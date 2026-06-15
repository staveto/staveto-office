/**
 * Mobile-aligned AI draft document upload.
 * Storage path: users/{uid}/aiProjectDrafts/{sessionId}/documents/{fileName}
 * Also registers metadata in workspaces/{ws}/aiDraftFiles for office AI reading.
 */

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
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";

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

export function isStorageUploadPermissionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  const message = String((err as { message?: string })?.message ?? "").toLowerCase();
  if (code.startsWith("firestore/")) return false;
  return (
    code === "storage/unauthorized" ||
    code === "storage/unauthenticated" ||
    (code === "storage/unknown" && message.includes("permission")) ||
    message.includes("storage/unauthorized")
  );
}

export function isFirestorePermissionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  const message = String((err as { message?: string })?.message ?? "").toLowerCase();
  return (
    code === "permission-denied" ||
    code === "firestore/permission-denied" ||
    message.includes("missing or insufficient permissions")
  );
}

export async function uploadMobileAiDraftFile(
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

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || `doc_${Date.now()}.pdf`;
  const storagePath = `users/${uid}/aiProjectDrafts/${sessionId}/documents/${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mime });

  const wsKey = getWorkspaceStorageKey(workspace, uid);
  try {
    const fileRef = await addDoc(collection(db, "workspaces", wsKey, "aiDraftFiles"), {
      fileName: file.name,
      mimeType: mime,
      storagePath,
      uploadedBy: uid,
      workspaceId: wsKey,
      uploadSessionId: sessionId,
      source: "mobile_ai_draft",
      createdAt: serverTimestamp(),
    });

    return {
      id: fileRef.id,
      fileName: file.name,
      mimeType: mime,
      storagePath,
    };
  } catch (err) {
    if (isFirestorePermissionError(err)) {
      return {
        id: `path:${storagePath}`,
        fileName: file.name,
        mimeType: mime,
        storagePath,
      };
    }
    throw err;
  }
}
