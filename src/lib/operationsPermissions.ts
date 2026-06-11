import type { WorkspaceRole } from "@/types/workspace";

export function canViewOperationsDashboard(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager" || role === "accountant";
}

export function canManageCrewAssignments(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export function isWorkerLikeRole(role: WorkspaceRole | undefined): boolean {
  return role === "worker" || role === "client";
}
