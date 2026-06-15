import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import { listProjectTasks } from "@/lib/projects";
import { assembleWorkDayReport, type WorkDayReport } from "@/lib/workDayReport";
import { canViewWorkDayReport } from "@/lib/operationsPermissions";
import { getCompanyIdForCallable } from "@/lib/workspaceStorage";
import { listOrgMembers } from "@/lib/organizations";
import {
  listTimeEntriesForUser,
  type TimeEntryDoc,
} from "@/services/attendance/timeTrackingReadService";
import {
  listBusinessOrgProjects,
  canAccessBusinessTeamProject,
} from "@/services/projects/businessProjectAssignmentService";
import { listProjectDocuments, type ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import { listProjectProblems, type ProblemDoc } from "@/services/projects/projectProblemsReadService";
import { listDiaryForProjects } from "@/services/projects/projectDiaryReadService";
import { listProjectMaterials } from "@/services/materials/projectMaterialsService";
import type { ProjectMaterialDoc } from "@/services/materials/types";
import { getDownloadURL, getStorageInstance, ref } from "@/lib/firebase";
import type { TeamLiveStatusItem } from "@/lib/operationsMetrics";

async function resolveStorageUrl(storagePath: string): Promise<string | undefined> {
  const storage = getStorageInstance();
  if (!storage || !storagePath.trim()) return undefined;
  try {
    return await getDownloadURL(ref(storage, storagePath));
  } catch {
    return undefined;
  }
}

async function loadTasksForProjects(projectIds: string[]): Promise<TaskDoc[]> {
  const tasks: TaskDoc[] = [];
  await Promise.all(
    projectIds.slice(0, 40).map(async (projectId) => {
      try {
        tasks.push(...(await listProjectTasks(projectId)));
      } catch {
        /* ignore */
      }
    })
  );
  return tasks;
}

function resolveEmployeeRole(
  members: Awaited<ReturnType<typeof listOrgMembers>>,
  userId: string
): string | undefined {
  const m = members.find((x) => x.uid === userId);
  if (!m?.role) return undefined;
  const r = String(m.role).toLowerCase();
  if (r === "member") return "worker";
  return r;
}

export async function fetchWorkDayReport(input: {
  workspace: ActiveWorkspace;
  viewerUid: string;
  role?: WorkspaceRole;
  targetUserId: string;
  dateYmd: string;
  teamStatus?: TeamLiveStatusItem[];
}): Promise<WorkDayReport> {
  const { workspace, viewerUid, role, targetUserId, dateYmd } = input;
  if (!canViewWorkDayReport(viewerUid, targetUserId, role)) {
    throw new Error("permission-denied");
  }

  const orgId = getCompanyIdForCallable(workspace) ?? "";
  const [entries, projectsRaw, members] = await Promise.all([
    listTimeEntriesForUser(targetUserId, dateYmd, dateYmd),
    listBusinessOrgProjects(workspace, viewerUid),
    orgId ? listOrgMembers(orgId) : Promise.resolve([]),
  ]);

  const projects = projectsRaw.filter((p) => canAccessBusinessTeamProject(p, viewerUid, role));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const entryProjectIds = [...new Set(entries.map((e) => e.projectId).filter(Boolean))];
  const relevantProjects: ProjectDoc[] = entryProjectIds
    .map((id) => projectMap.get(id))
    .filter((p): p is ProjectDoc => Boolean(p));

  const member = members.find((m) => m.uid === targetUserId);
  const liveMember = input.teamStatus?.find((m) => m.uid === targetUserId);
  const employeeName =
    member?.displayName?.trim() ||
    entries[0]?.userNameSnapshot?.trim() ||
    member?.email?.trim() ||
    targetUserId;

  const employee = {
    userId: targetUserId,
    name: employeeName,
    email: member?.email ?? undefined,
    role: resolveEmployeeRole(members, targetUserId),
    statusToday: liveMember ? liveMember.status : undefined,
  };

  const projectIds =
    entryProjectIds.length > 0 ? entryProjectIds : relevantProjects.map((p) => p.id);

  const [tasks, documentsByProject, problemsByProject, materialsByProject, diary] =
    await Promise.all([
      loadTasksForProjects(projectIds),
      Promise.all(
        projectIds.map(async (projectId) => {
          const docs = await listProjectDocuments(projectId);
          const projectName = projectMap.get(projectId)?.name ?? projectId;
          return { projectId, projectName, docs };
        })
      ),
      Promise.all(
        projectIds.map(async (projectId) => {
          const problems = await listProjectProblems(projectId);
          const projectName = projectMap.get(projectId)?.name ?? projectId;
          return { projectId, projectName, problems };
        })
      ),
      Promise.all(
        projectIds.map(async (projectId) => {
          const materials = await listProjectMaterials(projectId);
          const projectName = projectMap.get(projectId)?.name ?? projectId;
          return { projectId, projectName, materials };
        })
      ),
      listDiaryForProjects(
        projectIds.map((id) => ({ id, name: projectMap.get(id)?.name ?? id })),
        targetUserId,
        dateYmd
      ),
    ]);

  const userTasks = tasks.filter(
    (t) =>
      t.assigneeId === targetUserId ||
      entries.some((e) => e.taskId === t.id) ||
      projectIds.includes(t.projectId)
  );

  const documents: {
    projectId: string;
    projectName: string;
    doc: ProjectDocumentRecord;
    previewUrl?: string;
  }[] = [];

  for (const group of documentsByProject) {
    for (const doc of group.docs) {
      let previewUrl: string | undefined;
      if (doc.mimeType?.startsWith("image/") && doc.storagePath) {
        previewUrl = await resolveStorageUrl(doc.storagePath);
      }
      documents.push({
        projectId: group.projectId,
        projectName: group.projectName,
        doc,
        previewUrl,
      });
    }
  }

  const problems: { projectId: string; projectName: string; problem: ProblemDoc }[] = [];
  for (const group of problemsByProject) {
    for (const problem of group.problems) {
      if (problem.createdByUid !== targetUserId) continue;
      problems.push({
        projectId: group.projectId,
        projectName: group.projectName,
        problem,
      });
    }
  }

  const materials: { projectId: string; projectName: string; material: ProjectMaterialDoc }[] = [];
  for (const group of materialsByProject) {
    for (const material of group.materials) {
      materials.push({
        projectId: group.projectId,
        projectName: group.projectName,
        material,
      });
    }
  }

  const report = assembleWorkDayReport({
    dateYmd,
    employee,
    entries,
    projects: relevantProjects.length > 0 ? relevantProjects : projects.slice(0, 20),
    tasks: userTasks,
    documents,
    problems,
    materials,
    diary,
  });

  for (const d of diary) {
    if (!d.attachments?.length) continue;
    for (let i = 0; i < d.attachments.length; i++) {
      const path = d.attachments[i];
      const previewUrl = await resolveStorageUrl(path);
      if (!previewUrl) continue;
      report.photos.push({
        id: `diary-${d.id}-${i}`,
        projectId: d.projectId,
        projectName: d.projectName ?? d.projectId,
        fileName: d.workDescription.slice(0, 40) || "diary",
        createdAt: d.createdAt,
        previewUrl,
        source: "diary",
      });
    }
  }

  report.photos.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return report;
}

export function workDayReportHref(userId: string, dateYmd: string): string {
  return `/app/operations/day/${encodeURIComponent(userId)}/${dateYmd}`;
}

export function shiftDateYmd(dateYmd: string, deltaDays: number): string {
  const d = new Date(`${dateYmd}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatWorkDayLabel(dateYmd: string, locale: string): string {
  const d = new Date(`${dateYmd}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return dateYmd;
  return d.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function entriesForUserOnDay(entries: TimeEntryDoc[], userId: string, dateYmd: string): TimeEntryDoc[] {
  return entries.filter((e) => e.userId === userId && (e.date ?? e.startedAt).slice(0, 10) === dateYmd);
}
