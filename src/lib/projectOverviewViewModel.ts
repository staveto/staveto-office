import type { ProjectDoc, TaskDoc } from "./projects";
import type { ProjectPhaseMetrics } from "./projectPhaseMetrics";
import { GENERAL_PHASE_ID } from "./projectPhaseMetrics";
import type { ProjectHealth } from "./projectHealth";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import { entryCalendarDayInRange } from "@/services/attendance/timeTrackingReadService";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import {
  getCustomerDisplayName,
  getHumanWorkflowStatusKey,
  getLocationDisplay,
} from "./projectDashboard";
import { getTaskPlanDate, taskMissingAssignee } from "./taskPlanningDisplay";
import { buildProjectActivity } from "./projectActivity";
import { isDraftJob } from "./projectLifecycle";

export type ProjectOverviewPhaseStatus = "current" | "not_started" | "blocked" | "done";

export type ProjectOverviewTaskStatus = "overdue" | "in_progress" | "open" | "done";

export type ProjectOverviewViewModel = {
  project: {
    id: string;
    title: string;
    customerName?: string;
    location?: string;
    status: string;
    requiresAttention: boolean;
    isDraft: boolean;
  };
  progress: {
    percent: number;
    completedTasks: number;
    totalTasks: number;
    activePhaseName?: string;
    overdueTasks: number;
  };
  phases: Array<{
    id: string;
    name: string;
    completedTasks: number;
    totalTasks: number;
    percent: number;
    status: ProjectOverviewPhaseStatus;
  }>;
  nextAction: {
    titleKey: string;
    messageKey: string;
    messageParams?: Record<string, string | number>;
    primaryLabelKey: string;
    primaryTab: "tasks" | "workplan" | "quote" | "documents";
    severity: "neutral" | "attention" | "warning" | "danger";
  };
  activePhaseTasks: Array<{
    id: string;
    title: string;
    status: ProjectOverviewTaskStatus;
    assigneeName?: string;
    dueLabelKey?: string;
    dueLabelParams?: Record<string, string | number>;
    phaseName?: string;
    blocked: boolean;
  }>;
  team: Array<{
    id: string;
    name: string;
    activeNow: boolean;
    taskCount: number;
  }>;
  time: {
    totalMinutes: number;
    todayMinutes: number;
    weekMinutes: number;
    monthMinutes: number;
    byPerson: Array<{ name: string; minutes: number }>;
  };
  documents: {
    photos: number;
    documents: number;
    reports: number;
  };
  photos: {
    count: number;
    recent: Array<{
      id: string;
      fileName: string;
      storagePath: string;
      createdAt?: string;
    }>;
  };
  activity: Array<{
    id: string;
    actor: string;
    textKey: string;
    textParams?: Record<string, string | number>;
    detail?: string;
    timeLabel: string;
  }>;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function rangeBounds(range: "today" | "week" | "month"): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  if (range === "today") return { from: to, to };
  if (range === "week") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    return { from: ymd(monday), to };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: ymd(first), to };
}

function minutesInRange(entries: TimeEntryDoc[], from: string, to: string): number {
  return entries
    .filter((e) => entryCalendarDayInRange(e, from, to))
    .reduce((s, e) => s + Math.max(0, e.durationMinutes || 0), 0);
}

function isOpenTask(task: TaskDoc): boolean {
  return (task.status ?? "OPEN").toUpperCase() !== "DONE";
}

function isBlockedTask(task: TaskDoc): boolean {
  return (task.status ?? "").toUpperCase() === "BLOCKED";
}

function isInProgressTask(task: TaskDoc): boolean {
  return (task.status ?? "").toUpperCase() === "IN_PROGRESS";
}

function isOverdueTask(task: TaskDoc, today: string): boolean {
  if (!isOpenTask(task)) return false;
  const date = getTaskPlanDate(task);
  return !!date && date < today;
}

function classifyTask(
  task: TaskDoc,
  today: string
): ProjectOverviewTaskStatus {
  if ((task.status ?? "OPEN").toUpperCase() === "DONE") return "done";
  if (isOverdueTask(task, today)) return "overdue";
  if (isInProgressTask(task)) return "in_progress";
  return "open";
}

function taskSortRank(status: ProjectOverviewTaskStatus): number {
  return { overdue: 0, in_progress: 1, open: 2, done: 3 }[status];
}

function formatActivityTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function countDocuments(documents: ProjectDocumentRecord[]) {
  let photos = 0;
  let docs = 0;
  for (const d of documents) {
    if (d.mimeType?.startsWith("image/")) photos += 1;
    else docs += 1;
  }
  return { photos, documents: docs, reports: 0 };
}

