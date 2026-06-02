/**
 * Create a new draft zákazka by copying selected parts from an existing project.
 */
import {
  getFirestoreInstance,
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "@/lib/firebase";
import type { Workspace } from "@/lib/workspace-types";
import type { ActiveWorkspace } from "@/types/workspace";
import { getProject, listProjectTasks, listProjectQuoteDraftItems } from "@/lib/projects";
import { createDraftJob, type CreateDraftJobInput } from "./projectService";

export type CopyProjectConceptOptions = {
  sourceProjectId: string;
  copyTasks: boolean;
  copyQuoteItems: boolean;
  copyNotes: boolean;
  /** Merges text fields from source (customerRequest, internalNote). */
  copyDocuments: boolean;
};

export async function copyProjectConcept(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  input: CreateDraftJobInput,
  options: CopyProjectConceptOptions
): Promise<string> {
  const source = await getProject(options.sourceProjectId);
  if (!source) throw new Error("Source project not found");

  let customerRequest = input.customerRequest?.trim();
  let internalNote = input.internalNote?.trim();

  if (options.copyNotes || options.copyDocuments) {
    if (!customerRequest && source.customerRequest?.trim()) {
      customerRequest = source.customerRequest.trim();
    }
    const noteParts: string[] = [];
    if (internalNote) noteParts.push(internalNote);
    if (source.internalNote?.trim()) noteParts.push(source.internalNote.trim());
    if (noteParts.length) internalNote = noteParts.join("\n\n");
  }

  const newId = await createDraftJob(workspace, uid, {
    ...input,
    customerRequest: customerRequest || undefined,
    internalNote: internalNote || undefined,
  });

  const db = getFirestoreInstance();
  if (!db) return newId;

  if (options.copyTasks) {
    const tasks = await listProjectTasks(options.sourceProjectId);
    const tasksRef = collection(db, "projects", newId, "tasks");
    for (const task of tasks) {
      await addDoc(tasksRef, {
        title: task.title,
        status: "OPEN",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: task.order ?? 0,
      });
    }
  }

  if (options.copyQuoteItems) {
    const items = await listProjectQuoteDraftItems(options.sourceProjectId);
    const itemsRef = collection(db, "projects", newId, "quoteItems");
    for (const item of items) {
      await addDoc(itemsRef, {
        category: item.category,
        name: item.name,
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        note: item.note ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    if (items.length > 0) {
      await updateDoc(doc(db, "projects", newId), {
        updatedAt: serverTimestamp(),
        quoteStatus: "draft",
        lifecycleStatus: "quote_drafted",
      });
    }
  }

  return newId;
}
