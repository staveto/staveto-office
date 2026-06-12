import type { ProjectDoc, TaskDoc } from "./projects";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import { getManagerStatusKey } from "./projectDashboard";

export type ProjectActivityType =
  | "task"
  | "time"
  | "document"
  | "crew"
  | "quote"
  | "project";

export type ProjectActivityEvent = {
  id: string;
  type: ProjectActivityType;
  /** ISO timestamp used for sorting + display. */
  date: string;
  /** i18n key with interpolation params for the headline. */
  titleKey: string;
  params?: Record<string, string | number>;
  detail?: string;
};

function durationLabel(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function buildProjectActivity(input: {
  project: ProjectDoc;
  tasks: TaskDoc[];
  timeEntries: TimeEntryDoc[];
  documents: ProjectDocumentRecord[];
}): ProjectActivityEvent[] {
  const { project, tasks, timeEntries, documents } = input;
  const events: ProjectActivityEvent[] = [];

  // Project lifecycle
  if (project.createdAt) {
    events.push({
      id: "project-created",
      type: "project",
      date: project.createdAt,
      titleKey: "projects.dashboard.activity.created",
    });
  }
  if (project.convertedAt) {
    events.push({
      id: "project-converted",
      type: "project",
      date: project.convertedAt,
      titleKey: "projects.dashboard.activity.converted",
    });
  }

  // Quote
  const qs = project.quoteStatus ?? "none";
  if (qs !== "none") {
    events.push({
      id: `quote-${qs}`,
      type: "quote",
      date: project.updatedAt ?? project.createdAt ?? "",
      titleKey: `projects.dashboard.activity.quote.${qs}`,
    });
  }

  // Completed tasks
  for (const task of tasks) {
    if (task.isActive === false) continue;
    if ((task.status ?? "").toUpperCase() !== "DONE") continue;
    const date = task.updatedAt ?? task.createdAt ?? "";
    if (!date) continue;
    events.push({
      id: `task-done-${task.id}`,
      type: "task",
      date,
      titleKey: "projects.activity.taskCompleted",
      params: {
        actor: task.assigneeName?.trim() || "—",
        title: task.title || "—",
      },
    });
  }

  // Time entries
  for (const entry of timeEntries) {
    const date = entry.endedAt || entry.startedAt;
    if (!date) continue;
    events.push({
      id: `time-${entry.id}`,
      type: "time",
      date,
      titleKey: "projects.activity.timeLogged",
      params: {
        actor: entry.userNameSnapshot?.trim() || "—",
        duration: durationLabel(entry.durationMinutes || 0),
      },
      detail: entry.taskTitleSnapshot?.trim() || undefined,
    });
  }

  // Documents
  for (const docRec of documents) {
    if (!docRec.createdAt) continue;
    events.push({
      id: `doc-${docRec.id}`,
      type: "document",
      date: docRec.createdAt,
      titleKey: "projects.activity.documentUploaded",
      params: { name: docRec.fileName },
    });
  }

  return events
    .filter((e) => e.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function recentProjectActivity(
  events: ProjectActivityEvent[],
  limit = 5
): ProjectActivityEvent[] {
  return events.slice(0, limit);
}

/** Unused helper kept for parity; status key resolution for project change events. */
export function projectStatusActivityKey(project: ProjectDoc): string {
  return getManagerStatusKey(project);
}
