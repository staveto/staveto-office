/**
 * Project archive / delete / basics — mobile parity (projects.ts).
 */
import {
  getFirestoreInstance,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "@/lib/firebase";
import type { ProjectDoc } from "@/lib/projects";
import { getProject, isFirebasePermissionDenied } from "@/lib/projects";
import {
  normalizeLifecycleStatus,
  normalizeProjectPhase,
  type ProjectLifecycleStatus,
} from "@/lib/projectLifecycle";
import type { WorkspaceRole } from "@/types/workspace";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import { updateDraftJobStatus } from "./projectService";

export type UpdateProjectBasicsInput = {
  name: string;
  addressText?: string | null;
  city?: string | null;
  countryCode?: string | null;
};

export function canDeleteProject(
  project: Pick<ProjectDoc, "ownerId" | "orgId">,
  userId: string,
  role?: WorkspaceRole
): boolean {
  if (project.ownerId === userId) return true;
  if (project.orgId && canManageCompanyOperations(role)) return true;
  return false;
}

/** Owner or org manager+ — matches mobile server rules for delete/update. */
export function canManageProjectLifecycle(
  project: Pick<ProjectDoc, "ownerId" | "orgId">,
  userId: string,
  role?: WorkspaceRole
): boolean {
  return canDeleteProject(project, userId, role);
}

/** Archive/unarchive — owner or org manager+ (matches Firestore update/delete rules). */
export function canArchiveProject(
  project: Pick<ProjectDoc, "ownerId" | "orgId">,
  userId: string,
  role?: WorkspaceRole
): boolean {
  return canManageProjectLifecycle(project, userId, role);
}

function permissionError(e: unknown): never {
  if (isFirebasePermissionDenied(e)) {
    throw new Error("PERMISSION_DENIED");
  }
  throw e instanceof Error ? e : new Error("Unknown error");
}

export async function archiveProject(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const update: Record<string, unknown> = {
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (normalizeProjectPhase(project) === "delivery") {
    const status = normalizeLifecycleStatus(project);
    if (status !== "archived" && status !== "completed" && status !== "rejected") {
      update.lifecycleStatus = "archived" satisfies ProjectLifecycleStatus;
    }
  }

  try {
    await updateDoc(doc(db, "projects", projectId), update);
  } catch (e) {
    permissionError(e);
  }
}

export async function unarchiveProject(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const update: Record<string, unknown> = {
    archivedAt: null,
    updatedAt: serverTimestamp(),
  };

  if (normalizeLifecycleStatus(project) === "archived") {
    update.lifecycleStatus =
      normalizeProjectPhase(project) === "sales"
        ? ("new_request" satisfies ProjectLifecycleStatus)
        : ("in_progress" satisfies ProjectLifecycleStatus);
  }

  try {
    await updateDoc(doc(db, "projects", projectId), update);
  } catch (e) {
    permissionError(e);
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  try {
    await deleteDoc(doc(db, "projects", projectId));
  } catch (e) {
    permissionError(e);
  }
}

export async function updateProjectBasics(
  projectId: string,
  input: UpdateProjectBasicsInput
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const name = input.name?.trim();
  if (!name) throw new Error("Project name is required");

  const update: Record<string, unknown> = {
    name,
    updatedAt: serverTimestamp(),
  };

  if (input.addressText !== undefined) {
    update.addressText = input.addressText?.trim() || null;
  }
  if (input.city !== undefined) {
    update.city = input.city?.trim() || null;
  }
  if (input.countryCode !== undefined) {
    update.countryCode = input.countryCode?.trim() || null;
  }

  try {
    await updateDoc(doc(db, "projects", projectId), update);
  } catch (e) {
    permissionError(e);
  }
}

export async function markProjectCompleted(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  try {
    await updateDoc(doc(db, "projects", projectId), {
      lifecycleStatus: "completed" satisfies ProjectLifecycleStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    permissionError(e);
  }
}

export async function markProjectPaused(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  try {
    await updateDoc(doc(db, "projects", projectId), {
      lifecycleStatus: "paused" satisfies ProjectLifecycleStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    permissionError(e);
  }
}

export async function rejectProjectConcept(projectId: string): Promise<ProjectDoc> {
  return updateDraftJobStatus(projectId, "rejected", { salesStatus: "rejected" });
}
