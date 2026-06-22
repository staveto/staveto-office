"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  FolderKanban,
  UserCheck,
  Palmtree,
  CalendarClock,
  ClipboardList,
  AlertTriangle,
  CalendarOff,
  UserMinus,
  Ban,
  CheckCircle2,
  ArrowRight,
  GanttChartSquare,
  MessageSquare,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { PlanningDashboardData } from "@/services/planning";
import type {
  PlanningCommandCenter,
  PlanningIssueRow,
  PlanningIssueKind,
  PlanningIssueAction,
  WorkerCapacity,
  WorkerCapacityStatus,
  JobRequiringPlanning,
  JobHealth,
  UnplannedTask,
} from "@/lib/planningCommandCenter";

type TFn = (key: string, params?: Record<string, string | number>) => string;

const cardBase =
  "rounded-xl border border-border bg-card/80 backdrop-blur-sm";

/* ------------------------------------------------------------------ */
/* Status strip                                                        */
/* ------------------------------------------------------------------ */

type StripItem = {
  icon: LucideIcon;
  labelKey: string;
  value: number | null;
  tone: "neutral" | "action" | "warn";
};

export function StatusStrip({
  model,
  t,
}: {
  model: PlanningCommandCenter;
  t: TFn;
}) {
  const s = model.statusStrip;
  const items: StripItem[] = [
    { icon: Users, labelKey: "planning.status.teamMembers", value: s.teamMembers, tone: "neutral" },
    { icon: FolderKanban, labelKey: "planning.status.activeJobs", value: s.activeJobs, tone: "neutral" },
    { icon: UserCheck, labelKey: "planning.status.assignedWorkers", value: s.assignedWorkers, tone: "neutral" },
    { icon: Palmtree, labelKey: "planning.status.absencesToday", value: s.absencesToday, tone: s.absencesToday ? "warn" : "neutral" },
    { icon: CalendarClock, labelKey: "planning.status.tasksDueToday", value: s.tasksDueToday, tone: s.tasksDueToday ? "warn" : "neutral" },
    { icon: ClipboardList, labelKey: "planning.status.unplannedTasks", value: s.unplannedTasks, tone: s.unplannedTasks ? "action" : "neutral" },
  ];

  return (
    <div className={cn(cardBase, "grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-3 lg:grid-cols-6")}>
      {items.map(({ icon: Icon, labelKey, value, tone }) => (
        <div key={labelKey} className="flex items-center gap-3 bg-card px-3.5 py-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              tone === "action" && "bg-[#e06737]/15 text-[#e06737]",
              tone === "warn" && "bg-amber-500/15 text-amber-500",
              tone === "neutral" && "bg-[#1D376A]/15 text-[#6b8cce]"
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(labelKey)}
            </p>
            <p
              className={cn(
                "text-xl font-semibold leading-tight",
                tone === "action" && value ? "text-[#e06737]" : "text-foreground"
              )}
            >
              {value === null ? "—" : value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* What needs planning                                                 */
/* ------------------------------------------------------------------ */

const ISSUE_META: Record<
  PlanningIssueKind,
  { icon: LucideIcon; titleKey: string; descKey: string; tone: "action" | "warn" | "risk" | "info" }
> = {
  jobsWithoutCrew: { icon: FolderKanban, titleKey: "planning.jobsWithoutCrew", descKey: "planning.jobsWithoutCrew.desc", tone: "action" },
  tasksWithoutAssignee: { icon: UserMinus, titleKey: "planning.tasksWithoutAssignee", descKey: "planning.tasksWithoutAssignee.desc", tone: "action" },
  tasksWithoutDate: { icon: CalendarOff, titleKey: "planning.tasksWithoutDate", descKey: "planning.tasksWithoutDate.desc", tone: "warn" },
  overdueTasks: { icon: AlertTriangle, titleKey: "planning.overdueTasks", descKey: "planning.overdueTasks.desc", tone: "risk" },
  blockedTasks: { icon: Ban, titleKey: "planning.blockedTasks", descKey: "planning.blockedTasks.desc", tone: "risk" },
  fieldNotes: { icon: MessageSquare, titleKey: "planning.fieldNotesOpen", descKey: "planning.fieldNotesOpen.desc", tone: "info" },
};

const ACTION_LABEL: Record<PlanningIssueAction, string> = {
  assign: "planning.assign",
  plan: "planning.plan",
  review: "planning.review",
  gantt: "planning.planInGantt",
};

function IssueRow({ row, t }: { row: PlanningIssueRow; t: TFn }) {
  const meta = ISSUE_META[row.kind];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          meta.tone === "risk" && "bg-red-500/15 text-red-400",
          meta.tone === "action" && "bg-[#e06737]/15 text-[#e06737]",
          meta.tone === "warn" && "bg-amber-500/15 text-amber-500",
          meta.tone === "info" && "bg-[#1D376A]/15 text-[#6b8cce]"
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          <span className="font-semibold">{row.count}</span> {t(meta.titleKey)}
        </p>
        <p className="truncate text-xs text-muted-foreground">{t(meta.descKey)}</p>
      </div>
      <Link
        href={row.href}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:border-[#e06737]/60 hover:text-[#e06737]"
      >
        {t(ACTION_LABEL[row.action])}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

export function PriorityPanel({
  model,
  hasActiveJobs,
  t,
}: {
  model: PlanningCommandCenter;
  hasActiveJobs: boolean;
  t: TFn;
}) {
  return (
    <section className={cn(cardBase, "flex flex-col p-4")}>
      <header className="mb-3 flex items-center gap-2">
        <ClipboardList className="size-4 text-[#e06737]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t("planning.whatNeedsPlanning")}</h2>
      </header>

      {model.issues.length > 0 ? (
        <div className="flex flex-col gap-2">
          {model.issues.map((row) => (
            <IssueRow key={row.kind} row={row} t={t} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-8 text-center">
          <CheckCircle2 className="size-9 text-emerald-500" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("planning.allPlanned")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("planning.allPlanned.desc")}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/app/planning/gantt"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#1D376A] px-3 text-xs font-medium text-white hover:bg-[#162d58]"
            >
              <GanttChartSquare className="size-3.5" aria-hidden />
              {t("planning.openGantt")}
            </Link>
            {!hasActiveJobs ? (
              <Link
                href="/app/projects/new"
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:border-[#e06737]/60"
              >
                {t("planning.createJob")}
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Next actions / today summary (right column)                         */
/* ------------------------------------------------------------------ */

export function NextActions({
  model,
  t,
}: {
  model: PlanningCommandCenter;
  t: TFn;
}) {
  const s = model.statusStrip;
  const lines: { label: string; value: number | null; tone: boolean }[] = [
    { label: t("planning.status.tasksDueToday"), value: s.tasksDueToday, tone: !!s.tasksDueToday },
    { label: t("planning.overdueTasks"), value: model.totals.overdueTasks, tone: !!model.totals.overdueTasks },
    { label: t("planning.blockedTasks"), value: model.totals.blockedTasks, tone: !!model.totals.blockedTasks },
    { label: t("planning.status.absencesToday"), value: s.absencesToday, tone: !!s.absencesToday },
  ];

  return (
    <section className={cn(cardBase, "flex flex-col p-4")}>
      <header className="mb-3 flex items-center gap-2">
        <CalendarClock className="size-4 text-[#6b8cce]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t("planning.todaySummary")}</h2>
      </header>
      <ul className="flex flex-col divide-y divide-border/60">
        {lines.map((l) => (
          <li key={l.label} className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted-foreground">{l.label}</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                l.tone ? "text-[#e06737]" : "text-foreground"
              )}
            >
              {l.value === null ? "—" : l.value}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/app/planning/gantt?view=week"
        className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#1D376A] px-3 text-sm font-medium text-white hover:bg-[#162d58]"
      >
        <GanttChartSquare className="size-4" aria-hidden />
        {t("planning.openGantt")}
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Team capacity                                                       */
/* ------------------------------------------------------------------ */

const WORKER_STATUS_STYLE: Record<WorkerCapacityStatus, string> = {
  free: "bg-emerald-500/15 text-emerald-400",
  assigned: "bg-[#1D376A]/20 text-[#6b8cce]",
  working: "bg-sky-500/15 text-sky-400",
  absent: "bg-red-500/15 text-red-400",
  unknown: "bg-muted text-muted-foreground",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TeamCapacityPanel({
  model,
  attendanceConnected,
  t,
}: {
  model: PlanningCommandCenter;
  attendanceConnected: boolean;
  t: TFn;
}) {
  const workers = model.workers;
  return (
    <section className={cn(cardBase, "flex flex-col p-4")}>
      <header className="mb-3 flex items-center gap-2">
        <Users className="size-4 text-[#6b8cce]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t("planning.teamCapacity")}</h2>
      </header>

      {workers.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
          {t("planning.team.emptyTitle")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {workers.map((w) => (
            <WorkerRow key={w.uid} worker={w} t={t} />
          ))}
        </ul>
      )}

      {!attendanceConnected ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
          {t("planning.attendanceHintSmall")}
        </p>
      ) : null}
    </section>
  );
}

function WorkerRow({ worker, t }: { worker: WorkerCapacity; t: TFn }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/30 px-2.5 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1D376A] text-[11px] font-semibold text-white">
        {initials(worker.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{worker.name}</p>
        <p className="text-xs text-muted-foreground">
          {t("planning.worker.openTasks", { count: worker.openTaskCount })}
        </p>
      </div>
      {worker.overloaded ? (
        <span className="rounded-full bg-[#e06737]/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#e06737]">
          {t("planning.worker.overloaded")}
        </span>
      ) : null}
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
          WORKER_STATUS_STYLE[worker.status]
        )}
      >
        {t(`planning.worker.${worker.status}`)}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Jobs requiring planning                                             */
/* ------------------------------------------------------------------ */

const HEALTH_DOT: Record<JobHealth, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  risk: "bg-red-500",
};

export function JobsToPlanPanel({
  jobs,
  hasActiveJobs,
  t,
}: {
  jobs: JobRequiringPlanning[];
  hasActiveJobs: boolean;
  t: TFn;
}) {
  return (
    <section className={cn(cardBase, "flex flex-col p-4")}>
      <header className="mb-3 flex items-center gap-2">
        <FolderKanban className="size-4 text-[#6b8cce]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t("planning.jobsRequiringPlanning")}</h2>
      </header>

      {jobs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/40 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            {hasActiveJobs ? t("planning.noJobsRequiringPlanning") : t("planning.noActiveJobs")}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasActiveJobs ? t("planning.noJobsRequiringPlanning.desc") : t("planning.noActiveJobs.desc")}
          </p>
          {!hasActiveJobs ? (
            <Link
              href="/app/projects/new"
              className="mt-1 inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:border-[#e06737]/60"
            >
              {t("planning.createJob")}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.slice(0, 8).map((job) => (
            <li
              key={job.projectId}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
            >
              <span className={cn("size-2.5 shrink-0 rounded-full", HEALTH_DOT[job.health])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{job.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {job.customer ? `${job.customer} · ` : ""}
                  {t("planning.crewCount", { count: job.crewCount })} ·{" "}
                  {t("planning.openTasksCount", { count: job.openTaskCount })}
                  {job.unplannedTaskCount > 0
                    ? ` · ${t("planning.unplannedCount", { count: job.unplannedTaskCount })}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={`/app/projects/${job.projectId}`}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:border-[#e06737]/60"
                >
                  {t("planning.open")}
                </Link>
                <Link
                  href={`/app/planning/gantt?projectId=${job.projectId}`}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-[#1D376A] px-2.5 text-xs font-medium text-white hover:bg-[#162d58]"
                >
                  <GanttChartSquare className="size-3.5" aria-hidden />
                  {t("planning.planInGantt")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Unplanned work (tabs)                                               */
/* ------------------------------------------------------------------ */

type UnplannedTabId = "withoutAssignee" | "withoutDate" | "overdue" | "blocked";

export function UnplannedWorkPanel({
  model,
  t,
}: {
  model: PlanningCommandCenter;
  t: TFn;
}) {
  const groups = model.unplannedWork;
  const tabs: { id: UnplannedTabId; labelKey: string; items: UnplannedTask[] }[] = useMemo(
    () => [
      { id: "withoutAssignee", labelKey: "planning.withoutAssignee", items: groups.withoutAssignee },
      { id: "withoutDate", labelKey: "planning.withoutDate", items: groups.withoutDate },
      { id: "overdue", labelKey: "planning.overdue", items: groups.overdue },
      { id: "blocked", labelKey: "planning.blocked", items: groups.blocked },
    ],
    [groups]
  );

  const firstNonEmpty = tabs.find((tab) => tab.items.length > 0)?.id ?? "withoutAssignee";
  const [active, setActive] = useState<UnplannedTabId>(firstNonEmpty);
  const activeItems = tabs.find((tab) => tab.id === active)?.items ?? [];

  return (
    <section className={cn(cardBase, "flex flex-col p-4")}>
      <header className="mb-3 flex items-center gap-2">
        <ClipboardList className="size-4 text-[#6b8cce]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t("planning.unplannedWork")}</h2>
      </header>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              active === tab.id
                ? "bg-[#1D376A] text-white"
                : "border border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            {t(tab.labelKey)}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                active === tab.id ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
              )}
            >
              {tab.items.length}
            </span>
          </button>
        ))}
      </div>

      {activeItems.length === 0 ? (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-6 text-center text-xs text-muted-foreground">
          {t("planning.noUnplannedWork")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {activeItems.slice(0, 12).map((task) => (
            <li
              key={`${task.projectId}-${task.id}`}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {task.projectName}
                  {task.date ? ` · ${task.date}` : ""}
                  {task.assigneeName ? ` · ${task.assigneeName}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {!task.hasAssignee ? (
                    <Warn label={t("planning.warn.noAssignee")} tone="action" />
                  ) : null}
                  {!task.hasDate ? <Warn label={t("planning.warn.noDate")} tone="warn" /> : null}
                  {task.overdue ? <Warn label={t("planning.warn.overdue")} tone="risk" /> : null}
                  {task.blocked ? <Warn label={t("planning.warn.blocked")} tone="risk" /> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <Link
                  href={`/app/planning/gantt?projectId=${task.projectId}`}
                  className="inline-flex h-7 items-center justify-center rounded-md bg-[#1D376A] px-2.5 text-xs font-medium text-white hover:bg-[#162d58]"
                >
                  {task.hasAssignee ? t("planning.plan") : t("planning.assign")}
                </Link>
                <Link
                  href={`/app/projects/${task.projectId}`}
                  className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:border-[#e06737]/60"
                >
                  {t("planning.open")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Warn({ label, tone }: { label: string; tone: "action" | "warn" | "risk" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium",
        tone === "risk" && "bg-red-500/15 text-red-400",
        tone === "action" && "bg-[#e06737]/15 text-[#e06737]",
        tone === "warn" && "bg-amber-500/15 text-amber-500"
      )}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Field updates                                                       */
/* ------------------------------------------------------------------ */

export function FieldUpdatesCard({
  data,
  fieldNotesCount,
  t,
}: {
  data: PlanningDashboardData;
  fieldNotesCount: number | null;
  t: TFn;
}) {
  const activeTimers = data.timeEntriesStatus === "available" ? data.timeEntriesToday.length : null;
  const notes = fieldNotesCount ?? 0;
  const hasData = notes > 0 || (activeTimers ?? 0) > 0;

  return (
    <section className={cn(cardBase, "p-4")}>
      <header className="mb-3 flex items-center gap-2">
        <MessageSquare className="size-4 text-[#6b8cce]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t("planning.fieldUpdates")}</h2>
      </header>

      {hasData ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FieldStat icon={MessageSquare} label={t("planning.sharedNotes")} value={notes} href="/app" />
          {activeTimers !== null ? (
            <FieldStat icon={Timer} label={t("planning.activeTimers")} value={activeTimers} />
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("planning.fieldUpdatesEmpty")}</p>
      )}
    </section>
  );
}

function FieldStat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
      <Icon className="size-4 shrink-0 text-[#6b8cce]" aria-hidden />
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-tight text-foreground">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {inner}
    </Link>
  ) : (
    inner
  );
}
