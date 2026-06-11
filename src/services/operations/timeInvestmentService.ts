import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type {
  TimeInvestmentByEmployee,
  TimeInvestmentByProject,
  TimeInvestmentByTask,
} from "@/lib/operationsMetrics";
import type { ProjectDoc } from "@/lib/projects";

export function buildTimeInvestment(entries: TimeEntryDoc[], projects: ProjectDoc[]): {
  byProject: TimeInvestmentByProject[];
  byTask: TimeInvestmentByTask[];
  byEmployee: TimeInvestmentByEmployee[];
  minutesByTaskId: Map<string, number>;
} {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const byProjectMap = new Map<string, { total: number; byUser: Map<string, { name: string; min: number }> }>();
  const byTaskMap = new Map<string, TimeInvestmentByTask>();
  const byUserMap = new Map<string, { userName: string; total: number; byProject: Map<string, number> }>();
  const minutesByTaskId = new Map<string, number>();

  for (const entry of entries) {
    const min = Math.max(0, entry.durationMinutes || 0);
    if (!entry.projectId) continue;

    const pRow = byProjectMap.get(entry.projectId) ?? { total: 0, byUser: new Map() };
    pRow.total += min;
    const userInProject = pRow.byUser.get(entry.userId) ?? {
      name: entry.userNameSnapshot || entry.userId,
      min: 0,
    };
    userInProject.min += min;
    pRow.byUser.set(entry.userId, userInProject);
    byProjectMap.set(entry.projectId, pRow);

    const uRow = byUserMap.get(entry.userId) ?? {
      userName: entry.userNameSnapshot || entry.userId,
      total: 0,
      byProject: new Map(),
    };
    uRow.total += min;
    uRow.byProject.set(entry.projectId, (uRow.byProject.get(entry.projectId) ?? 0) + min);
    byUserMap.set(entry.userId, uRow);

    if (entry.taskId) {
      minutesByTaskId.set(entry.taskId, (minutesByTaskId.get(entry.taskId) ?? 0) + min);
      const taskRow = byTaskMap.get(entry.taskId) ?? {
        taskId: entry.taskId,
        taskName: entry.taskTitleSnapshot || entry.taskId,
        projectId: entry.projectId,
        projectName: entry.projectNameSnapshot || projectNameById.get(entry.projectId) || entry.projectId,
        totalMinutes: 0,
      };
      taskRow.totalMinutes += min;
      byTaskMap.set(entry.taskId, taskRow);
    }
  }

  const byProject: TimeInvestmentByProject[] = [...byProjectMap.entries()]
    .map(([projectId, row]) => ({
      projectId,
      projectName: projectNameById.get(projectId) ?? projectId,
      totalMinutes: row.total,
      byMember: [...row.byUser.entries()]
        .map(([userId, u]) => ({ userId, userName: u.name, minutes: u.min }))
        .sort((a, b) => b.minutes - a.minutes),
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const byTask: TimeInvestmentByTask[] = [...byTaskMap.values()].sort(
    (a, b) => b.totalMinutes - a.totalMinutes
  );

  const byEmployee: TimeInvestmentByEmployee[] = [...byUserMap.entries()]
    .map(([userId, row]) => {
      const top = [...row.byProject.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        userId,
        userName: row.userName,
        totalMinutes: row.total,
        topProject: top
          ? {
              projectId: top[0],
              projectName: projectNameById.get(top[0]) ?? top[0],
              minutes: top[1],
            }
          : undefined,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  return { byProject, byTask, byEmployee, minutesByTaskId };
}
