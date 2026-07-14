/**
 * Drawing occurrences — Firestore CRUD under
 * projects/{projectId}/drawingOccurrences/{occurrenceId}.
 *
 * Covered by the existing project-subcollection catch-all security rule
 * (read/write for project accessors). Writes are sanitized: undefined
 * values are stripped before hitting Firestore.
 */

import {
  getFirestoreInstance,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "@/lib/firebase";
import type {
  DrawingOccurrence,
  DrawingOccurrenceInput,
} from "@/types/drawingTakeoff";

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newOccurrenceId(): string {
  return `occ_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listDrawingOccurrences(
  projectId: string,
  drawingId?: string
): Promise<DrawingOccurrence[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "drawingOccurrences");
  const snap = await getDocs(
    drawingId ? query(col, where("drawingId", "==", drawingId)) : col
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<DrawingOccurrence, "id">), id: d.id }))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

export async function createDrawingOccurrence(
  input: DrawingOccurrenceInput
): Promise<DrawingOccurrence> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const now = new Date().toISOString();
  const id = newOccurrenceId();
  const record: DrawingOccurrence = { ...input, id, createdAt: now, updatedAt: now };
  await setDoc(
    doc(db, "projects", input.projectId, "drawingOccurrences", id),
    stripUndefined({ ...record, id: undefined })
  );
  return record;
}

/** Batch create (e.g. similar-symbol candidates). Returns created records. */
export async function createDrawingOccurrences(
  inputs: DrawingOccurrenceInput[]
): Promise<DrawingOccurrence[]> {
  const created: DrawingOccurrence[] = [];
  for (const input of inputs) {
    created.push(await createDrawingOccurrence(input));
  }
  return created;
}

export async function updateDrawingOccurrence(
  projectId: string,
  occurrenceId: string,
  patch: Partial<Omit<DrawingOccurrence, "id" | "projectId" | "createdAt">>
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await updateDoc(
    doc(db, "projects", projectId, "drawingOccurrences", occurrenceId),
    stripUndefined({ ...patch, updatedAt: new Date().toISOString() }) as Record<
      string,
      unknown
    >
  );
}

export async function deleteDrawingOccurrence(
  projectId: string,
  occurrenceId: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await deleteDoc(doc(db, "projects", projectId, "drawingOccurrences", occurrenceId));
}
