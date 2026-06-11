import { getFirestoreInstance, doc, updateDoc, serverTimestamp } from "@/lib/firebase";
import type { TaskToolSnapshot } from "./taskPlanningTypes";

function normalizeTools(tools: TaskToolSnapshot[]): TaskToolSnapshot[] {
  return tools
    .filter((t) => t.id && t.name?.trim())
    .map((t) => ({
      id: t.id,
      name: t.name.trim(),
      type: t.type?.trim() || null,
      qrCode: t.qrCode?.trim() || null,
    }));
}

export async function updateTaskTools(
  projectId: string,
  taskId: string,
  tools: TaskToolSnapshot[]
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const normalized = normalizeTools(tools);
  const ref = doc(db, "projects", projectId, "tasks", taskId);
  await updateDoc(ref, {
    assignedToolIds: normalized.map((t) => t.id),
    assignedTools: normalized,
    updatedAt: serverTimestamp(),
  });
}

export async function clearTaskTools(projectId: string, taskId: string): Promise<void> {
  await updateTaskTools(projectId, taskId, []);
}
