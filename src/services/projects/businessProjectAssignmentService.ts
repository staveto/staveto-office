import { arrayRemove, arrayUnion } from "firebase/firestore";
import {
  getFirestoreInstance,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  query,
  where,
  getCallable,
} from "@/lib/firebase";
import { listProjectsForWorkspace, type ProjectDoc } from "@/lib/projects";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import {
  getEffectivePermissions,
  parseCustomPermissions,
  type BusinessRole,
} from "@/lib/businessRolePermissions";

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

/** Firestore rejects undefined field values — keep only present fields. */
function compactSnapshot(row: AssignedMemberSnapshot): AssignedMemberSnapshot {
  const out: AssignedMemberSnapshot = { uid: row.uid };
  if (typeof row.name === "string" && row.name.trim()) out.name = row.name.trim();
  if (typeof row.role === "string" && row.role.trim()) out.role = row.role.trim();
  return out;
}

export function mergeSnapshots(
  current: AssignedMemberSnapshot[],
  nextMember: AssignedMemberSnapshot
): AssignedMemberSnapshot[] {
  const byId = new Map<string, AssignedMemberSnapshot>();
  for (const row of current) {
    if (!row?.uid) continue;
    byId.set(row.uid, compactSnapshot(row));
  }
  byId.set(nextMember.uid, compactSnapshot(nextMember));
  return [...byId.values()];
}

