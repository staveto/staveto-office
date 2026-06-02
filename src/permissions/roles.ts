/**
 * RBAC foundation (Phase 1). Not enforced globally yet — use for UI gating later.
 */
import type { WorkspaceRole } from "@/types/workspace";

export type PermissionAction =
  | "project:read"
  | "project:create"
  | "project:update"
  | "project:delete"
  | "member:read"
  | "member:invite"
  | "billing:read"
  | "workspace:update";

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<PermissionAction>> = {
  owner: new Set([
    "project:read",
    "project:create",
    "project:update",
    "project:delete",
    "member:read",
    "member:invite",
    "billing:read",
    "workspace:update",
  ]),
  admin: new Set([
    "project:read",
    "project:create",
    "project:update",
    "project:delete",
    "member:read",
    "member:invite",
    "billing:read",
    "workspace:update",
  ]),
  manager: new Set([
    "project:read",
    "project:create",
    "project:update",
    "member:read",
  ]),
  accountant: new Set(["project:read", "billing:read"]),
  worker: new Set(["project:read"]),
  client: new Set(["project:read"]),
};

/** Whether `role` may perform `action`. */
export function can(role: WorkspaceRole, action: PermissionAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

/** Map Firestore organization member role to normalized workspace role. */
export function mapLegacyOrgRoleToWorkspaceRole(
  legacyRole: "admin" | "member" | string,
  options?: { isOrgOwner?: boolean }
): WorkspaceRole {
  if (options?.isOrgOwner) return "owner";
  const r = String(legacyRole ?? "").toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  if (r === "manager") return "manager";
  if (r === "accountant") return "accountant";
  if (r === "worker") return "worker";
  if (r === "viewer" || r === "client") return "client";
  if (legacyRole === "member" || r === "member") return "manager";
  return "manager";
}

/** Personal workspace owner is always `owner`. */
export function personalWorkspaceRole(): WorkspaceRole {
  return "owner";
}

/** Map normalized role to legacy sidebar role (`admin` | `member`). */
export function toLegacyMemberRole(role: WorkspaceRole): "admin" | "member" {
  if (role === "owner" || role === "admin") return "admin";
  return "member";
}
