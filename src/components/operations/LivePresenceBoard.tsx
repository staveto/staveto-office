"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { TeamLiveStatusItem, TeamStatus } from "@/lib/operationsMetrics";
import { workDayReportHref } from "@/services/operations/workDayReportService";
import {
  formatTimerHms,
  formatTimeShort,
  memberInitials,
  toHoursMinutes,
} from "@/lib/operationsMetrics";
import type { GpsDisplayStatus } from "@/lib/operationsGps";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  members: TeamLiveStatusItem[];
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Primary dashboard panel — larger footprint for managers. */
  dominant?: boolean;
  /** YYYY-MM-DD for work day detail links (defaults to today). */
  dateYmd?: string;
};

type StatusFilter = "all" | "working" | "paused" | "absent" | "not_started" | "offline";
type GroupMode = "status" | "project";

const STATUS_BORDER: Record<TeamStatus, string> = {
  working: styles.presenceCardWorking,
  paused: styles.presenceCardPaused,
  absent: styles.presenceCardAbsent,
  not_started: styles.presenceCardIdle,
  offline: styles.presenceCardOffline,
};

const STATUS_EMOJI: Record<TeamStatus, string> = {
  working: "🟢",
  paused: "🟡",
  absent: "🌴",
  not_started: "⚪",
  offline: "⚫",
};

const STATUS_ORDER: TeamStatus[] = ["working", "paused", "offline", "not_started", "absent"];

const GPS_STATUS_CLASS: Record<GpsDisplayStatus, string> = {
  available: "text-emerald-700 dark:text-emerald-400",
  after_stop: "text-sky-700 dark:text-sky-400",
  none: "text-muted-foreground",
  low_accuracy: "text-amber-700 dark:text-amber-400",
};

function matchesFilter(status: TeamStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "working") return status === "working";
  if (filter === "paused") return status === "paused";
  if (filter === "absent") return status === "absent";
  if (filter === "not_started") return status === "not_started";
  return status === "offline";
}

function groupByStatus(members: TeamLiveStatusItem[]): { key: string; labelKey: string; items: TeamLiveStatusItem[] }[] {
  return STATUS_ORDER.map((status) => ({
    key: status,
    labelKey: `operations.status.${status}`,
    items: members.filter((m) => m.status === status),
  })).filter((g) => g.items.length > 0);
}

function groupByProject(
  members: TeamLiveStatusItem[],
  t: Props["t"]
): { key: string; label: string; items: TeamLiveStatusItem[] }[] {
  const map = new Map<string, TeamLiveStatusItem[]>();
  for (const m of members) {
    const key = m.projectId ?? "__none__";
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, items]) => ({
      key,
      label:
        key === "__none__"
          ? t("operations.presence.noProject")
          : items[0]?.projectName ?? key,
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.key === "__none__") return 1;
      if (b.key === "__none__") return -1;
      return a.label.localeCompare(b.label);
    });
}

function GpsStatusLine({
  status,
  t,
}: {
  status?: GpsDisplayStatus;
  t: Props["t"];
}) {
  const resolved = status ?? "none";
  return (
    <div className="space-y-0.5">
      <p className={cn("text-xs font-semibold", GPS_STATUS_CLASS[resolved])}>
        {t(`operations.gps.${resolved}`)}
      </p>
      {resolved === "after_stop" ? (
        <p className="text-[10px] leading-snug text-muted-foreground">
          {t("operations.gps.liveUnavailable")}
        </p>
      ) : null}
    </div>
  );
}

