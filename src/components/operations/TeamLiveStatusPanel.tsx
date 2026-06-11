"use client";

import type { TeamLiveStatusItem } from "@/lib/operationsMetrics";
import { toHoursMinutes } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";

type Props = {
  members: TeamLiveStatusItem[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

const STATUS_COLOR: Record<TeamLiveStatusItem["status"], string> = {
  working: "bg-emerald-500",
  paused: "bg-amber-500",
  not_started: "bg-slate-400",
  absent: "bg-rose-500",
  offline: "bg-indigo-500",
};

export function TeamLiveStatusPanel({ members, t }: Props) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("operations.workingNow")}</h3>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operations.noActiveTimers")}</p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li key={member.uid} className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.projectName || t("operations.notStarted")}
                    {member.taskName ? ` - ${member.taskName}` : ""}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1 ring-border">
                  <span className={cn("size-1.5 rounded-full", STATUS_COLOR[member.status])} />
                  {t(`operations.status.${member.status}`)}
                </span>
              </div>
              {typeof member.timerSeconds === "number" ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("operations.investedTime")}: {toHoursMinutes(Math.floor(member.timerSeconds / 60))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