/** Link legacy company projects that were created without orgId (owner or org manager). */
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

  try {
    await updateDoc(projectRef, {
      orgId,
      workspaceType: "team",
      workspaceId: orgId,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-owner actors may be rejected by rules on legacy projects without any
    // org link; assignment below can still succeed via workspaceId fallback.
    if (data.ownerId === input.actorUid) throw err;
  }
}

function normalizeBusinessRole(raw: unknown): BusinessRole {
  const r = String(raw ?? "").toLowerCase();
  if (r === "owner" || r === "admin" || r === "manager" || r === "worker") return r;
  if (r === "member" || r === "client") return "viewer";
  return "viewer";
}

/** Field crew cannot edit project structure (phases/tasks) unless canEditProject is on. */
async function resolveAssigneePermissionLevel(input: {
  orgId?: string;
  uid: string;
  roleHint?: string;
}): Promise<"viewer" | "editor"> {
  const db = getFirestoreInstance();
  let role = input.roleHint?.trim() ? normalizeBusinessRole(input.roleHint) : null;
  let custom: ReturnType<typeof parseCustomPermissions>;

  const orgId = input.orgId?.trim();
  if (db && orgId) {
    try {
      const memSnap = await getDoc(doc(db, "organizations", orgId, "members", input.uid));
      if (memSnap.exists()) {
        const data = memSnap.data() as Record<string, unknown>;
        if (!role) role = normalizeBusinessRole(data.role);
        custom = parseCustomPermissions(data.permissions);
      }
    } catch {
      /* fall through */
    }
  }

  const effectiveRole = role ?? "viewer";
  const perms = getEffectivePermissions(effectiveRole, custom);
  if (
    effectiveRole === "owner" ||
    effectiveRole === "admin" ||
    effectiveRole === "manager" ||
    perms.canEditProject
  ) {
    return "editor";
  }
  return "viewer";
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

  // Idempotent: re-saving an already-assigned member must not re-trigger the
  // mobile invite prompt (pendingAcknowledgment) or overwrite addedAt/addedBy.
  const memberRef = doc(db, "projects", input.projectId, "members", input.uid);
  const existingMember = await getDoc(memberRef);
  const projectOrgId =
    input.orgId?.trim() ||
    (typeof data.orgId === "string" ? data.orgId.trim() : "") ||
    (typeof data.workspaceId === "string" ? data.workspaceId.trim() : "");
  const permissionLevel = await resolveAssigneePermissionLevel({
    orgId: projectOrgId,
    uid: input.uid,
    roleHint: input.role,
  });
  const isFieldAssignee = permissionLevel === "viewer";

  const memberPatch: Record<string, unknown> = {
    userId: input.uid,
    role: "member",
    status: "active",
    permissionLevel,
    sharedItems: {
      tasks: true,
      phases: true,
      expenses: !isFieldAssignee,
      diary: true,
      documents: true,
      timeTracking: true,
    },
    updatedAt: serverTimestamp(),
  };
  if (input.name?.trim()) {
    memberPatch.name = input.name.trim();
  } else if (!existingMember.exists()) {
    memberPatch.name = null;
  }
  if (!existingMember.exists()) {
    memberPatch.pendingAcknowledgment = true;
    memberPatch.addedBy = input.actorUid ?? null;
    memberPatch.addedAt = serverTimestamp();
  }
  await setDoc(memberRef, memberPatch, { merge: true });

  const patch: Record<string, unknown> = {
    assignedMemberIds: arrayUnion(input.uid),
    updatedAt: serverTimestamp(),
  };
  if (input.name?.trim() || input.role?.trim()) {
    patch.assignedMemberSnapshots = nextSnapshots;
  }

  await updateDoc(projectRef, patch);
}

/**
 * Invite an org member to a project. Does NOT grant access until they accept
 * via acceptProjectInvite (no assignedMemberIds write).
 */
export async function inviteMemberToBusinessProject(input: {
  projectId: string;
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  orgId?: string;
  actorUid?: string;
}): Promise<"invited" | "already_active" | "already_invited"> {
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

  const assignedIds = Array.isArray(data.assignedMemberIds)
    ? (data.assignedMemberIds as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  if (assignedIds.includes(input.uid) || data.ownerId === input.uid) {
    return "already_active";
  }

  const memberRef = doc(db, "projects", input.projectId, "members", input.uid);
  const existingMember = await getDoc(memberRef);
  if (existingMember.exists()) {
    const existing = existingMember.data() as Record<string, unknown>;
    const status = typeof existing.status === "string" ? existing.status : "";
    if (status === "active" || status === "pending") {
      return "already_active";
    }
    if (status === "invited") {
      return "already_invited";
    }
  }

  const projectOrgId =
    input.orgId?.trim() ||
    (typeof data.orgId === "string" ? data.orgId.trim() : "") ||
    (typeof data.workspaceId === "string" ? data.workspaceId.trim() : "");
  const permissionLevel = await resolveAssigneePermissionLevel({
    orgId: projectOrgId,
    uid: input.uid,
    roleHint: input.role,
  });
  const isFieldAssignee = permissionLevel === "viewer";
  const email =
    typeof input.email === "string" && input.email.trim()
      ? input.email.trim().toLowerCase()
      : null;

  const memberPatch: Record<string, unknown> = {
    userId: input.uid,
    role: "member",
    status: "invited",
    permissionLevel,
    invitedBy: input.actorUid ?? null,
    invitedAt: serverTimestamp(),
    sharedItems: {
      tasks: true,
      phases: true,
      expenses: !isFieldAssignee,
      diary: true,
      documents: true,
      timeTracking: true,
    },
    sharedPhaseIds: [],
    updatedAt: serverTimestamp(),
  };
  if (input.name?.trim()) memberPatch.name = input.name.trim();
  if (email) {
    memberPatch.email = email;
    memberPatch.emailLower = email;
  }

  await setDoc(memberRef, memberPatch, { merge: true });
  await updateDoc(projectRef, { updatedAt: serverTimestamp() });
  return "invited";
}

export async function unassignMemberFromBusinessProject(input: {
  projectId: string;
  uid: string;
}): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const projectId = input.projectId.trim();
  const uid = input.uid.trim();
  if (!projectId || !uid) return;

  // Preferred: CF also clears users/{uid}/projectRefs, membersByUid, notifications.
  try {
    const remove = getCallable<
      { projectId: string; memberId: string; memberUid: string },
      { ok?: boolean }
    >("removeProjectMember");
    const res = await remove({ projectId, memberId: uid, memberUid: uid });
    if (res.data?.ok === true) {
      // Still strip legacy array fields client-side in case CF only touches member docs.
      try {
        await updateDoc(doc(db, "projects", projectId), {
          assignedMemberIds: arrayRemove(uid),
          assignedUserIds: arrayRemove(uid),
          updatedAt: serverTimestamp(),
        });
      } catch {
        /* project patch optional after CF success */
      }
      return;
    }
  } catch (err) {
    console.warn("[unassign] removeProjectMember failed, falling back to client cleanup:", err);
  }

  const projectRef = doc(db, "projects", projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return;
  const data = snap.data() as Record<string, unknown>;

  const snapshotsRaw = Array.isArray(data.assignedMemberSnapshots)
    ? (data.assignedMemberSnapshots as AssignedMemberSnapshot[])
    : [];
  const nextSnapshots = snapshotsRaw.filter((row) => row.uid !== uid);

  const memberIdsToDelete = new Set<string>([uid]);
  try {
    const byUserId = await getDocs(
      query(collection(db, "projects", projectId, "members"), where("userId", "==", uid))
    );
    for (const d of byUserId.docs) memberIdsToDelete.add(d.id);
  } catch {
    /* query may fail on older rules; uid-keyed delete below still runs */
  }

  await Promise.all(
    [...memberIdsToDelete].map(async (memberId) => {
      try {
        await deleteDoc(doc(db, "projects", projectId, "members", memberId));
      } catch {
        /* member doc may already be missing */
      }
    })
  );

  const patch: Record<string, unknown> = {
    assignedMemberIds: arrayRemove(uid),
    assignedUserIds: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  };
  if (snapshotsRaw.length > 0) {
    patch.assignedMemberSnapshots = nextSnapshots;
  }

  await updateDoc(projectRef, patch);
}
