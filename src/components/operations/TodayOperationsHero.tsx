"use client";

import type { TodayOverviewMetrics } from "@/lib/operationsMetrics";
import { toHoursMinutes } from "@/lib/operationsMetrics";
import { cn } from "@/lib/utils";
import styles from "./operations.module.css";

type Props = {
  metrics: TodayOverviewMetrics;
  t: (key: string, params?: Record<string, string | number>) => string;
};

type Tile = {
  icon: string;
  labelKey: string;
  value: string | number;
};

export function TodayOperationsHero({ metrics, t }: Props) {
  const tiles: Tile[] = [
    { icon: "👷", labelKey: "operations.hero.working", value: metrics.activeWorkers },
    { icon: "☕", labelKey: "operations.hero.onBreak", value: metrics.onBreak },
    { icon: "🏖", labelKey: "operations.hero.absent", value: metrics.absent },
    { icon: "⏱", labelKey: "operations.hero.activeTimers", value: metrics.runningTimers },
    { icon: "📋", labelKey: "operations.hero.tasksToday", value: metrics.tasksPlannedToday },
    { icon: "⚠", labelKey: "operations.hero.unassigned", value: metrics.unassignedTasks },
    { icon: "🛠", labelKey: "operations.hero.noTools", value: metrics.tasksWithoutTools },
    {
      icon: "⏳",
      labelKey: "operations.hero.investedToday",
      value: toHoursMinutes(metrics.trackedMinutesToday),
    },
  ];

  return (
    <section className={cn(styles.sectionCard, styles.heroCompact)}>
      <p className={styles.sectionIntent}>{t("operations.layout.intent.today")}</p>
      <h2 className={cn(styles.sectionTitle, "mb-4")}>{t("operations.hero.title")}</h2>
      <div className={styles.heroGrid}>
        {tiles.map((tile) => (
          <div key={tile.labelKey} className={styles.heroTile}>
            <div className={styles.heroIcon} aria-hidden>
              {tile.icon}
            </div>
            <div className={styles.heroValue}>{tile.value}</div>
            <div className={styles.heroLabel}>{t(tile.labelKey)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
