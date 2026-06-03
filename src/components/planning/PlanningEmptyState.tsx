"use client";

import styles from "./planning.module.css";
import { cn } from "@/lib/utils";

type PlanningEmptyStateProps = {
  title: string;
  description?: string;
  className?: string;
};

export function PlanningEmptyState({
  title,
  description,
  className,
}: PlanningEmptyStateProps) {
  return (
    <div className={cn(styles.emptyState, className)}>
      <p className={styles.emptyStateTitle}>{title}</p>
      {description ? <p className={styles.emptyStateText}>{description}</p> : null}
    </div>
  );
}
