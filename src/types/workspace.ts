/**
 * Canonical workspace types for Staveto Manager (Phase 1 bridge).
 * Legacy UI/project code may still use `Workspace` from `@/lib/workspace-types`.
 */

export type WorkspaceType = "personal" | "company";

export type WorkspaceSource = "personal" | "organization";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "worker"
  | "client";

/** Normalized active workspace (bridge over organizations + personal). */
export interface ActiveWorkspace {
  id: string;
  type: WorkspaceType;
  name: string;
  role: WorkspaceRole;
  source: WorkspaceSource;
  /** Authenticated user id for personal workspace owner. */
  ownerId?: string;
  /** Organization id when `type === "company"`. */
  orgId?: string;
  /** Stable id used before normalization (e.g. `"personal"`). */
  legacyId?: string;
}

export interface WorkspaceMember {
  uid: string;
  role: WorkspaceRole;
  /** Legacy organization member role when sourced from `organizations/.../members`. */
  legacyOrgRole?: "admin" | "member";
  displayName?: string | null;
  email?: string;
}

export type WorkspaceUser = {
  id: string;
  email?: string;
  name?: string;
};

export function isCompanyWorkspaceType(
  type: WorkspaceType | "team" | undefined
): boolean {
  return type === "company" || type === "team";
}
