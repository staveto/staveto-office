import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "@/lib/firebase";
import { getFirestoreInstance } from "@/lib/firebase";
import {
  listProjectTasks,
  toProjectDoc,
  type ProjectDoc,
  type TaskDoc,
} from "@/lib/projects";
import { isProjectAssignedToUser } from "@/lib/projectOwnership";
import { isActiveJob } from "@/lib/projectLifecycle";
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceType } from "@/types/workspace";

export type WorkerTaskItem = TaskDoc & {
  projectName: string;
};

export type WorkerDashboardData = {
  assignedProjects: ProjectDoc[];
  activeAssignedProjects: ProjectDoc[];
  todayProjects: ProjectDoc[];
  openTasks: WorkerTaskItem[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatProjectAddress(project: ProjectDoc): string {
  return [project.addressText, project.city].filter(Boolean).join(", ");
}

export function buildMapsUrl(project: ProjectDoc): string | null {
  const address = formatProjectAddress(project);
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export async function listAssignedProjectsForWorker(
  workspace: ActiveWorkspace,
  uid: string
): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db || !uid) return [];

  const orgId =
    workspace && isCompanyWorkspaceType(workspace.type)
      ? (workspace.orgId ?? workspace.id)
      : null;

  const byId = new Map<string, ProjectDoc>();

  try {
    const assignedQuery = query(
      collection(db, "projects"),
      where("assignedMemberIds", "array-contains", uid),
      limit(50)
    );
    const snap = await getDocs(assignedQuery);
    for (const docSnap of snap.docs) {
      const project = toProjectDoc(docSnap.id, (docSnap.data() ?? {}) as Record<string, unknown>);
      if (project.archivedAt) continue;
      if (orgId && project.orgId !== orgId) continue;
      if (!isProjectAssignedToUser(project, uid)) continue;
      byId.set(project.id, project);
    }
  } catch {
    /* index or rules — fall back below */
  }

  if (orgId && byId.size === 0) {
    try {
      const orgQuery = query(
        collection(db, "projects"),
        where("orgId", "==", orgId),
        limit(100)
      );
      const snap = await getDocs(orgQuery);
      for (const docSnap of snap.docs) {
        const project = toProjectDoc(docSnap.id, (docSnap.data() ?? {}) as Record<string, unknown>);
        if (project.archivedAt) continue;
        if (!isProjectAssignedToUser(project, uid)) continue;
        byId.set(project.id, project);
      }
    } catch {
      return [];
    }
  }

  return [...byId.values()].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
}

async function loadOpenTasksForProjects(
  projects: ProjectDoc[],
  uid: string
): Promise<WorkerTaskItem[]> {
  const today = todayIso();
  const items: WorkerTaskItem[] = [];

  await Promise.all(
    projects.slice(0, 12).map(async (project) => {
      try {
        const tasks = await listProjectTasks(project.id);
        for (const task of tasks) {
          const status = (task.status ?? "").toUpperCase();
          if (status === "DONE" || status === "COMPLETED" || status === "CANCELLED") continue;
          const assignee = task.assigneeId?.trim();
          if (assignee && assignee !== uid) continue;
          items.push({ ...task, projectName: project.name });
        }
      } catch {
        /* ignore per-project task errors */
      }
    })
  );

  return items.sort((a, b) => {
    const aDue = a.dueDate?.slice(0, 10) ?? "9999-99-99";
    const bDue = b.dueDate?.slice(0, 10) ?? "9999-99-99";
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return a.title.localeCompare(b.title);
  });
}

export async function fetchWorkerDashboardData(
  workspace: ActiveWorkspace,
  uid: string
): Promise<WorkerDashboardData> {
  const assignedProjects = await listAssignedProjectsForWorker(workspace, uid);
  const activeAssignedProjects = assignedProjects.filter((p) => isActiveJob(p));
  const today = todayIso();

  const openTasks = await loadOpenTasksForProjects(activeAssignedProjects, uid);
  const tasksDueToday = openTasks.filter((t) => t.dueDate?.slice(0, 10) === today);
  const projectIdsFromTasks = new Set(tasksDueToday.map((t) => t.projectId));

  const todayProjects = activeAssignedProjects.filter(
    (p) => projectIdsFromTasks.has(p.id)
  );
  const todayProjectIds = new Set(todayProjects.map((p) => p.id));
  for (const task of tasksDueToday) {
    if (todayProjectIds.has(task.projectId)) continue;
    const project = assignedProjects.find((p) => p.id === task.projectId);
    if (project) {
      todayProjects.push(project);
      todayProjectIds.add(project.id);
    }
  }

  return {
    assignedProjects,
    activeAssignedProjects,
    todayProjects,
    openTasks,
  };
}
