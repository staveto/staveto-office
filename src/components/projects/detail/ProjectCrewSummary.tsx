"use client";

import { useMemo } from "react";
import { Circle, Pause, Play, UserRound, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TaskDoc } from "@/lib/projects";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  members: ProjectMemberRecord[];
  tasks: TaskDoc[];
  activeTimers: Map<string, ActiveTimerState>;
  onAssignCrew: () => void;
};

type CrewStatus = "working" | "paused" | "idle";

export function ProjectCrewSummary({
  members,
  tasks,
  activeTimers,
  onAssignCrew,
}: Props) {
  const { t } = useI18n();

  const rows = useMemo(() => {
    const openByUser = new Map<string, number>();
    for (const task of tasks) {
      if (task.isActive === false) continue;
      if ((task.status ?? "OPEN").toUpperCase() === "DONE") continue;
      const uid = task.assigneeId?.trim();
      if (!uid) continue;
      openByUser.set(uid, (openByUser.get(uid) ?? 0) + 1);
    }

    return members
      .map((m) => {
        const timer = activeTimers.get(m.userId);
        const status: CrewStatus = timer
          ? timer.status === "paused"
            ? "paused"
            : "working"
          : "idle";
        return {
          userId: m.userId,
          name: m.name?.trim() || m.email || m.userId,
          openTasks: openByUser.get(m.userId) ?? 0,
          status,
        };
      })
      .sort((a, b) => {
        const rank = { working: 0, paused: 1, idle: 2 } as const;
        return rank[a.status] - rank[b.status] || b.openTasks - a.openTasks;
      });
  }, [members, tasks, activeTimers]);

  const workingCount = rows.filter((r) => r.status !== "idle").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-[#1D376A]">
          <Users className="size-4" />
          {t("projects.crew.title")}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onAssignCrew}>
          {t("projects.workPlan.assignWorker")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
            {t("projects.crew.empty")}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("projects.crew.summary", {
                total: rows.length,
                working: workingCount,
              })}
            </p>
            <ul className="space-y-1.5">
              {rows.map((row) => (
                <li
                  key={row.userId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserRound className="size-4 shrink-0 text-[#1D376A]" />
                    <span className="truncate text-sm font-medium text-foreground">
                      {row.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("projects.workPlan.tasksCount", { count: row.openTasks })}
                    </span>
                    <StatusPill status={row.status} t={t} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({
  status,
  t,
}: {
  status: CrewStatus;
  t: (key: string) => string;
}) {
  const config = {
    working: {
      icon: Play,
      label: t("projects.crew.statusWorking"),
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    paused: {
      icon: Pause,
      label: t("projects.crew.statusPaused"),
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    idle: {
      icon: Circle,
      label: t("projects.crew.statusIdle"),
      className: "bg-muted text-muted-foreground border-border/60",
    },
  }[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        config.className
      )}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}
