"use client";

import Link from "next/link";
import type { DayTimelineEvent } from "@/lib/operationsMetrics";
import { todayYmd, workDayReportHref } from "@/services/operations/workDayReportService";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  events: DayTimelineEvent[];
  t: (key: string, params?: Record<string, string | number>) => string;
  dateYmd?: string;
};

const KIND_KEY: Record<DayTimelineEvent["kind"], string> = {
  timer_started: "operations.timeline.timerStarted",
  timer_paused: "operations.timeline.timerPaused",
  timer_stopped: "operations.timeline.timerStopped",
  entry_logged: "operations.timeline.entryLogged",
};

export function DayTimelineFeed({ events, t, dateYmd }: Props) {
  const day = dateYmd ?? todayYmd();

  return (
    <section className={cn(styles.sectionCard, styles.timelineDeemphasized)}>
      <p className={styles.sectionIntent}>{t("operations.layout.intent.timeline")}</p>
      <h2 className={cn(styles.sectionTitle, "mb-3")}>{t("operations.timeline.title")}</h2>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("operations.timeline.empty")}</p>
      ) : (
        <ul>
          {events.map((ev) => {
            const href = ev.userId ? workDayReportHref(ev.userId, day) : undefined;
            const content = (
              <>
                <time className={styles.timelineTime}>{ev.time}</time>
                <div>
                  <p className="text-sm font-semibold">{ev.actorName}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(KIND_KEY[ev.kind])}
                    {ev.projectName ? ` · ${ev.projectName}` : ""}
                    {ev.detail ? ` · ${ev.detail}` : ""}
                  </p>
                </div>
              </>
            );
            return (
              <li key={ev.id} className={styles.timelineItem}>
                {href ? (
                  <Link href={href} className="flex w-full gap-3 hover:opacity-90">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
