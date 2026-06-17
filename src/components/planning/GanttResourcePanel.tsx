"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Building2,
  Car,
  ChevronDown,
  ChevronRight,
  Cog,
  GripVertical,
  HardHat,
  Package,
  Plus,
  Search,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkspaceEquipmentItem } from "@/services/projects/projectToolsService";
import { cn } from "@/lib/utils";
import { GanttResourceBasket } from "./GanttResourceBasket";
import { basketItemKey, handleResourceDragEnd, setResourceDragData } from "./ganttResourceDrag";
import styles from "./gantt.module.css";

export type GanttResourceDragPayload =
  | { kind: "employee"; id: string; name: string }
  | { kind: "equipment"; id: string; name: string; type: string | null };

export { GANTT_RESOURCE_MIME, GANTT_BASKET_MIME } from "./ganttResourceDrag";

export type GanttEmployeeResource = {
  id: string;
  name: string;
  taskCount: number;
  overdueCount: number;
  photoUrl?: string;
};

const AVATAR_COLORS = [
  "#1D376A",
  "#E06737",
  "#0F766E",
  "#7C3AED",
  "#B45309",
  "#0369A1",
  "#9D174D",
  "#15803D",
];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  vehicle: Car,
  machine: Cog,
  tool: Wrench,
  building: Building2,
  other: Package,
};

function equipmentIcon(type: string | null): LucideIcon {
  return (type && CATEGORY_ICON[type]) || Package;
}

type Props = {
  employees: GanttEmployeeResource[];
  equipment: WorkspaceEquipmentItem[];
  canEdit: boolean;
  loading?: boolean;
  basketItems: GanttResourceDragPayload[];
  onAddToBasket: (item: GanttResourceDragPayload) => void;
  onRemoveFromBasket: (key: string) => void;
  onClearBasket: () => void;
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
  basketItems,
  onAddToBasket,
  onRemoveFromBasket,
  onClearBasket,
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

  const basketKeys = useMemo(
    () => new Set(basketItems.map(basketItemKey)),
    [basketItems]
  );

  const startDrag = (e: React.DragEvent, payload: GanttResourceDragPayload) => {
    setResourceDragData(e, payload);
  };

  return (
    <aside className={styles.resourcePanel} aria-label={t("gantt.resources.title")}>
      <div className={styles.resourceHeader}>
        <span className={styles.resourceTitle}>
          <span className={styles.resourceTitleIcon} aria-hidden>
            <HardHat className="size-4" />
          </span>
          {t("gantt.resources.title")}
        </span>
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
        <p className={styles.resourceHint}>{t("gantt.resources.hintBasket")}</p>
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
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <span className={cn(styles.resourceSectionIcon, styles.resourceSectionIconTeam)}>
            <HardHat className="size-4" />
          </span>
          <span>{t("gantt.resources.employees")}</span>
          <span className={styles.resourceCount}>{filteredEmployees.length}</span>
        </button>

        {showEmployees ? (
          <div className={styles.resourceList}>
            {filteredEmployees.length === 0 ? (
              <p className={styles.resourceEmpty}>{t("gantt.resources.noEmployees")}</p>
            ) : (
              filteredEmployees.map((emp) => {
                const payload: GanttResourceDragPayload = {
                  kind: "employee",
                  id: emp.id,
                  name: emp.name,
                };
                const inBasket = basketKeys.has(basketItemKey(payload));
                const statusColor =
                  emp.overdueCount > 0 ? "#e06737" : emp.taskCount > 0 ? "#2563eb" : "#16a34a";
                return (
                <div
                  key={emp.id}
                  className={cn(styles.resourceChip, canEdit && styles.resourceChipDraggable)}
                >
                  {canEdit ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className={styles.resourceDragHandle}
                      draggable
                      onDragStart={(e) => startDrag(e, payload)}
                      onDragEnd={handleResourceDragEnd}
                      title={t("gantt.resources.dragEmployee")}
                      aria-label={t("gantt.resources.dragEmployee")}
                    >
                      <GripVertical className="size-4" aria-hidden />
                    </span>
                  ) : null}
                  <span
                    className={styles.resourceAvatar}
                    style={{ background: avatarColor(emp.id) }}
                    aria-hidden
                  >
                    {emp.photoUrl ? (
                      <Image
                        src={emp.photoUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="pointer-events-none object-cover select-none"
                        draggable={false}
                        unoptimized
                      />
                    ) : (
                      initials(emp.name)
                    )}
                    <span
                      className={styles.resourceAvatarDot}
                      style={{ background: statusColor }}
                    />
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
                  {canEdit ? (
                    <button
                      type="button"
                      className={cn(styles.resourceAddBtn, inBasket && styles.resourceAddBtnActive)}
                      onClick={() => onAddToBasket(payload)}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={t(inBasket ? "gantt.basket.inBasket" : "gantt.basket.add")}
                      aria-pressed={inBasket}
                    >
                      <Plus className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
              })
            )}
          </div>
        ) : null}

        <button
          type="button"
          className={styles.resourceSectionHead}
          onClick={() => setShowEquipment((v) => !v)}
        >
          {showEquipment ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <span className={cn(styles.resourceSectionIcon, styles.resourceSectionIconEquip)}>
            <Wrench className="size-4" />
          </span>
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
              filteredEquipment.map((eq) => {
                const payload: GanttResourceDragPayload = {
                  kind: "equipment",
                  id: eq.id,
                  name: eq.name,
                  type: eq.type,
                };
                const inBasket = basketKeys.has(basketItemKey(payload));
                const EquipIcon = equipmentIcon(eq.type);
                return (
                <div
                  key={eq.id}
                  className={cn(styles.resourceChip, canEdit && styles.resourceChipDraggable)}
                >
                  {canEdit ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className={styles.resourceDragHandle}
                      draggable
                      onDragStart={(e) => startDrag(e, payload)}
                      onDragEnd={handleResourceDragEnd}
                      title={t("gantt.resources.dragEquipment")}
                      aria-label={t("gantt.resources.dragEquipment")}
                    >
                      <GripVertical className="size-4" aria-hidden />
                    </span>
                  ) : null}
                  <span className={styles.resourceEquipThumb} aria-hidden>
                    {eq.photoUrl ? (
                      <Image
                        src={eq.photoUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="pointer-events-none object-cover select-none"
                        draggable={false}
                        unoptimized
                      />
                    ) : (
                      <EquipIcon className="size-5" strokeWidth={2} />
                    )}
                    <span
                      className={styles.resourceAvatarDot}
                      style={{ background: equipmentStatusColor(eq.status) }}
                    />
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
                  {canEdit ? (
                    <button
                      type="button"
                      className={cn(styles.resourceAddBtn, inBasket && styles.resourceAddBtnActive)}
                      onClick={() => onAddToBasket(payload)}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={t(inBasket ? "gantt.basket.inBasket" : "gantt.basket.add")}
                      aria-pressed={inBasket}
                    >
                      <Plus className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
              })
            )}
          </div>
        ) : null}
      </div>

      <GanttResourceBasket
        items={basketItems}
        canEdit={canEdit}
        onRemove={onRemoveFromBasket}
        onClear={onClearBasket}
        t={t}
      />
    </aside>
  );
}
