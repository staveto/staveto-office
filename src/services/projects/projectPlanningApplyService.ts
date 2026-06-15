import { updateTaskAssignee } from "@/services/projects/taskAssignmentService";
import { updateTaskPlannedDate } from "@/services/projects/taskAssignmentService";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";

export async function applyTaskDateMap(
  projectId: string,
  dates: Map<string, string>
): Promise<void> {
  await Promise.all(
    [...dates.entries()].map(([taskId, date]) =>
      updateTaskPlannedDate(projectId, taskId, date)
    )
  );
}

export async function applyAssigneeToTasks(
  projectId: string,
  taskIds: string[],
  member: ProjectMemberRecord | null
): Promise<void> {
  const name = member
    ? member.name?.trim() || member.email || member.userId
    : null;
  await Promise.all(
    taskIds.map((taskId) =>
      updateTaskAssignee(projectId, taskId, member?.userId ?? null, name)
    )
  );
}
