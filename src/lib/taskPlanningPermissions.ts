import type { ProjectDoc, TaskDoc } from "./projects";
import type { WorkspaceRole } from "@/types/workspace";
import { canManageCompanyOperations } from "./workspaceProduct";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";

export function canManageTaskPlanning(
  project: ProjectDoc,
  userId: string,
  role?: WorkspaceRole,
  memberRecord?: ProjectMemberRecord | null
): boolean {
  if (project.ownerId === userId) return true;
  if (canManageCompanyOperations(role)) return true;
  if (
    memberRecord &&
    memberRecord.userId === userId &&
    memberRecord.permissionLevel !== "viewer" &&
    memberRecord.sharedItems?.tasks !== false
  ) {
    return true;
  }
  return false;
}

export function canWorkerToggleTaskStatus(
  task: TaskDoc,
  userId: string,
  canManage: boolean
): boolean {
  if (canManage) return true;
  const assignee = task.assigneeId?.trim();
  return !assignee || assignee === userId;
}

export function filterTasksForWorkerView(tasks: TaskDoc[], userId: string): TaskDoc[] {
  return tasks.filter((task) => {
    const assignee = task.assigneeId?.trim();
    return !assignee || assignee === userId;
  });
}
