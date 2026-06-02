/**
 * Legacy workspace shape for backward-compatible project queries and UI.
 * Canonical types live in `@/types/workspace`.
 */

import type { ActiveWorkspace, WorkspaceType as CanonicalWorkspaceType } from "@/types/workspace";

/** @deprecated Use `ActiveWorkspace` from `@/types/workspace` for new code. */
export type WorkspaceType = "personal" | "team";

/** @deprecated Use `ActiveWorkspace` from `@/types/workspace` for new code. */
export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
}

/** Legacy org member role (sidebar / members page). */
export type MemberRole = "admin" | "member";

/** @deprecated Legacy context member role. */
export interface WorkspaceMember {
  role: MemberRole;
}

/** Map normalized workspace to legacy `Workspace` for `projects.ts` and existing UI. */
export function toLegacyWorkspace(workspace: ActiveWorkspace): Workspace {
  return {
    id: workspace.type === "personal" ? "personal" : (workspace.orgId ?? workspace.id),
    name: workspace.name,
    type: workspace.type === "personal" ? "personal" : "team",
  };
}

/** Map legacy `Workspace` + uid to normalized workspace (best-effort). */
export function fromLegacyWorkspace(
  workspace: Workspace,
  uid: string,
  role: import("@/types/workspace").WorkspaceRole = "owner"
): ActiveWorkspace {
  if (workspace.type === "personal") {
    return {
      id: workspace.id === "personal" ? "personal" : workspace.id,
      type: "personal",
      name: workspace.name,
      role: "owner",
      source: "personal",
      ownerId: uid,
      legacyId: workspace.id,
    };
  }
  return {
    id: workspace.id,
    type: "company",
    name: workspace.name,
    role,
    source: "organization",
    orgId: workspace.id,
    legacyId: workspace.id,
  };
}

export function isCompanyWorkspace(
  type: WorkspaceType | CanonicalWorkspaceType
): boolean {
  return type === "team" || type === "company";
}