function pickRecentPhotos(documents: ProjectDocumentRecord[]) {
  return documents
    .filter((d) => d.mimeType?.startsWith("image/") && d.storagePath?.trim())
    .slice(0, 4)
    .map((d) => ({
      id: d.id,
      fileName: d.fileName,
      storagePath: d.storagePath,
      createdAt: d.createdAt,
    }));
}

export function buildProjectOverviewViewModel(input: {
  project: ProjectDoc;
  tasks: TaskDoc[];
  phaseMetrics: ProjectPhaseMetrics;
  members: ProjectMemberRecord[];
  timeEntries: TimeEntryDoc[];
  documents: ProjectDocumentRecord[];
  activeTimers: Map<string, ActiveTimerState>;
  health: ProjectHealth;
  phaseLabels: Map<string, string>;
}): ProjectOverviewViewModel {
  const {
    project,
    tasks,
    phaseMetrics,
    members,
    timeEntries,
    documents,
    activeTimers,
    health,
    phaseLabels,
  } = input;

  const today = todayYmd();
  const activeTasks = tasks.filter((t) => t.isActive !== false);
  const openTasks = activeTasks.filter(isOpenTask);
  const overdueAll = openTasks.filter((t) => isOverdueTask(t, today));

  const activePhaseId = phaseMetrics.activePhaseId;
  const activePhaseTasks = activePhaseId
    ? activeTasks.filter((t) => {
        if (activePhaseId === GENERAL_PHASE_ID) {
          const pid = t.phaseId?.trim();
          return !pid || pid === GENERAL_PHASE_ID;
        }
        return t.phaseId?.trim() === activePhaseId;
      })
    : activeTasks;

  const activePhaseOverdue = activePhaseTasks.filter(
    (t) => isOpenTask(t) && isOverdueTask(t, today)
  );

  const memberNameById = new Map(
    members.map((m) => [m.userId, m.name?.trim() || m.email || m.userId])
  );

  const resolveAssignee = (task: TaskDoc) =>
    task.assigneeName?.trim() ||
    (task.assigneeId?.trim() ? memberNameById.get(task.assigneeId.trim()) : undefined);

  const resolvePhaseName = (task: TaskDoc) => {
    const id = task.phaseId?.trim();
    if (!id) return undefined;
    return phaseLabels.get(id) ?? id;
  };

  const activePhaseTaskRows = activePhaseTasks
    .map((task) => {
      const status = classifyTask(task, today);
      const planDate = getTaskPlanDate(task);
      return {
        id: task.id,
        title: task.title?.trim() || "—",
        status,
        assigneeName: resolveAssignee(task),
        dueLabelKey: planDate
          ? status === "overdue"
            ? "projects.command.task.dueOverdue"
            : "projects.command.task.dueOn"
          : undefined,
        dueLabelParams: planDate ? { date: planDate } : undefined,
        phaseName: resolvePhaseName(task),
        blocked: isBlockedTask(task),
      };
    })
    .sort((a, b) => taskSortRank(a.status) - taskSortRank(b.status))
    .slice(0, 5);

  const phases = phaseMetrics.phases.map((phase) => {
    const phaseTasks = activeTasks.filter((t) =>
      phase.isGeneral
        ? !t.phaseId?.trim() || t.phaseId === phase.id
        : t.phaseId?.trim() === phase.id
    );
    const hasBlocked = phaseTasks.some((t) => isOpenTask(t) && isBlockedTask(t));

    let status: ProjectOverviewPhaseStatus = "not_started";
    if (phase.isComplete) status = "done";
    else if (phase.isActive && hasBlocked) status = "blocked";
    else if (phase.isActive) status = "current";
    else if (phase.total > 0 && phase.done > 0) status = "not_started";

    return {
      id: phase.id,
      name: phase.isGeneral ? "__general__" : phase.name,
      completedTasks: phase.done,
      totalTasks: phase.total,
      percent: phase.percent,
      status,
    };
  });

  const unassignedCount = openTasks.filter(taskMissingAssignee).length;
  const blockedCount = openTasks.filter(isBlockedTask).length;
  const activePhaseName = phaseMetrics.activePhaseName ?? undefined;

  let nextAction: ProjectOverviewViewModel["nextAction"];
  if (activePhaseOverdue.length > 0 && activePhaseName) {
    nextAction = {
      titleKey: "projects.command.nextAction.title",
      messageKey: "projects.command.nextAction.overdueInPhase",
      messageParams: {
        count: activePhaseOverdue.length,
        phase: activePhaseName,
      },
      primaryLabelKey: "projects.overview.openTasks",
      primaryTab: "tasks",
      severity: "danger",
    };
  } else if (overdueAll.length > 0) {
    nextAction = {
      titleKey: "projects.command.nextAction.title",
      messageKey: "projects.command.nextAction.overdue",
      messageParams: { count: overdueAll.length },
      primaryLabelKey: "projects.overview.openTasks",
      primaryTab: "tasks",
      severity: "warning",
    };
  } else if (blockedCount > 0) {
    nextAction = {
      titleKey: "projects.command.nextAction.title",
      messageKey: "projects.command.nextAction.blocked",
      messageParams: { count: blockedCount },
      primaryLabelKey: "projects.overview.openTasks",
      primaryTab: "tasks",
      severity: "danger",
    };
  } else if (unassignedCount > 0) {
    nextAction = {
      titleKey: "projects.command.nextAction.title",
      messageKey: "projects.command.nextAction.unassigned",
      messageParams: { count: unassignedCount },
      primaryLabelKey: "projects.workPlan.assignWorker",
      primaryTab: "workplan",
      severity: "attention",
    };
  } else if (members.length === 0) {
    nextAction = {
      titleKey: "projects.command.nextAction.title",
      messageKey: "projects.command.nextAction.noCrew",
      primaryLabelKey: "projects.workPlan.assignWorker",
      primaryTab: "workplan",
      severity: "attention",
    };
  } else if (openTasks.length > 0) {
    nextAction = {
      titleKey: "projects.command.nextAction.title",
      messageKey: "projects.command.nextAction.continueWork",
      messageParams: { count: openTasks.length },
      primaryLabelKey: "projects.overview.openTasks",
      primaryTab: "tasks",
      severity: "neutral",
    };
  } else {
    nextAction = {
      titleKey: "projects.command.nextAction.title",
      messageKey: "projects.command.nextAction.allDone",
      primaryLabelKey: "projects.header.createReport",
      primaryTab: "documents",
      severity: "neutral",
    };
  }

  const team = members
    .map((m) => {
      const timer = activeTimers.get(m.userId);
      const activeNow = !!timer && timer.status !== "paused";
      const taskCount = openTasks.filter((t) => t.assigneeId?.trim() === m.userId).length;
      return {
        id: m.userId,
        name: m.name?.trim() || m.email || m.userId,
        activeNow,
        taskCount,
      };
    })
    .sort((a, b) => Number(b.activeNow) - Number(a.activeNow) || b.taskCount - a.taskCount);

  const todayBounds = rangeBounds("today");
  const weekBounds = rangeBounds("week");
  const monthBounds = rangeBounds("month");

  const byPersonMap = new Map<string, number>();
  for (const e of timeEntries) {
    const name = e.userNameSnapshot?.trim() || e.userId || "—";
    byPersonMap.set(name, (byPersonMap.get(name) ?? 0) + Math.max(0, e.durationMinutes || 0));
  }
  const byPerson = [...byPersonMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, minutes]) => ({ name, minutes }));

  const activity = buildProjectActivity({ project, tasks, timeEntries, documents })
    .slice(0, 5)
    .map((event) => ({
      id: event.id,
      actor:
        typeof event.params?.actor === "string" && event.params.actor.trim()
          ? event.params.actor.trim()
          : "—",
      textKey: event.titleKey,
      textParams: event.params,
      detail: event.detail,
      timeLabel: formatActivityTime(event.date),
    }));

  const docCounts = countDocuments(documents);
  const recentPhotos = pickRecentPhotos(documents);
  const statusKey = getHumanWorkflowStatusKey(project);

  return {
    project: {
      id: project.id,
      title: project.name?.trim() || "—",
      customerName: getCustomerDisplayName(project) || undefined,
      location: getLocationDisplay(project) || undefined,
      status: statusKey,
      requiresAttention: health.status !== "ON_TRACK",
      isDraft: isDraftJob(project),
    },
    progress: {
      percent: phaseMetrics.overallPercent,
      completedTasks: phaseMetrics.doneTasks,
      totalTasks: phaseMetrics.totalTasks,
      activePhaseName,
      overdueTasks: overdueAll.length,
    },
    phases,
    nextAction,
    activePhaseTasks: activePhaseTaskRows,
    team,
    time: {
      totalMinutes: timeEntries.reduce((s, e) => s + Math.max(0, e.durationMinutes || 0), 0),
      todayMinutes: minutesInRange(timeEntries, todayBounds.from, todayBounds.to),
      weekMinutes: minutesInRange(timeEntries, weekBounds.from, weekBounds.to),
      monthMinutes: minutesInRange(timeEntries, monthBounds.from, monthBounds.to),
      byPerson,
    },
    documents: docCounts,
    photos: {
      count: docCounts.photos,
      recent: recentPhotos,
    },
    activity,
  };
}

export function formatOverviewMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
