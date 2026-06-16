"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, HardHat, Search, Wrench, X } from "lucide-react";
import type { WorkspaceEquipmentItem } from "@/services/projects/projectToolsService";
import { cn } from "@/lib/utils";
import styles from "./gantt.module.css";

export type GanttResourceDragPayload =
  | { kind: "employee"; id: string; name: string }
  | { kind: "equipment"; id: string; name: string; type: string | null };

export const GANTT_RESOURCE_MIME = "application/x-gantt-resource";

export type GanttEmployeeResource = {
  id: string;
  name: string;
  taskCount: number;
  overdueCount: number;
};

type Props = {
  employees: GanttEmployeeResource[];
  equipment: WorkspaceEquipmentItem[];
  canEdit: boolean;
  loading?: boolean;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const KNOWN_CATEGORIES = new Set(["machine", "tool", "vehicle", "building", "other"]);

function equipmentStatusColor(status: string): string {
  switch (status) {
    case "available":
      return "#16a34a";
    case "assigned":
      return "#2563eb";
    case "in_service":
      return "#e06737";
    default:
      return "#94a3b8";
  }
}

export function GanttResourcePanel({
  employees,
  equipment,
  canEdit,
  loading,
  onClose,
  t,
}: Props) {
  const [query, setQuery] = useState("");
  const [showEmployees, setShowEmployees] = useState(true);
  const [showEquipment, setShowEquipment] = useState(true);

  const q = query.trim().toLowerCase();
  const filteredEmployees = useMemo(
    () => (q ? employees.filter((e) => e.name.toLowerCase().includes(q)) : employees),
    [employees, q]
  );
  const filteredEquipment = useMemo(
    () => (q ? equipment.filter((e) => e.name.toLowerCase().includes(q)) : equipment),
    [equipment, q]
  );

  const setDragData = (e: React.DragEvent, payload: GanttResourceDragPayload) => {
    e.dataTransfer.setData(GANTT_RESOURCE_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside className={styles.resourcePanel} aria-label={t("gantt.resources.title")}>
      <div className={styles.resourceHeader}>
        <span className={styles.resourceTitle}>{t("gantt.resources.title")}</span>
        <button
          type="button"
          className={styles.resourceClose}
          onClick={onClose}
          aria-label={t("gantt.resources.close")}
        >
          <X className="size-4" />
        </button>
      </div>

      {canEdit ? (
        <p className={styles.resourceHint}>{t("gantt.resources.hint")}</p>
      ) : (
        <p className={styles.resourceHint}>{t("gantt.resources.readonly")}</p>
      )}

      <div className={styles.resourceSearch}>
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("gantt.resources.search")}
          className={styles.resourceSearchInput}
        />
      </div>

      <div className={styles.resourceScroll}>
        <button
          type="button"
          className={styles.resourceSectionHead}
          onClick={() => setShowEmployees((v) => !v)}
        >
          {showEmployees ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          <HardHat className="size-3.5" />
          <span>{t("gantt.resources.employees")}</span>
          <span className={styles.resourceCount}>{filteredEmployees.length}</span>
        </button>

        {showEmployees ? (
          <div className={styles.resourceList}>
            {filteredEmployees.length === 0 ? (
              <p className={styles.resourceEmpty}>{t("gantt.resources.noEmployees")}</p>
            ) : (
              filteredEmployees.map((emp) => (
                <div
                  key={emp.id}
                  className={cn(styles.resourceChip, canEdit && styles.resourceChipDraggable)}
                  draggable={canEdit}
                  onDragStart={(e) =>
                    setDragData(e, { kind: "employee", id: emp.id, name: emp.name })
                  }
                  title={canEdit ? t("gantt.resources.dragEmployee") : undefined}
                >
                  <span className={styles.resourceAvatar} aria-hidden>
                    {initials(emp.name)}
                  </span>
                  <span className={styles.resourceChipBody}>
                    <span className={styles.resourceChipName}>{emp.name}</span>
                    <span className={styles.resourceChipMeta}>
                      {emp.taskCount > 0
                        ? t("gantt.resources.taskCount", { count: emp.taskCount })
                        : t("gantt.resources.free")}
                      {emp.overdueCount > 0
                        ? ` · ${t("gantt.resources.overdueCount", { count: emp.overdueCount })}`
                        : ""}
                    </span>
                  </span>
                  <span
                    className={styles.resourceStatusDot}
                    style={{
                      background: emp.overdueCount > 0
                        ? "#e06737"
                        : emp.taskCount > 0
                          ? "#2563eb"
                          : "#16a34a",
                    }}
                    aria-hidden
                  />
                </div>
              ))
            )}
          </div>
        ) : null}

        <button
          type="button"
          className={styles.resourceSectionHead}
          onClick={() => setShowEquipment((v) => !v)}
        >
          {showEquipment ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          <Wrench className="size-3.5" />
          <span>{t("gantt.resources.equipment")}</span>
          <span className={styles.resourceCount}>{filteredEquipment.length}</span>
        </button>

        {showEquipment ? (
          <div className={styles.resourceList}>
            {loading ? (
              <p className={styles.resourceEmpty}>{t("gantt.resources.loading")}</p>
            ) : filteredEquipment.length === 0 ? (
              <p className={styles.resourceEmpty}>{t("gantt.resources.noEquipment")}</p>
            ) : (
              filteredEquipment.map((eq) => (
                <div
                  key={eq.id}
                  className={cn(styles.resourceChip, canEdit && styles.resourceChipDraggable)}
                  draggable={canEdit}
                  onDragStart={(e) =>
                    setDragData(e, {
                      kind: "equipment",
                      id: eq.id,
                      name: eq.name,
                      type: eq.type,
                    })
                  }
                  title={canEdit ? t("gantt.resources.dragEquipment") : undefined}
                >
                  <span className={styles.resourceEquipIcon} aria-hidden>
                    <Wrench className="size-3.5" />
                  </span>
                  <span className={styles.resourceChipBody}>
                    <span className={styles.resourceChipName}>{eq.name}</span>
                    {eq.type ? (
                      <span className={styles.resourceChipMeta}>
                        {KNOWN_CATEGORIES.has(eq.type)
                          ? t(`equipment.category.${eq.type}`)
                          : eq.type}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={styles.resourceStatusDot}
                    style={{ background: equipmentStatusColor(eq.status) }}
                    title={t(`gantt.resources.status.${eq.status}`)}
                    aria-hidden
                  />
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
