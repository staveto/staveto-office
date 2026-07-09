"use client";

import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  Layers,
  ListTodo,
  Truck,
  UserX,
  Users,
} from "lucide-react";
import type { PlanningOverviewMetrics } from "@/lib/planningSummaryMetrics";
import styles from "./gantt.module.css";

type PlanningOverviewCardsProps = {
  metrics: PlanningOverviewMetrics;
  t: (key: string, params?: Record<string, string | number>) => string;
};

type CardDef = {
  key: string;
  labelKey: string;
  value: number | string;
  icon: typeof Briefcase;
  tone?: "default" | "warn" | "danger" | "muted";
  placeholder?: boolean;
};

export function PlanningOverviewCards({ metrics, t }: PlanningOverviewCardsProps) {
  const cards: CardDef[] = [
    {
      key: "active",
      labelKey: "planning.overview.activeProjects",
      value: metrics.totalActiveProjects,
      icon: Briefcase,
    },
    {
      key: "openProjects",
      labelKey: "planning.overview.openProjects",
      value: metrics.openProjects,
      icon: Layers,
    },
    {
      key: "delayed",
      labelKey: "planning.overview.delayedProjects",
      value: metrics.delayedProjects,
      icon: AlertTriangle,
      tone: metrics.delayedProjects > 0 ? "warn" : "default",
    },
    {
      key: "openPhases",
      labelKey: "planning.overview.openPhases",
      value: metrics.openPhases,
      icon: Layers,
    },
    {
      key: "openTasks",
      labelKey: "planning.overview.openTasks",
      value: metrics.openTasks,
      icon: ListTodo,
    },
    {
      key: "unassigned",
      labelKey: "planning.overview.unassignedTasks",
      value: metrics.unassignedTasks,
      icon: UserX,
      tone: metrics.unassignedTasks > 0 ? "warn" : "default",
    },
    {
      key: "overdue",
      labelKey: "planning.overview.overdueTasks",
      value: metrics.overdueTasks,
      icon: CalendarClock,
      tone: metrics.overdueTasks > 0 ? "danger" : "default",
    },
    {
      key: "conflicts",
      labelKey: "planning.overview.resourceConflicts",
      value:
        metrics.resourceConflicts === null
          ? "—"
          : metrics.resourceConflicts,
      icon: AlertTriangle,
      tone: "muted",
      placeholder: metrics.resourceConflicts === null,
    },
    {
      key: "workersToday",
      labelKey: "planning.overview.workersToday",
      value: metrics.workersActiveToday,
      icon: Users,
    },
    {
      key: "equipmentToday",
      labelKey: "planning.overview.equipmentToday",
      value: metrics.equipmentInUseToday,
      icon: Truck,
    },
  ];

  return (
    <section className={styles.overviewSection} aria-label={t("planning.overview.title")}>
      <h2 className={styles.overviewHeading}>{t("planning.overview.title")}</h2>
      <div className={styles.overviewGrid}>
        {cards.map(({ key, labelKey, value, icon: Icon, tone = "default", placeholder }) => (
          <div
            key={key}
            className={styles.overviewCard}
            data-tone={tone}
            data-placeholder={placeholder ? "true" : undefined}
          >
            <span className={styles.overviewCardIcon} aria-hidden>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className={styles.overviewCardValue}>{value}</p>
              <p className={styles.overviewCardLabel}>{t(labelKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
