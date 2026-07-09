"use client";

import { AlertTriangle, HardHat, Truck } from "lucide-react";
import type { GanttEmployeeResource } from "./GanttResourcePanel";
import type { WorkspaceEquipmentItem } from "@/services/projects/projectToolsService";
import styles from "./gantt.module.css";

type PlanningCapacitySummaryProps = {
  employees: GanttEmployeeResource[];
  equipment: WorkspaceEquipmentItem[];
  conflictCount: number | null;
  loading?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function PlanningCapacitySummary({
  employees,
  equipment,
  conflictCount,
  loading,
  t,
}: PlanningCapacitySummaryProps) {
  return (
    <section className={styles.capacitySection} aria-label={t("planning.capacity.title")}>
      <div className={styles.capacityHeader}>
        <h2 className={styles.overviewHeading}>{t("planning.capacity.title")}</h2>
        <p className={styles.projectBeltSubtitle}>{t("planning.capacity.subtitle")}</p>
      </div>

      <div className={styles.capacityConflictBanner}>
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <span>
          {conflictCount === null
            ? t("planning.capacity.conflictsPlaceholder")
            : t("planning.capacity.conflictsCount", { count: conflictCount })}
        </span>
      </div>

      <div className={styles.capacityGrid}>
        <div className={styles.capacityPanel}>
          <h3 className={styles.capacityPanelTitle}>
            <HardHat className="size-4" />
            {t("planning.capacity.team")}
          </h3>
          {loading ? (
            <p className={styles.emptyHint}>{t("gantt.resources.loading")}</p>
          ) : employees.length === 0 ? (
            <p className={styles.emptyHint}>{t("planning.empty.noWorkers")}</p>
          ) : (
            <ul className={styles.capacityList}>
              {employees.map((emp) => (
                <li key={emp.id} className={styles.capacityRow}>
                  <span className={styles.capacityRowName}>{emp.name}</span>
                  <span className={styles.capacityRowMeta}>
                    {emp.taskCount > 0
                      ? t("gantt.resources.taskCount", { count: emp.taskCount })
                      : t("gantt.resources.free")}
                    {emp.overdueCount > 0
                      ? ` · ${t("gantt.resources.overdueCount", { count: emp.overdueCount })}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.capacityPanel}>
          <h3 className={styles.capacityPanelTitle}>
            <Truck className="size-4" />
            {t("planning.capacity.equipment")}
          </h3>
          {loading ? (
            <p className={styles.emptyHint}>{t("gantt.resources.loading")}</p>
          ) : equipment.length === 0 ? (
            <p className={styles.emptyHint}>{t("planning.empty.noEquipment")}</p>
          ) : (
            <ul className={styles.capacityList}>
              {equipment.map((eq) => (
                <li key={eq.id} className={styles.capacityRow}>
                  <span className={styles.capacityRowName}>{eq.name}</span>
                  <span className={styles.capacityRowMeta}>
                    {eq.assignedProjectId
                      ? t("planning.capacity.equipmentAssigned")
                      : t("planning.capacity.equipmentFree")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
