import * as admin from "firebase-admin";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "worker"
  | "client";

const PROJECT_CREATE_ROLES: WorkspaceRole[] = ["owner", "admin", "manager"];

export function canCreateProject(role: WorkspaceRole): boolean {
  return PROJECT_CREATE_ROLES.includes(role);
}

export function mapMemberRole(
  legacyRole: string,
  isOrgOwner: boolean
): WorkspaceRole {
  if (isOrgOwner) return "owner";
  const r = String(legacyRole ?? "").toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  if (r === "manager") return "manager";
  if (r === "accountant") return "accountant";
  if (r === "worker") return "worker";
  if (r === "viewer" || r === "client") return "client";
  if (r === "member") return "manager";
  return "manager";
}

export type WorkspaceAccess = {
  storageKey: string;
  isPersonal: boolean;
  orgId?: string;
  role: WorkspaceRole;
};

export async function assertWorkspaceAccess(
  db: admin.firestore.Firestore,
  uid: string,
  workspaceId: string,
  companyId?: string
): Promise<WorkspaceAccess> {
  const isPersonal = !companyId && (workspaceId === uid || workspaceId === "personal");

  if (isPersonal) {
    if (workspaceId !== uid && workspaceId !== "personal") {
      throw new functionsPermissionError("Invalid personal workspace.");
    }
    return { storageKey: uid, isPersonal: true, role: "owner" };
  }

  const orgId = companyId ?? workspaceId;
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) {
    throw new functionsPermissionError("Organization not found.");
  }
  const org = orgSnap.data() as { ownerUid?: string };
  if (org.ownerUid === uid) {
    return { storageKey: orgId, isPersonal: false, orgId, role: "owner" };
  }

  const memberSnap = await db.doc(`organizations/${orgId}/members/${uid}`).get();
  if (!memberSnap.exists) {
    throw new functionsPermissionError("Not a member of this workspace.");
  }
  const member = memberSnap.data() as { role?: string; status?: string };
  const status = member.status?.toLowerCase?.() ?? member.status;
  if (status === "removed" || status === "invited") {
    throw new functionsPermissionError("Member access is not active.");
  }
  const role = mapMemberRole(String(member.role ?? "member"), false);
  return { storageKey: orgId, isPersonal: false, orgId, role };
}

export function assertProjectCreatePermission(access: WorkspaceAccess): void {
  if (!canCreateProject(access.role)) {
    throw new functionsPermissionError(
      "You do not have permission to create projects in this workspace."
    );
  }
}

export class functionsPermissionError extends Error {
  code = "permission-denied";
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
