import { listProjectTasks } from "@/lib/projects";

export type ProjectTaskProgress = {
  done: number;
  total: number;
  percent: number;
};

export function computeTaskProgressFromTasks(
  tasks: { status: string; isActive?: boolean }[]
): ProjectTaskProgress {
  const active = tasks.filter((t) => t.isActive !== false);
  const total = active.length;
  const done = active.filter((t) => t.status === "DONE").length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

export async function loadTaskProgressForProject(
  projectId: string
): Promise<ProjectTaskProgress> {
  const tasks = await listProjectTasks(projectId);
  return computeTaskProgressFromTasks(tasks);
}

/** Batch load task progress for list filters (limited concurrency). */
export async function loadTaskProgressBatch(
  projectIds: string[]
): Promise<Map<string, ProjectTaskProgress>> {
  const map = new Map<string, ProjectTaskProgress>();
  const unique = [...new Set(projectIds)].slice(0, 50);

  await Promise.all(
    unique.map(async (id) => {
      try {
        const progress = await loadTaskProgressForProject(id);
        map.set(id, progress);
      } catch {
        map.set(id, { done: 0, total: 0, percent: 0 });
      }
    })
  );

  return map;
}
