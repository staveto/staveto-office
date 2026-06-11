import { getFirestoreInstance, doc, updateDoc, serverTimestamp } from "@/lib/firebase";

export async function updateTaskAssignee(
  projectId: string,
  taskId: string,
  assigneeId: string | null,
  assigneeName?: string | null
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "projects", projectId, "tasks", taskId);
  await updateDoc(ref, {
    assigneeId: assigneeId ?? null,
    assigneeName: assigneeName ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function clearTaskAssignee(projectId: string, taskId: string): Promise<void> {
  await updateTaskAssignee(projectId, taskId, null, null);
}

/** Planned date (YYYY-MM-DD). Also sets dueDate for company planning calendar parity. */
export async function updateTaskPlannedDate(
  projectId: string,
  taskId: string,
  date: string | null
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const trimmed = date?.trim().slice(0, 10) ?? "";
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);

  const ref = doc(db, "projects", projectId, "tasks", taskId);
  await updateDoc(ref, {
    dueDate: valid ? trimmed : null,
    plannedStart: valid ? trimmed : null,
    updatedAt: serverTimestamp(),
  });
}
