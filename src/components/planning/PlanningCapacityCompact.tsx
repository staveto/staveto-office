"use client";

import { HardHat, Truck, AlertTriangle } from "lucide-react";
import type { PlanningOverviewMetrics } from "@/lib/planningSummaryMetrics";
import styles from "./gantt.module.css";

type PlanningCapacityCompactProps = {
  metrics: PlanningOverviewMetrics;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function PlanningCapacityCompact({ metrics, t }: PlanningCapacityCompactProps) {
  return (
    <section className={styles.capacityCompact} aria-label={t("planning.capacityCompact.title")}>
      <h2 className={styles.overviewHeading}>{t("planning.capacityCompact.title")}</h2>
      <div className={styles.capacityCompactGrid}>
        <div className={styles.capacityCompactItem}>
          <HardHat className="size-4 text-[#1D376A]" />
          <div>
            <p className={styles.capacityCompactValue}>{metrics.workersActiveToday}</p>
            <p className={styles.capacityCompactLabel}>{t("planning.capacityCompact.workersToday")}</p>
          </div>
        </div>
        <div className={styles.capacityCompactItem}>
          <AlertTriangle className="size-4 text-amber-600" />
          <div>
            <p className={styles.capacityCompactValue}>{metrics.overloadedWorkers}</p>
            <p className={styles.capacityCompactLabel}>{t("planning.capacityCompact.overloaded")}</p>
          </div>
        </div>
        <div className={styles.capacityCompactItem}>
          <Truck className="size-4 text-[#1D376A]" />
          <div>
            <p className={styles.capacityCompactValue}>{metrics.equipmentInUseToday}</p>
            <p className={styles.capacityCompactLabel}>{t("planning.capacityCompact.equipmentToday")}</p>
          </div>
        </div>
        <div className={styles.capacityCompactItem}>
          <AlertTriangle className="size-4 text-[#e06737]" />
          <div>
            <p className={styles.capacityCompactValue}>
              {metrics.resourceConflicts === null ? "—" : metrics.resourceConflicts}
            </p>
            <p className={styles.capacityCompactLabel}>{t("planning.capacityCompact.conflicts")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
