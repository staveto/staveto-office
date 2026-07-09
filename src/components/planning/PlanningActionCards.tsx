"use client";

import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  ClipboardList,
  UserX,
} from "lucide-react";
import type { PlanningOverviewMetrics } from "@/lib/planningSummaryMetrics";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

type PlanningActionCardsProps = {
  metrics: PlanningOverviewMetrics;
  onFilter?: (filter: "delayed" | "overdue" | "unassigned" | "conflicts" | "today") => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

type CardDef = {
  id: string;
  labelKey: string;
  value: number | string;
  icon: typeof Briefcase;
  tone: "default" | "warn" | "danger" | "action";
  filter?: "delayed" | "overdue" | "unassigned" | "conflicts" | "today";
};

export function PlanningActionCards({ metrics, onFilter, t }: PlanningActionCardsProps) {
  const cards: CardDef[] = [
    {
      id: "active",
      labelKey: "planning.action.activeProjects",
      value: metrics.totalActiveProjects,
      icon: Briefcase,
      tone: "default",
    },
    {
      id: "delayed",
      labelKey: "planning.action.delayedProjects",
      value: metrics.delayedProjects,
      icon: AlertTriangle,
      tone: metrics.delayedProjects > 0 ? "danger" : "default",
      filter: "delayed",
    },
    {
      id: "overdue",
      labelKey: "planning.action.overdueTasks",
      value: metrics.overdueTasks,
      icon: CalendarClock,
      tone: metrics.overdueTasks > 0 ? "danger" : "default",
      filter: "overdue",
    },
    {
      id: "unassigned",
      labelKey: "planning.action.unassignedTasks",
      value: metrics.unassignedTasks,
      icon: UserX,
      tone: metrics.unassignedTasks > 0 ? "warn" : "default",
      filter: "unassigned",
    },
    {
      id: "conflicts",
      labelKey: "planning.action.resourceConflicts",
      value: metrics.resourceConflicts === null ? "—" : metrics.resourceConflicts,
      icon: AlertTriangle,
      tone: metrics.resourceConflicts ? "warn" : "default",
      filter: "conflicts",
    },
    {
      id: "today",
      labelKey: "planning.action.needsToday",
      value: metrics.needsAttentionToday,
      icon: ClipboardList,
      tone: metrics.needsAttentionToday > 0 ? "action" : "default",
      filter: "today",
    },
  ];

  return (
    <section className={styles.actionCardsSection} aria-label={t("planning.action.title")}>
      <div className={styles.actionCardsGrid}>
        {cards.map(({ id, labelKey, value, icon: Icon, tone, filter }) => {
          const clickable = !!filter && !!onFilter;
          const Tag = clickable ? "button" : "div";
          return (
            <Tag
              key={id}
              type={clickable ? "button" : undefined}
              className={cn(styles.actionCard, styles[`actionCardTone_${tone}`])}
              onClick={clickable && filter ? () => onFilter(filter) : undefined}
            >
              <span className={styles.actionCardIcon} aria-hidden>
                <Icon className="size-5" />
              </span>
              <p className={styles.actionCardValue}>{value}</p>
              <p className={styles.actionCardLabel}>{t(labelKey)}</p>
            </Tag>
          );
        })}
      </div>
    </section>
  );
}