function PresencePersonCard({
  member,
  tick,
  t,
  dayHref,
}: {
  member: TeamLiveStatusItem;
  tick: number;
  t: Props["t"];
  dayHref?: string;
}) {
  const secs =
    typeof member.timerSeconds === "number" ? member.timerSeconds : null;
  const showTimer =
    (member.status === "working" || member.status === "paused") && secs !== null;
  const liveSecs =
    member.status === "working" && secs !== null ? secs + tick : secs;

  return (
    <article className={cn(styles.presenceCard, "relative", STATUS_BORDER[member.status])}>
      {dayHref ? (
        <Link
          href={dayHref}
          className="absolute inset-0 z-10 rounded-[inherit]"
          aria-label={t("workDay.openDayReport", { name: member.name })}
        />
      ) : null}
      <div className="relative flex items-start gap-4">
        <div className={styles.presenceAvatar} aria-hidden>
          {memberInitials(member.name)}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-bold text-foreground">
              <span className="mr-1.5" aria-hidden>
                {STATUS_EMOJI[member.status]}
              </span>
              {member.name}
            </h3>
            <span className={styles.presenceStatusBadge}>
              {t(`operations.status.${member.status}`)}
            </span>
          </div>

          {member.status === "absent" ? (
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              {t("operations.liveTeam.onLeave")}
            </p>
          ) : member.status === "not_started" ? (
            <p className="text-sm text-muted-foreground">
              {t("operations.liveTeam.notStartedToday")}
            </p>
          ) : (
            <dl className="grid gap-1.5 text-sm">
              {member.projectName ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="font-semibold text-muted-foreground">
                    {t("operations.presence.project")}
                  </dt>
                  <dd className="font-medium text-[#1D376A] dark:text-slate-100">
                    {member.projectId && !dayHref ? (
                      <Link
                        href={`/app/projects/${member.projectId}`}
                        className="relative z-20 hover:underline"
                      >
                        {member.projectName}
                      </Link>
                    ) : (
                      member.projectName
                    )}
                  </dd>
                </div>
              ) : null}
              {member.taskName ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="font-semibold text-muted-foreground">
                    {t("operations.presence.task")}
                  </dt>
                  <dd className="text-foreground">{member.taskName}</dd>
                </div>
              ) : null}
              {showTimer && liveSecs !== null ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="font-semibold text-muted-foreground">
                    {t("operations.presence.timer")}
                  </dt>
                  <dd
                    className={cn(
                      "text-lg font-extrabold tabular-nums",
                      member.status === "paused" ? "text-amber-600" : "text-emerald-600"
                    )}
                  >
                    {formatTimerHms(liveSecs)}
                  </dd>
                </div>
              ) : null}
              {member.status === "working" && member.startedAt ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="font-semibold text-muted-foreground">
                    {t("operations.presence.since")}
                  </dt>
                  <dd className="text-foreground">
                    {formatTimeShort(member.startedAt)}
                  </dd>
                </div>
              ) : null}
              {member.status === "paused" && member.pauseSince ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="font-semibold text-muted-foreground">
                    {t("operations.presence.pauseSince")}
                  </dt>
                  <dd className="font-medium text-amber-700 dark:text-amber-400">
                    {formatTimeShort(member.pauseSince)}
                  </dd>
                </div>
              ) : null}
              {typeof member.todayWorkedMinutes === "number" ? (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="font-semibold text-muted-foreground">
                    {t("operations.presence.todayWorked")}
                  </dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {toHoursMinutes(member.todayWorkedMinutes)}
                  </dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="font-semibold text-muted-foreground">
                  {t("operations.presence.gpsStatus")}
                </dt>
                <dd>
                  <GpsStatusLine status={member.gpsStatus} t={t} />
                </dd>
              </div>
              {member.status === "offline" ? (
                <p className="text-xs text-muted-foreground">
                  {t("operations.presence.offlineHint")}
                </p>
              ) : null}
            </dl>
          )}

          {member.status === "absent" || member.status === "not_started" ? (
            <div className="pt-1">
              {typeof member.todayWorkedMinutes === "number" && member.todayWorkedMinutes > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("operations.presence.todayWorked")}: {toHoursMinutes(member.todayWorkedMinutes)}
                </p>
              ) : null}
              <GpsStatusLine status={member.gpsStatus} t={t} />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function todayYmdLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function LivePresenceBoard({ members, t, dominant = false, dateYmd }: Props) {
  const resolvedDate = dateYmd ?? todayYmdLocal();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("status");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const hasLive = members.some((m) => m.status === "working");
    if (!hasLive) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [members]);

  const filtered = useMemo(
    () => members.filter((m) => matchesFilter(m.status, filter)),
    [members, filter]
  );

  const groups = useMemo(() => {
    if (groupMode === "status") {
      return groupByStatus(filtered).map((g) => ({
        key: g.key,
        label: t(g.labelKey),
        items: g.items,
      }));
    }
    return groupByProject(filtered, t);
  }, [filtered, groupMode, t]);

  const filters: { id: StatusFilter; labelKey: string }[] = [
    { id: "all", labelKey: "operations.presence.filter.all" },
    { id: "working", labelKey: "operations.presence.filter.working" },
    { id: "paused", labelKey: "operations.presence.filter.paused" },
    { id: "not_started", labelKey: "operations.presence.filter.notStarted" },
    { id: "absent", labelKey: "operations.presence.filter.absent" },
    { id: "offline", labelKey: "operations.presence.filter.offline" },
  ];

  return (
    <section
      className={cn(
        styles.sectionCard,
        styles.presenceBoardShell,
        dominant && styles.presenceBoardDominant
      )}
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2
            className={cn(
              styles.sectionTitle,
              dominant && "text-base font-extrabold tracking-tight"
            )}
          >
            {t("operations.presence.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {dominant ? t("operations.layout.intent.live") : t("operations.presence.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-lg border border-border p-0.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  filter === f.id
                    ? "bg-[#1D376A] text-white"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                { id: "status" as const, labelKey: "operations.presence.group.status" },
                { id: "project" as const, labelKey: "operations.presence.group.project" },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroupMode(g.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  groupMode === g.id
                    ? "bg-[#e06737] text-white"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {t(g.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("operations.presence.empty")}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {group.label}
                <span className="ml-2 font-normal tabular-nums">({group.items.length})</span>
              </h3>
              <div className={styles.presenceGrid}>
                {group.items.map((member) => (
                  <PresencePersonCard
                    key={member.uid}
                    member={member}
                    tick={tick}
                    t={t}
                    dayHref={workDayReportHref(member.uid, resolvedDate)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
        {t("operations.privacy.locationNote")}
      </p>
    </section>
  );
}
