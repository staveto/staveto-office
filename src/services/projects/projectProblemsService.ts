/**
 * Write site problems — mirrors mobile `projects/{projectId}/problems`.
 */
import {
  getFirestoreInstance,
  doc,
  updateDoc,
  serverTimestamp,
  getAuthInstance,
} from "@/lib/firebase";
import type { ProblemDoc, ProblemStatus } from "./projectProblemsReadService";

export type UpdateProjectProblemInput = Partial<{
  status: ProblemStatus | string;
  priority: string;
  resolutionNote: string | null;
  assigneeUid: string;
  assigneeName: string | null;
  detail: string | null;
}>;

export async function updateProjectProblem(
  projectId: string,
  problemId: string,
  input: UpdateProjectProblemInput
): Promise<void> {
  const db = getFirestoreInstance();
  const auth = getAuthInstance();
  const uid = auth?.currentUser?.uid;
  if (!db || !uid) throw new Error("Not signed in");

  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (input.status !== undefined) {
    updates.status = input.status;
    updates.audit = {
      lastStatusByUid: uid,
      lastStatusAt: new Date().toISOString(),
    };
  }
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.resolutionNote !== undefined) updates.resolutionNote = input.resolutionNote;
  if (input.assigneeUid !== undefined) updates.assigneeUid = input.assigneeUid;
  if (input.assigneeName !== undefined) updates.assigneeName = input.assigneeName;
  if (input.detail !== undefined) updates.detail = input.detail;

  await updateDoc(doc(db, "projects", projectId, "problems", problemId), updates);
}

export function isOpenProblem(problem: Pick<ProblemDoc, "status">): boolean {
  const s = String(problem.status).toLowerCase();
  return s === "open" || s === "in_progress";
}

export const PROBLEM_STATUS_OPTIONS: ProblemStatus[] = [
  "open",
  "in_progress",
  "fixed",
  "verified",
  "rejected",
];
