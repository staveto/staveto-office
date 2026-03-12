/**
 * Workspace model for Staveto web app.
 * Used for sidebar nav visibility (Members, Billing only for team + admin).
 */

export type WorkspaceType = "personal" | "team";

export type MemberRole = "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
}

export interface WorkspaceMember {
  role: MemberRole;
}
