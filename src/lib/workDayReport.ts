import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { GpsDisplayStatus } from "@/lib/operationsGps";
import { entryGpsEndVisible, entryGpsStartVisible } from "@/lib/operationsGps";
import { formatTimeShort } from "@/lib/operationsMetrics";
import {
  entryCalendarDayYmd,
  type TimeEntryDoc,
} from "@/services/attendance/timeTrackingReadService";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import type { ProjectMaterialDoc } from "@/services/materials/types";
import type { ProblemDoc } from "@/services/projects/projectProblemsReadService";
import type { DiaryEntryRecord } from "@/services/projects/projectDiaryReadService";

export type WorkDayReportStatus = "draft" | "not_approved";

export type WorkDayTimelineKind =
  | "start"
  | "stop"
  | "task"
  | "entry"
  | "photo"
  | "problem"
  | "note";

export type WorkDayTimelineItem = {
  id: string;
  time: string;
  timeSort: number;
  kind: WorkDayTimelineKind;
  title: string;
  subtitle?: string;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  durationMinutes?: number;
  badge?: string;
};

export type WorkDayGpsPoint = {
  lat: number;
  lng: number;
  accuracyM?: number;
  label: "start" | "stop" | "point";
  time?: string;
  entryId?: string;
};

export type WorkDayTaskRow = {
  taskId: string;
  projectId: string;
  projectName: string;
  title: string;
  phaseName?: string;
  status: string;
  durationMinutes: number;
  completedOnDay: boolean;
  assigneeName?: string;
};

export type WorkDayProblemRow = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  priority: string;
  status: string;
  reportedAt?: string;
  reporterName?: string;
  description?: string;
  photoUrl?: string;
};

export type WorkDayPhotoRow = {
  id: string;
  projectId: string;
  projectName: string;
  fileName: string;
  createdAt?: string;
  previewUrl?: string;
  taskTitle?: string;
  source: "document" | "diary" | "problem";
};

export type WorkDayMaterialRow = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  quantity: number;
  unit: string;
  taskId?: string;
};

export type WorkDayEmployeeInfo = {
  userId: string;
  name: string;
  email?: string;
  role?: string;
  statusToday?: string;
};

export type WorkDayProjectSummary = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  customerName?: string;
};

export type WorkDayReport = {
  dateYmd: string;
  employee: WorkDayEmployeeInfo;
  totalMinutes: number;
  expectedMinutes: number | null;
  primaryProject: WorkDayProjectSummary | null;
  projectsWorked: WorkDayProjectSummary[];
  locationLabel?: string;
  gpsStatus: GpsDisplayStatus;
  reportStatus: WorkDayReportStatus;
  approvedBy?: string;
  approvedAt?: string;
  timeline: WorkDayTimelineItem[];
  gpsPoints: WorkDayGpsPoint[];
  distanceKm: number | null;
  travelMinutes: number | null;
  stopCount: number;
  tasks: WorkDayTaskRow[];
  problems: WorkDayProblemRow[];
  photos: WorkDayPhotoRow[];
  materials: WorkDayMaterialRow[];
  employeeNotes: string[];
  summary: {
    allTasksCompleted: boolean | null;
    timeInNorm: boolean | null;
    hasPhotos: boolean;
    hasProblems: boolean;
    hasMaterials: boolean;
    hasGps: boolean;
  };
  timeEntries: TimeEntryDoc[];
};

