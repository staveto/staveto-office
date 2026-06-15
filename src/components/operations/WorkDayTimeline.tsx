"use client";

import type { WorkDayTimelineItem } from "@/lib/workDayReport";
import { toHoursMinutes } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./workDay.module.css";

type Props = {
  items: WorkDayTimelineItem[];
  t: (key: string, params?: Record<string, string | number>) => string;
};

const KIND_LABEL: Record<WorkDayTimelineItem["kind"], string> = {
  start: "workDay.timeline.start",
  stop: "workDay.timeline.stop",
  task: "workDay.timeline.task",
  entry: "workDay.timeline.entry",
  photo: "workDay.timeline.photo",
  problem: "workDay.timeline.problem",
  note: "workDay.timeline.note",
};

function dotClass(kind: WorkDayTimelineItem["kind"]): string {
  if (kind === "start") return cn(styles.timelineDot, styles.timelineDotStart);
  if (kind === "stop") return cn(styles.timelineDot, styles.timelineDotStop);
  if (kind === "problem") return cn(styles.timelineDot, styles.timelineDotProblem);
  if (kind === "photo") return cn(styles.timelineDot, styles.timelineDotPhoto);
  return styles.timelineDot;
}

export function WorkDayTimeline({ items, t }: Props) {
  return (
    <section className={styles.card}>
      <h2 className={cn(styles.sectionTitle, "mb-4")}>{t("workDay.timeline.title")}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("workDay.timeline.empty")}</p>
      ) : (
        <ul className={styles.timelineList}>
          {items.map((item) => (
            <li key={item.id} className={styles.timelineRow}>
              <span className={dotClass(item.kind)} aria-hidden />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <time className="text-xs font-bold tabular-nums text-muted-foreground">
                  {item.time}
                </time>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#e06737]">
                  {t(KIND_LABEL[item.kind])}
                </span>
              </div>
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              {item.subtitle ? (
                <p className="text-xs text-muted-foreground">{item.subtitle}</p>
              ) : null}
              {item.projectName ? (
                <p className="text-xs text-[#1D376A]">{item.projectName}</p>
              ) : null}
              {typeof item.durationMinutes === "number" && item.durationMinutes > 0 ? (
                <p className="text-xs font-medium text-muted-foreground">
                  {toHoursMinutes(item.durationMinutes)}
                </p>
              ) : null}
              {item.badge ? (
                <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  {item.badge}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
