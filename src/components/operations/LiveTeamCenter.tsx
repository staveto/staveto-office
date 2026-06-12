"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TeamLiveStatusItem } from "@/lib/operationsMetrics";
import {
  formatTimerHms,
  formatTimeShort,
  memberInitials,
} from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  members: TeamLiveStatusItem[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

const STATUS_CLASS: Record<TeamLiveStatusItem["status"], string> = {
  working: styles.memberCardWorking,
  paused: styles.memberCardPaused,
  absent: styles.memberCardAbsent,
  not_started: styles.memberCardIdle,
  offline: styles.memberCardIdle,
};

const STATUS_DOT: Record<TeamLiveStatusItem["status"], string> = {
  working: "bg-emerald-500",
  paused: "bg-amber-500",
  absent: "bg-rose-500",
  not_started: "bg-slate-400",
  offline: "bg-indigo-400",
};

function liveSeconds(member: TeamLiveStatusItem, tick: number): number | null {
  void tick;
  return typeof member.timerSeconds === "number" ? member.timerSeconds : null;
}

export function LiveTeamCenter({ members, t }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const hasLive = members.some((m) => m.status === "working");
    if (!hasLive) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [members]);

  const sorted = [...members].sort((a, b) => {
    const order = { working: 0, paused: 1, offline: 2, not_started: 3, absent: 4 };
    return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
  });

  return (
    <section className={styles.sectionCard}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className={styles.sectionTitle}>{t("operations.liveTeam.title")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("operations.liveTeam.subtitle")}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operations.noActiveTimers")}</p>
      ) : (
        <div className={styles.teamGrid}>
          {sorted.map((member) => {
            const secs = liveSeconds(member, tick);
            const showTimer =
              (member.status === "working" || member.status === "paused") && secs !== null;
            const cardClass = STATUS_CLASS[member.status];

            return (
              <article
                key={member.uid}
                className={cn(styles.memberCard, cardClass)}
              >
                <div className="flex items-start gap-3">
                  <div className={styles.avatar} aria-hidden>
                    {memberInitials(member.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-foreground">
                        {member.name}
                      </p>
                      <span className={styles.statusPill}>
                        <span
                          className={cn(styles.statusDot, STATUS_DOT[member.status])}
                          aria-hidden
                        />
                        {t(`operations.status.${member.status}`)}
                      </span>
                    </div>

                    {member.status === "absent" ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("operations.liveTeam.onLeave")}
                      </p>
                    ) : member.status === "not_started" ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("operations.liveTeam.notStartedToday")}
                      </p>
                    ) : (
                      <>
                        {member.projectName ? (
                          <p className="mt-1 truncate text-sm font-medium text-[#1D376A] dark:text-slate-200">
                            {member.projectId ? (
                              <Link
                                href={`/app/projects/${member.projectId}`}
                                className="hover:underline"
                              >
                                {member.projectName}
                              </Link>
                            ) : (
                              member.projectName
                            )}
                          </p>
                        ) : null}
                        {member.taskName ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {member.taskName}
                          </p>
                        ) : null}
                        {showTimer ? (
                          <p
                            className={cn(
                              styles.timerDisplay,
                              "mt-2",
                              member.status === "paused" && styles.timerPaused
                            )}
                          >
                            {formatTimerHms(
                              member.status === "working" ? secs + tick : secs
                            )}
                          </p>
                        ) : null}
                        {member.startedAt && member.status === "working" ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("operations.liveTeam.since", {
                              time: formatTimeShort(member.startedAt),
                            })}
                          </p>
                        ) : null}
                        {member.status === "paused" && member.pauseSince ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                            {t("operations.liveTeam.pauseSince", {
                              time: formatTimeShort(member.pauseSince),
                            })}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
