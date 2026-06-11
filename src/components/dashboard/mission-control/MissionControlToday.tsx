"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import type { TodayAgendaRow } from "@/lib/missionControlData";
import { missionHeroCardClassName, missionMutedClassName } from "./missionControlStyles";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type MissionControlTodayProps = {
  rows: TodayAgendaRow[];
};

function WorkerAvatars({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {names.slice(0, 4).map((name) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground"
          title={name}
        >
          <span
            className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary"
            aria-hidden
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-[5rem] truncate">{name.split(" ")[0]}</span>
        </span>
      ))}
      {names.length > 4 ? (
        <span className="text-[11px] text-muted-foreground">+{names.length - 4}</span>
      ) : null}
    </div>
  );
}

export function MissionControlToday({ rows }: MissionControlTodayProps) {
  const { t } = useI18n();

  return (
    <section className={cn(missionHeroCardClassName, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-3.5 md:px-5 dark:border-border dark:bg-transparent">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <h2 className="text-base font-semibold text-foreground">
            {t("dashboard.mission.today.title")}
          </h2>
        </div>
        <Link
          href="/app/planning"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs")}
        >
          {t("dashboard.mission.today.viewPlanning")}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 bg-primary/5 px-4 py-6 md:flex-row md:items-center md:justify-between md:px-5 dark:bg-transparent">
          <p className={missionMutedClassName}>{t("dashboard.mission.today.empty")}</p>
          <Link href="/app/projects?filter=active" className={cn(buttonVariants({ size: "sm" }))}>
            {t("dashboard.mission.today.openJobs")}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-primary/15 dark:divide-border" role="list">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className={cn(
                  "flex gap-4 px-4 py-3.5 transition-colors hover:bg-primary/10 md:px-5 dark:hover:bg-muted/30",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                )}
              >
                <time className="w-12 shrink-0 pt-0.5 font-mono text-sm font-semibold tabular-nums text-primary">
                  {row.time}
                </time>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-foreground">{row.title}</p>
                  <p className={cn(missionMutedClassName, "text-xs")}>{row.projectName}</p>
                  <WorkerAvatars names={row.workers} />
                </div>
                <span className="hidden shrink-0 self-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                  {row.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
