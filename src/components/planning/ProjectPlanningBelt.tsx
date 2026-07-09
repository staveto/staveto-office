"use client";

import Link from "next/link";
import type { ProjectCardSummary } from "@/lib/planningSummaryMetrics";
import { ProjectPlanningCard } from "./ProjectPlanningCard";
import styles from "./gantt.module.css";

type ProjectPlanningBeltProps = {
  projects: ProjectCardSummary[];
  selectedProjectId?: string;
  ganttBasePath?: string;
  onEditDates?: (projectId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectPlanningBelt({
  projects,
  selectedProjectId = "all",
  ganttBasePath = "/app/planning/gantt",
  onEditDates,
  t,
}: ProjectPlanningBeltProps) {
  if (projects.length === 0) {
    return (
      <section className={styles.projectBeltSection}>
        <h2 className={styles.overviewHeading}>{t("planning.projectBelt.title")}</h2>
        <p className={styles.emptyHint}>{t("planning.empty.noActiveProjects")}</p>
      </section>
    );
  }

  return (
    <section className={styles.projectBeltSection} aria-label={t("planning.projectBelt.title")}>
      <div className={styles.projectBeltHeader}>
        <div>
          <h2 className={styles.overviewHeading}>{t("planning.projectBelt.title")}</h2>
          <p className={styles.projectBeltSubtitle}>{t("planning.projectBelt.subtitle")}</p>
        </div>
        {selectedProjectId !== "all" ? (
          <Link href={ganttBasePath} className={styles.projectBeltShowAll}>
            {t("planning.projectBelt.showAll")}
          </Link>
        ) : null}
      </div>
      <div className={styles.projectBeltScroll}>
        {projects.map((summary) => (
          <ProjectPlanningCard
            key={summary.projectId}
            summary={summary}
            selected={selectedProjectId === summary.projectId}
            ganttBasePath={ganttBasePath}
            onEditDates={onEditDates}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}
