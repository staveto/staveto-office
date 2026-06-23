import { doc, getDoc, getCallable } from "@/lib/firebase";
import { getFirestoreInstance } from "@/lib/firebase";
import type { CanonicalCompanyRole } from "@/lib/companyRoles";
import type { BusinessPermissions } from "@/lib/businessRolePermissions";
import { parseCustomPermissions } from "@/lib/businessRolePermissions";

export type OrgMemberDetail = {
  memberDocId: string;
  userId?: string;
  role: CanonicalCompanyRole;
  storedRole: string;
  status: string;
  displayName?: string | null;
  email?: string;
  permissions?: Partial<BusinessPermissions>;
};

const ASSIGNABLE_ROLES: CanonicalCompanyRole[] = [
  "owner",
  "admin",
  "manager",
  "worker",
  "viewer",
];

function normalizeStoredRole(raw: string): CanonicalCompanyRole {
  const r = raw.toLowerCase();
  if (ASSIGNABLE_ROLES.includes(r as CanonicalCompanyRole)) {
    return r as CanonicalCompanyRole;
  }
  if (r === "member") return "viewer";
  return "viewer";
}

export async function getOrgMemberDetail(
  orgId: string,
  memberDocId: string
): Promise<OrgMemberDetail | null> {
  const db = getFirestoreInstance();
  if (!db) return null;

  const ref = doc(db, "organizations", orgId.trim(), "members", memberDocId.trim());
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;
  const storedRole = String(data.role ?? "viewer");
  const userId =
    typeof data.userId === "string" && data.userId.trim()
      ? data.userId.trim()
      : memberDocId;

  return {
    memberDocId: snap.id,
    userId,
    role: normalizeStoredRole(storedRole),
    storedRole,
    status: String(data.status ?? "active"),
    displayName:
      typeof data.displayName === "string"
        ? data.displayName
        : typeof data.name === "string"
          ? data.name
          : null,
    email:
      typeof data.email === "string"
        ? data.email
        : typeof data.emailLower === "string"
          ? data.emailLower
          : undefined,
    permissions: parseCustomPermissions(data.permissions),
  };
}

export type UpdateBusinessMemberRoleInput = {
  orgId: string;
  memberUid: string;
  role: CanonicalCompanyRole;
  permissions?: Partial<BusinessPermissions> | null;
};

export type UpdateBusinessMemberRoleResult = {
  ok: true;
  orgId: string;
  memberUid: string;
  role: CanonicalCompanyRole;
};

function normalizeFunctionsErrorCode(code: unknown): string {
  if (typeof code !== "string") return "";
  return code.replace(/^functions\//, "").trim().toLowerCase();
}

export function mapRoleUpdateError(t: (k: string) => string, error: unknown): string {
  const code = normalizeFunctionsErrorCode((error as { code?: string })?.code);
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (code === "failed-precondition" && msg.includes("last active owner")) {
    return t("members.roleManage.lastOwnerCannotBeChanged");
  }
  if (code === "failed-precondition" && msg.includes("owner permissions")) {
    return t("members.roleManage.ownerPermissionsLocked");
  }
  if (code === "permission-denied") {
    if (msg.includes("only an owner can assign") || msg.includes("owner role")) {
      return t("members.roleManage.onlyOwnerCanAssignOwner");
    }
    return t("members.roleManage.ownerProtected");
  }
  if (error instanceof Error && error.message) return error.message;
  return t("members.roleManage.loadError");
}

export async function updateBusinessMemberRole(
  input: UpdateBusinessMemberRoleInput
): Promise<UpdateBusinessMemberRoleResult> {
  const callable = getCallable<UpdateBusinessMemberRoleInput, { data?: unknown }>(
    "updateBusinessMemberRole",
    { timeoutMs: 25_000 }
  );
  const res = await callable(input);
  const data = ((res as { data?: unknown })?.data ?? res) as Partial<UpdateBusinessMemberRoleResult>;
  if (data.ok !== true || typeof data.orgId !== "string" || typeof data.memberUid !== "string") {
    throw new Error("Invalid updateBusinessMemberRole response.");
  }
  return {
    ok: true,
    orgId: data.orgId,
    memberUid: data.memberUid,
    role: (data.role as CanonicalCompanyRole) ?? input.role,
  };
}
