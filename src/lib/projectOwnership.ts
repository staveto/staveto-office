/**
 * Mobile-aligned project ownership (read-only helpers).
 * Company job: projects.orgId
 * Personal job: projects.ownerId (no orgId)
 */
import type { ProjectDoc } from "@/lib/projects";
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceType } from "@/types/workspace";

export type ProjectOwnershipScope = "company" | "personal";

export type ProjectOwnershipPick = Pick<
  ProjectDoc,
  "orgId" | "ownerId" | "workspaceType" | "assignedMemberIds"
>;

/** Company-owned when orgId is set (mobile BusinessContext / activeBusinessOrgId). */
export function getProjectOwnershipScope(
  project: Pick<ProjectDoc, "orgId" | "workspaceType">
): ProjectOwnershipScope {
  if (project.orgId?.trim()) return "company";
  if (project.workspaceType === "team") return "company";
  return "personal";
}

export function isCompanyOwnedProject(project: Pick<ProjectDoc, "orgId">): boolean {
  return Boolean(project.orgId?.trim());
}

export function getAssignedMemberIds(
  project: Pick<ProjectDoc, "assignedMemberIds">
): string[] {
  return project.assignedMemberIds ?? [];
}

export function getAssignedMemberCount(project: Pick<ProjectDoc, "assignedMemberIds">): number {
  return getAssignedMemberIds(project).length;
}

/** Whether project belongs to the currently active workspace list scope. */
export function projectMatchesActiveWorkspace(
  project: Pick<ProjectDoc, "orgId" | "ownerId">,
  workspace: ActiveWorkspace,
  uid: string
): boolean {
  if (isCompanyWorkspaceType(workspace.type)) {
    const orgId = workspace.orgId ?? workspace.id;
    return project.orgId === orgId;
  }
  return getProjectOwnershipScope(project) === "personal" && project.ownerId === uid;
}

export function getOwnershipBadgeLabelKey(scope: ProjectOwnershipScope): string {
  return scope === "company" ? "projects.ownership.badgeCompany" : "projects.ownership.badgePersonal";
}
