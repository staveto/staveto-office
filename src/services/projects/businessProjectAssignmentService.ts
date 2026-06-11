import { arrayRemove, arrayUnion } from "firebase/firestore";
import {
  getFirestoreInstance,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "@/lib/firebase";
import { listProjectsForWorkspace, type ProjectDoc } from "@/lib/projects";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";

export type AssignedMemberSnapshot = {
  uid: string;
  name?: string;
  role?: string;
};

export function isBusinessTeamProject(
  project: Pick<ProjectDoc, "orgId" | "workspaceType" | "workspaceId">,
  orgId?: string
): boolean {
  const linkedOrgId = project.orgId?.trim() || project.workspaceId?.trim() || "";
  const teamLike =
    project.workspaceType === "team" ||
    (project.workspaceType as string | undefined) === "business" ||
    !project.workspaceType;
  if (!linkedOrgId) return teamLike;
  if (orgId?.trim() && linkedOrgId !== orgId.trim()) return false;
  return teamLike;
}

export function canAccessBusinessTeamProject(
  project: Pick<ProjectDoc, "ownerId" | "assignedMemberIds">,
  uid: string,
  role?: WorkspaceRole
): boolean {
  if (!uid) return false;
  if (project.ownerId === uid) return true;
  if (canManageCompanyOperations(role)) return true;
  return (project.assignedMemberIds ?? []).includes(uid);
}

export async function listBusinessOrgProjects(
  workspace: ActiveWorkspace,
  uid: string
): Promise<ProjectDoc[]> {
  const projects = await listProjectsForWorkspace(workspace, uid);
  const orgId = workspace.orgId?.trim();
  return projects.filter((p) => {
    const linkedOrgId = p.orgId?.trim() || p.workspaceId?.trim() || "";
    if (p.ownerId === uid) return !orgId || !linkedOrgId || linkedOrgId === orgId;
    if (!isBusinessTeamProject(p, orgId)) return false;
    return !orgId || linkedOrgId === orgId;
  });
}

export async function listBusinessProjectsAssignedToMember(
  workspace: ActiveWorkspace,
  uid: string,
  memberUid: string
): Promise<ProjectDoc[]> {
  const projects = await listBusinessOrgProjects(workspace, uid);
  return projects.filter(
    (p) => p.ownerId === memberUid || (p.assignedMemberIds ?? []).includes(memberUid)
  );
}

function mergeSnapshots(
  current: AssignedMemberSnapshot[],
  nextMember: AssignedMemberSnapshot
): AssignedMemberSnapshot[] {
  const byId = new Map<string, AssignedMemberSnapshot>();
  for (const row of current) {
    if (!row?.uid) continue;
    byId.set(row.uid, row);
  }
  byId.set(nextMember.uid, nextMember);
  return [...byId.values()];
}

/** Link legacy company projects that were created without orgId (project owner only). */
export async function ensureProjectOrgLink(input: {
  projectId: string;
  orgId: string;
  actorUid: string;
}): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const orgId = input.orgId.trim();
  if (!orgId) return;

  const projectRef = doc(db, "projects", input.projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) throw new Error("Project not found");

  const data = snap.data() as Record<string, unknown>;
  const existingOrgId = typeof data.orgId === "string" ? data.orgId.trim() : "";
  if (existingOrgId) return;

  if (data.ownerId !== input.actorUid) return;

  await updateDoc(projectRef, {
    orgId,
    workspaceType: "team",
    workspaceId: orgId,
    updatedAt: serverTimestamp(),
  });
}

export async function assignMemberToBusinessProject(input: {
  projectId: string;
  uid: string;
  name?: string;
  role?: string;
  orgId?: string;
  actorUid?: string;
}): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  if (input.orgId?.trim() && input.actorUid) {
    await ensureProjectOrgLink({
      projectId: input.projectId,
      orgId: input.orgId,
      actorUid: input.actorUid,
    });
  }

  const projectRef = doc(db, "projects", input.projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) throw new Error("Project not found");
  const data = snap.data() as Record<string, unknown>;

  const snapshotsRaw = Array.isArray(data.assignedMemberSnapshots)
    ? (data.assignedMemberSnapshots as AssignedMemberSnapshot[])
    : [];
  const nextSnapshots = mergeSnapshots(snapshotsRaw, {
    uid: input.uid,
    name: input.name,
    role: input.role,
  });

  await setDoc(
    doc(db, "projects", input.projectId, "members", input.uid),
    {
      userId: input.uid,
      name: input.name ?? null,
      role: "member",
      status: "active",
      pendingAcknowledgment: true,
      permissionLevel: "editor",
      addedBy: input.actorUid ?? null,
      addedAt: serverTimestamp(),
      sharedItems: {
        tasks: true,
        phases: true,
        expenses: true,
        diary: true,
        documents: true,
        timeTracking: true,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const patch: Record<string, unknown> = {
    assignedMemberIds: arrayUnion(input.uid),
    updatedAt: serverTimestamp(),
  };
  if (input.name?.trim() || input.role?.trim()) {
    patch.assignedMemberSnapshots = nextSnapshots;
  }

  await updateDoc(projectRef, patch);
}

export async function unassignMemberFromBusinessProject(input: {
  projectId: string;
  uid: string;
}): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const projectRef = doc(db, "projects", input.projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;

  const snapshotsRaw = Array.isArray(data.assignedMemberSnapshots)
    ? (data.assignedMemberSnapshots as AssignedMemberSnapshot[])
    : [];
  const nextSnapshots = snapshotsRaw.filter((row) => row.uid !== input.uid);

  try {
    await deleteDoc(doc(db, "projects", input.projectId, "members", input.uid));
  } catch {
    /* member doc may already be missing */
  }

  const patch: Record<string, unknown> = {
    assignedMemberIds: arrayRemove(input.uid),
    updatedAt: serverTimestamp(),
  };
  if (snapshotsRaw.length > 0) {
    patch.assignedMemberSnapshots = nextSnapshots;
  }

  await updateDoc(projectRef, patch);
}
