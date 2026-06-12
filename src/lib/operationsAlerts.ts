import type { TodayOverviewMetrics, TeamLiveStatusItem, UnassignedWorkGroup } from "@/lib/operationsMetrics";
import type { TaskDoc } from "@/lib/projects";

export type OperationsAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  labelKey: string;
  count?: number;
  href: string;
};

export function buildOperationsAlerts(input: {
  today: TodayOverviewMetrics;
  unassigned: UnassignedWorkGroup[];
  team: TeamLiveStatusItem[];
  tasks: TaskDoc[];
  todayIso: string;
}): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];

  if (input.today.unassignedTasks > 0) {
    alerts.push({
      id: "tasks-no-assignee",
      severity: "warning",
      labelKey: "operations.tasksWithoutAssignee",
      count: input.today.unassignedTasks,
      href: "/app/planning",
    });
  }

  const noTools = input.unassigned.reduce((sum, p) => sum + p.tasksWithoutTools, 0);
  if (noTools > 0) {
    alerts.push({
      id: "tasks-no-tools",
      severity: "warning",
      labelKey: "operations.tasksWithoutTools",
      count: noTools,
      href: "/app/planning",
    });
  }

  const projectsWithoutCrew = input.unassigned.filter((p) => p.withoutCrew).length;
  if (projectsWithoutCrew > 0) {
    alerts.push({
      id: "projects-no-crew",
      severity: "critical",
      labelKey: "operations.projectsWithoutCrew",
      count: projectsWithoutCrew,
      href: "/app/projects?filter=active",
    });
  }

  const overdue = input.tasks.filter((t) => {
    const d = (t.dueDate ?? "").slice(0, 10);
    return d && d < input.todayIso && (t.status ?? "").toUpperCase() !== "DONE";
  }).length;
  if (overdue > 0) {
    alerts.push({
      id: "tasks-overdue",
      severity: "critical",
      labelKey: "operations.alerts.overdueTasks",
      count: overdue,
      href: "/app/planning",
    });
  }

  const longTimers = input.team.filter((m) => (m.timerSeconds ?? 0) >= 10 * 60 * 60).length;
  if (longTimers > 0) {
    alerts.push({
      id: "long-timers",
      severity: "warning",
      labelKey: "operations.alerts.timerLongRunning",
      count: longTimers,
      href: "/app/operations",
    });
  }

  const longPauses = input.team.filter((m) => {
    if (m.status !== "paused" || !m.pauseSince) return false;
    const ms = Date.now() - new Date(m.pauseSince).getTime();
    return ms >= 60 * 60 * 1000;
  }).length;
  if (longPauses > 0) {
    alerts.push({
      id: "long-pauses",
      severity: "info",
      labelKey: "operations.alerts.pauseTooLong",
      count: longPauses,
      href: "/app/operations",
    });
  }

  return alerts;
}
