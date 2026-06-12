import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type {
  DayTimelineEvent,
  ProjectInvestmentCard,
  TeamLiveStatusItem,
  TeamWorkloadRow,
  TimeInvestmentByProject,
} from "@/lib/operationsMetrics";
import { formatTimeShort } from "@/lib/operationsMetrics";

export function buildTeamWorkload(
  team: TeamLiveStatusItem[],
  byEmployee: { userId: string; userName: string; totalMinutes: number }[]
): TeamWorkloadRow[] {
  const byUid = new Map(byEmployee.map((e) => [e.userId, e]));
  const rows: TeamWorkloadRow[] = team.map((m) => ({
    uid: m.uid,
    name: m.name,
    totalMinutes: byUid.get(m.uid)?.totalMinutes ?? 0,
    status: m.status,
  }));

  for (const e of byEmployee) {
    if (!rows.some((r) => r.uid === e.userId)) {
      rows.push({
        uid: e.userId,
        name: e.userName,
        totalMinutes: e.totalMinutes,
        status: "offline",
      });
    }
  }

  return rows.sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export function buildProjectInvestmentCards(
  projects: ProjectDoc[],
  tasks: TaskDoc[],
  timeByProject: TimeInvestmentByProject[]
): ProjectInvestmentCard[] {
  const timeMap = new Map(timeByProject.map((p) => [p.projectId, p]));

  return projects
    .map((project) => {
      const projectTasks = tasks.filter((t) => t.projectId === project.id);
      const doneCount = projectTasks.filter((t) => (t.status ?? "").toUpperCase() === "DONE").length;
      const taskCount = projectTasks.length;
      const completionPercent =
        taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;
      const time = timeMap.get(project.id);

      return {
        projectId: project.id,
        projectName: project.name,
        totalMinutes: time?.totalMinutes ?? 0,
        completionPercent,
        taskCount,
        doneCount,
        byMember: time?.byMember ?? [],
      };
    })
    .filter((p) => p.totalMinutes > 0 || p.taskCount > 0)
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 8);
}

export function buildDayTimeline(
  team: TeamLiveStatusItem[],
  todayEntries: TimeEntryDoc[],
  todayIso: string
): DayTimelineEvent[] {
  const events: DayTimelineEvent[] = [];

  for (const m of team) {
    if ((m.status === "working" || m.status === "paused") && m.startedAt) {
      const t = new Date(m.startedAt).getTime();
      events.push({
        id: `start-${m.uid}`,
        time: formatTimeShort(m.startedAt),
        timeSort: t,
        actorName: m.name,
        kind: m.status === "paused" ? "timer_paused" : "timer_started",
        projectName: m.projectName,
        detail: m.taskName ?? undefined,
      });
    }
    if (m.status === "paused" && m.pauseSince) {
      const t = new Date(m.pauseSince).getTime();
      events.push({
        id: `pause-${m.uid}`,
        time: formatTimeShort(m.pauseSince),
        timeSort: t,
        actorName: m.name,
        kind: "timer_paused",
        projectName: m.projectName,
      });
    }
  }

  for (const e of todayEntries) {
    const day = (e.date ?? e.startedAt).slice(0, 10);
    if (day !== todayIso) continue;

    const startMs = new Date(e.startedAt).getTime();
    if (!Number.isNaN(startMs)) {
      events.push({
        id: `entry-start-${e.id}`,
        time: formatTimeShort(e.startedAt),
        timeSort: startMs,
        actorName: e.userNameSnapshot || e.userId,
        kind: "timer_started",
        projectName: e.projectNameSnapshot,
        detail: e.taskTitleSnapshot ?? undefined,
      });
    }

    if (e.endedAt) {
      const endMs = new Date(e.endedAt).getTime();
      if (!Number.isNaN(endMs)) {
        events.push({
          id: `entry-end-${e.id}`,
          time: formatTimeShort(e.endedAt),
          timeSort: endMs,
          actorName: e.userNameSnapshot || e.userId,
          kind: "timer_stopped",
          projectName: e.projectNameSnapshot,
          detail: `${e.durationMinutes} min`,
        });
      }
    }
  }

  const seen = new Set<string>();
  return events
    .filter((ev) => {
      const key = `${ev.timeSort}-${ev.actorName}-${ev.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.timeSort - a.timeSort)
    .slice(0, 20);
}
