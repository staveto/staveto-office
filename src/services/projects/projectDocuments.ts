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
};

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

  const safeName = sanitizeFileName(file.name);
  const storagePath = `projects/${projectId}/documents/${safeName}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mime });

  const docRef = await addDoc(collection(db, "projects", projectId, "documents"), {
    fileName: file.name,
    mimeType: mime,
    storagePath,
    uploadedBy: uid,
    source: "ai_wizard",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const wsKey = getWorkspaceStorageKey(workspace, uid);
  await setDoc(doc(db, "workspaces", wsKey, "aiDraftFiles", docRef.id), {
    fileName: file.name,
    mimeType: mime,
    storagePath,
    uploadedBy: uid,
    workspaceId: wsKey,
    projectId,
    projectDocumentId: docRef.id,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    fileName: file.name,
    mimeType: mime,
    storagePath,
    projectId,
  };
}