function ymdFromIso(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function resolveGpsStatus(points: WorkDayGpsPoint[]): GpsDisplayStatus {
  if (points.length === 0) return "none";
  const low = points.some((p) => typeof p.accuracyM === "number" && p.accuracyM > 50);
  return low ? "low_accuracy" : "available";
}

export function buildWorkDayGpsPoints(entries: TimeEntryDoc[]): WorkDayGpsPoint[] {
  const points: WorkDayGpsPoint[] = [];
  for (const e of entries) {
    const start = entryGpsStartVisible(e);
    if (start) {
      points.push({
        lat: start.lat,
        lng: start.lng,
        accuracyM: start.accuracyM,
        label: points.length === 0 ? "start" : "point",
        time: e.startedAt ? formatTimeShort(e.startedAt) : undefined,
        entryId: e.id,
      });
    }
    const end = entryGpsEndVisible(e);
    if (end) {
      points.push({
        lat: end.lat,
        lng: end.lng,
        accuracyM: end.accuracyM,
        label: "stop",
        time: e.endedAt ? formatTimeShort(e.endedAt) : undefined,
        entryId: e.id,
      });
    }
  }
  if (points.length > 0 && points[0].label !== "start") {
    points[0] = { ...points[0], label: "start" };
  }
  const last = points[points.length - 1];
  if (last && last.label === "point") {
    points[points.length - 1] = { ...last, label: "stop" };
  }
  return points;
}

export function buildWorkDayTasks(
  entries: TimeEntryDoc[],
  tasks: TaskDoc[],
  projects: Map<string, ProjectDoc>,
  dateYmd: string
): WorkDayTaskRow[] {
  const minutesByTask = new Map<string, number>();
  const projectByTask = new Map<string, { projectId: string; projectName: string; phaseName?: string }>();

  for (const e of entries) {
    if (!e.taskId) continue;
    minutesByTask.set(e.taskId, (minutesByTask.get(e.taskId) ?? 0) + (e.durationMinutes ?? 0));
    projectByTask.set(e.taskId, {
      projectId: e.projectId,
      projectName: e.projectNameSnapshot || projects.get(e.projectId)?.name || e.projectId,
      phaseName: e.phaseNameSnapshot ?? undefined,
    });
  }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const rows: WorkDayTaskRow[] = [];

  for (const [taskId, minutes] of minutesByTask) {
    const task = taskById.get(taskId);
    const meta = projectByTask.get(taskId)!;
    const status = (task?.status ?? "OPEN").toUpperCase();
    rows.push({
      taskId,
      projectId: meta.projectId,
      projectName: meta.projectName,
      title: task?.title ?? entries.find((x) => x.taskId === taskId)?.taskTitleSnapshot ?? taskId,
      phaseName: meta.phaseName,
      status,
      durationMinutes: minutes,
      completedOnDay: status === "DONE" && (task?.updatedAt ? ymdFromIso(task.updatedAt) === dateYmd : false),
      assigneeName: task?.assigneeName ?? undefined,
    });
  }

  for (const task of tasks) {
    if (minutesByTask.has(task.id)) continue;
    const updatedDay = task.updatedAt ? ymdFromIso(task.updatedAt) : "";
    const status = (task.status ?? "OPEN").toUpperCase();
    if (updatedDay !== dateYmd && status !== "DONE") continue;
    if (status === "DONE" && updatedDay !== dateYmd) continue;
    const project = projects.get(task.projectId);
    rows.push({
      taskId: task.id,
      projectId: task.projectId,
      projectName: project?.name ?? task.projectId,
      title: task.title,
      status,
      durationMinutes: 0,
      completedOnDay: status === "DONE" && updatedDay === dateYmd,
      assigneeName: task.assigneeName ?? undefined,
    });
  }

  return rows.sort((a, b) => b.durationMinutes - a.durationMinutes);
}

export function buildWorkDayTimeline(input: {
  entries: TimeEntryDoc[];
  problems: WorkDayProblemRow[];
  photos: WorkDayPhotoRow[];
  diaryNotes: DiaryEntryRecord[];
  dateYmd: string;
}): WorkDayTimelineItem[] {
  const events: WorkDayTimelineItem[] = [];

  const dayEntries = input.entries
    .filter((e) => entryCalendarDayYmd(e) === input.dateYmd)
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  if (dayEntries.length > 0) {
    const first = dayEntries[0];
    const t0 = new Date(first.startedAt).getTime();
    if (Number.isFinite(t0)) {
      events.push({
        id: `day-start-${first.id}`,
        time: formatTimeShort(first.startedAt),
        timeSort: t0,
        kind: "start",
        title: first.projectNameSnapshot || "—",
        projectId: first.projectId,
        projectName: first.projectNameSnapshot,
      });
    }
  }

  for (const e of dayEntries) {
    const startMs = new Date(e.startedAt).getTime();
    if (Number.isFinite(startMs)) {
      events.push({
        id: `entry-${e.id}`,
        time: formatTimeShort(e.startedAt),
        timeSort: startMs + 1,
        kind: "task",
        title: e.taskTitleSnapshot || e.projectNameSnapshot || "—",
        subtitle: e.phaseNameSnapshot ?? undefined,
        projectId: e.projectId,
        projectName: e.projectNameSnapshot,
        taskId: e.taskId ?? undefined,
        durationMinutes: e.durationMinutes,
        badge: e.mode === "manual" ? "manual" : undefined,
      });
    }
    if (e.endedAt) {
      const endMs = new Date(e.endedAt).getTime();
      if (Number.isFinite(endMs)) {
        events.push({
          id: `entry-end-${e.id}`,
          time: formatTimeShort(e.endedAt),
          timeSort: endMs,
          kind: "entry",
          title: e.taskTitleSnapshot || e.projectNameSnapshot || "—",
          projectId: e.projectId,
          projectName: e.projectNameSnapshot,
          durationMinutes: e.durationMinutes,
        });
      }
    }
    if (e.note?.trim()) {
      const noteMs = new Date(e.endedAt || e.startedAt).getTime();
      events.push({
        id: `note-${e.id}`,
        time: formatTimeShort(e.endedAt || e.startedAt),
        timeSort: noteMs + 0.5,
        kind: "note",
        title: e.note.trim(),
        projectName: e.projectNameSnapshot,
      });
    }
  }

  if (dayEntries.length > 0) {
    const last = dayEntries[dayEntries.length - 1];
    if (last.endedAt) {
      const endMs = new Date(last.endedAt).getTime();
      if (Number.isFinite(endMs)) {
        events.push({
          id: `day-stop-${last.id}`,
          time: formatTimeShort(last.endedAt),
          timeSort: endMs + 1,
          kind: "stop",
          title: last.projectNameSnapshot || "—",
          projectId: last.projectId,
          projectName: last.projectNameSnapshot,
        });
      }
    }
  }

  for (const p of input.problems) {
    if (!p.reportedAt) continue;
    const ms = new Date(p.reportedAt).getTime();
    if (!Number.isFinite(ms) || ymdFromIso(p.reportedAt) !== input.dateYmd) continue;
    events.push({
      id: `problem-${p.id}`,
      time: formatTimeShort(p.reportedAt),
      timeSort: ms,
      kind: "problem",
      title: p.title,
      projectId: p.projectId,
      projectName: p.projectName,
      badge: p.priority,
    });
  }

  for (const ph of input.photos) {
    if (!ph.createdAt) continue;
    const ms = new Date(ph.createdAt).getTime();
    if (!Number.isFinite(ms) || ymdFromIso(ph.createdAt) !== input.dateYmd) continue;
    events.push({
      id: `photo-${ph.id}-${ph.source}`,
      time: formatTimeShort(ph.createdAt),
      timeSort: ms,
      kind: "photo",
      title: ph.fileName,
      projectId: ph.projectId,
      projectName: ph.projectName,
    });
  }

  for (const d of input.diaryNotes) {
    if (!d.createdAt) continue;
    const ms = new Date(d.createdAt).getTime();
    if (!Number.isFinite(ms) || ymdFromIso(d.createdAt) !== input.dateYmd) continue;
    events.push({
      id: `diary-${d.id}`,
      time: formatTimeShort(d.createdAt),
      timeSort: ms,
      kind: "note",
      title: d.workDescription.slice(0, 120),
      projectId: d.projectId,
      projectName: d.projectName,
    });
  }

  return events.sort((a, b) => a.timeSort - b.timeSort);
}

export function assembleWorkDayReport(input: {
  dateYmd: string;
  employee: WorkDayEmployeeInfo;
  entries: TimeEntryDoc[];
  projects: ProjectDoc[];
  tasks: TaskDoc[];
  documents: { projectId: string; projectName: string; doc: ProjectDocumentRecord; previewUrl?: string }[];
  problems: { projectId: string; projectName: string; problem: ProblemDoc }[];
  materials: { projectId: string; projectName: string; material: ProjectMaterialDoc }[];
  diary: DiaryEntryRecord[];
}): WorkDayReport {
  const dayEntries = input.entries.filter((e) => entryCalendarDayYmd(e) === input.dateYmd);
  const totalMinutes = dayEntries.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
  const projectMap = new Map(input.projects.map((p) => [p.id, p]));

  const minutesByProject = new Map<string, number>();
  for (const e of dayEntries) {
    minutesByProject.set(e.projectId, (minutesByProject.get(e.projectId) ?? 0) + (e.durationMinutes ?? 0));
  }
  let primaryProjectId = "";
  let best = 0;
  for (const [pid, mins] of minutesByProject) {
    if (mins > best) {
      best = mins;
      primaryProjectId = pid;
    }
  }
  if (!primaryProjectId && dayEntries.length > 0) primaryProjectId = dayEntries[0].projectId;

  const toProjectSummary = (p: ProjectDoc): WorkDayProjectSummary => ({
    id: p.id,
    name: p.name,
    address: p.addressText ?? undefined,
    city: p.city ?? undefined,
    customerName: p.customerName ?? p.customerCompanyName ?? undefined,
  });

  const primaryProject = primaryProjectId ? projectMap.get(primaryProjectId) : null;
  const projectsWorked = [...new Set(dayEntries.map((e) => e.projectId))]
    .map((id) => projectMap.get(id))
    .filter(Boolean)
    .map((p) => toProjectSummary(p!));

  const gpsPoints = buildWorkDayGpsPoints(dayEntries);
  let distanceKm: number | null = null;
  if (gpsPoints.length >= 2) {
    let sum = 0;
    for (let i = 1; i < gpsPoints.length; i++) {
      sum += haversineKm(gpsPoints[i - 1], gpsPoints[i]);
    }
    distanceKm = Math.round(sum * 10) / 10;
  }

  const tasks = buildWorkDayTasks(dayEntries, input.tasks, projectMap, input.dateYmd);

  const problems: WorkDayProblemRow[] = input.problems
    .filter(({ problem }) => ymdFromIso(problem.createdAt) === input.dateYmd)
    .map(({ projectId, projectName, problem }) => ({
      id: problem.id,
      projectId,
      projectName,
      title: problem.shortDescription,
      priority: problem.priority,
      status: problem.status,
      reportedAt: problem.createdAt,
      reporterName: problem.createdByName,
      description: problem.detail ?? undefined,
      photoUrl: problem.photos?.[0]?.downloadURL,
    }));

  const photos: WorkDayPhotoRow[] = [];
  for (const { projectId, projectName, doc, previewUrl } of input.documents) {
    if (!doc.createdAt || ymdFromIso(doc.createdAt) !== input.dateYmd) continue;
    if (!doc.mimeType?.startsWith("image/")) continue;
    photos.push({
      id: doc.id,
      projectId,
      projectName,
      fileName: doc.fileName,
      createdAt: doc.createdAt,
      previewUrl,
      source: "document",
    });
  }
  for (const p of problems) {
    if (p.photoUrl) {
      photos.push({
        id: `problem-photo-${p.id}`,
        projectId: p.projectId,
        projectName: p.projectName,
        fileName: p.title,
        createdAt: p.reportedAt,
        previewUrl: p.photoUrl,
        source: "problem",
      });
    }
  }

  const materials: WorkDayMaterialRow[] = input.materials
    .filter(({ material }) => {
      const day = ymdFromIso(material.usedAt);
      return day === input.dateYmd && material.usedByUserId === input.employee.userId;
    })
    .map(({ projectId, projectName, material }) => ({
      id: material.id,
      projectId,
      projectName,
      name: material.name,
      quantity: material.quantity,
      unit: material.unit,
      taskId: material.taskId,
    }));

  const employeeNotes: string[] = [];
  for (const e of dayEntries) {
    if (e.note?.trim()) employeeNotes.push(e.note.trim());
  }
  for (const d of input.diary) {
    if (ymdFromIso(d.createdAt) !== input.dateYmd) continue;
    if (d.workDescription?.trim()) employeeNotes.push(d.workDescription.trim());
  }

  const timeline = buildWorkDayTimeline({
    entries: dayEntries,
    problems,
    photos,
    diaryNotes: input.diary,
    dateYmd: input.dateYmd,
  });

  const openTasks = tasks.filter((t) => (t.status ?? "").toUpperCase() !== "DONE");
  const allTasksCompleted = tasks.length > 0 ? openTasks.length === 0 : null;

  const locationLabel =
    primaryProject?.addressText?.trim() ||
    primaryProject?.city?.trim() ||
    projectsWorked[0]?.address ||
    projectsWorked[0]?.city;

  return {
    dateYmd: input.dateYmd,
    employee: input.employee,
    totalMinutes,
    expectedMinutes: null,
    primaryProject: primaryProject ? toProjectSummary(primaryProject) : projectsWorked[0] ?? null,
    projectsWorked,
    locationLabel,
    gpsStatus: resolveGpsStatus(gpsPoints),
    reportStatus: "not_approved",
    timeline,
    gpsPoints,
    distanceKm,
    travelMinutes: null,
    stopCount: gpsPoints.filter((p) => p.label === "stop" || p.label === "point").length,
    tasks,
    problems,
    photos: photos.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    materials,
    employeeNotes: [...new Set(employeeNotes)],
    summary: {
      allTasksCompleted,
      timeInNorm: null,
      hasPhotos: photos.length > 0,
      hasProblems: problems.length > 0,
      hasMaterials: materials.length > 0,
      hasGps: gpsPoints.length > 0,
    },
    timeEntries: dayEntries,
  };
}
