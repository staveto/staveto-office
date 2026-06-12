"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  OctagonAlert,
  UserX,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskDoc } from "@/lib/projects";
import {
  getTaskPlanDate,
  taskMissingAssignee,
  taskMissingTools,
} from "@/lib/taskPlanningDisplay";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  tasks: TaskDoc[];
  onOpenTasks: () => void;
  onOpenWorkPlan: () => void;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function isOpen(task: TaskDoc): boolean {
  return (task.status ?? "OPEN").toUpperCase() !== "DONE";
}

export function ProjectTodayActionsPanel({ tasks, onOpenTasks, onOpenWorkPlan }: Props) {
  const { t } = useI18n();
  const today = todayYmd();

  const data = useMemo(() => {
    const open = tasks.filter((x) => x.isActive !== false && isOpen(x));
    const blocked = open.filter((x) => (x.status ?? "").toUpperCase() === "BLOCKED");
    const overdue = open.filter((x) => {
      const d = getTaskPlanDate(x);
      return !!d && d < today;
    });
    const unassigned = open.filter(taskMissingAssignee);
    const missingTools = open.filter(taskMissingTools);
    const upcoming = open
      .filter((x) => {
        const d = getTaskPlanDate(x);
        return !!d && d >= today;
      })
      .sort((a, b) => (getTaskPlanDate(a) ?? "").localeCompare(getTaskPlanDate(b) ?? ""))
      .slice(0, 4);
    return { open, blocked, overdue, unassigned, missingTools, upcoming };
  }, [tasks, today]);

  const rows: {
    key: string;
    icon: typeof CircleAlert;
    label: string;
    count: number;
    tone: "blocked" | "warn" | "ok";
    onClick: () => void;
  }[] = [
    {
      key: "blocked",
      icon: OctagonAlert,
      label: t("projects.today.blocked"),
      count: data.blocked.length,
      tone: "blocked",
      onClick: onOpenTasks,
    },
    {
      key: "overdue",
      icon: CalendarClock,
      label: t("projects.today.overdue"),
      count: data.overdue.length,
      tone: "warn",
      onClick: onOpenWorkPlan,
    },
    {
      key: "unassigned",
      icon: UserX,
      label: t("projects.today.unassigned"),
      count: data.unassigned.length,
      tone: "warn",
      onClick: onOpenWorkPlan,
    },
    {
      key: "tools",
      icon: Wrench,
      label: t("projects.today.missingTools"),
      count: data.missingTools.length,
      tone: "warn",
      onClick: onOpenWorkPlan,
    },
  ];

  const allClear = rows.every((r) => r.count === 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-[#1D376A]">
          <CircleAlert className="size-4 text-[#e06737]" />
          {t("projects.today.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {allClear ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            {t("projects.today.allClear")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {rows
              .filter((r) => r.count > 0)
              .map((row) => {
                const Icon = row.icon;
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={row.onClick}
                    className={cn(
                      "group flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      row.tone === "blocked"
                        ? "border-red-200 bg-red-50 hover:border-red-300"
                        : "border-amber-200 bg-amber-50 hover:border-amber-300"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          row.tone === "blocked" ? "text-red-600" : "text-amber-600"
                        )}
                      />
                      {row.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-base font-bold tabular-nums text-[#1D376A]">
                        {row.count}
                      </span>
                      <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </button>
                );
              })}
          </div>
        )}

        {data.upcoming.length > 0 ? (
          <div className="space-y-1.5 border-t border-border/60 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("projects.today.upcoming")}
            </p>
            <ul className="space-y-1">
              {data.upcoming.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate text-foreground">
                    {task.title || t("projects.noName")}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {getTaskPlanDate(task)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
