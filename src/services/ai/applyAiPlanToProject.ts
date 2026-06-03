/**
 * Apply reviewed AI plan to an existing draft project (sales phase).
 */
import type { AiProjectPlan } from "@/lib/aiProjectSchema";
import {
  getFirestoreInstance,
  doc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "@/lib/firebase";

export async function applyAiPlanToDraftProject(
  projectId: string,
  plan: AiProjectPlan,
  options?: {
    originalBrief?: string;
    addressText?: string;
    attachedFileIds?: string[];
  }
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  await updateDoc(doc(db, "projects", projectId), {
    name: plan.projectTitle.trim(),
    ...(options?.originalBrief ? { customerRequest: options.originalBrief } : {}),
    ...(options?.addressText ? { addressText: options.addressText } : {}),
    ...(plan.summary ? { aiSummary: plan.summary } : {}),
    source: "ai",
    creationMethod: "ai",
    createdByAI: true,
    confirmedByUser: true,
    ...(options?.attachedFileIds?.length
      ? { attachedFileIds: options.attachedFileIds }
      : {}),
    updatedAt: serverTimestamp(),
  });

  let order = 0;
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      await addDoc(collection(db, "projects", projectId, "tasks"), {
        title: task.title.trim(),
        description: task.description?.trim() || null,
        phase: phase.name.trim(),
        priority: task.priority ?? "medium",
        status: "OPEN",
        order: order++,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const mat of plan.materialSuggestions ?? []) {
    await addDoc(collection(db, "projects", projectId, "materials"), {
      name: mat.name.trim(),
      note: mat.description?.trim() || null,
      quantity: mat.suggestedQuantity ?? null,
      unit: mat.unit?.trim() || null,
      createdAt: serverTimestamp(),
    });
  }
}
