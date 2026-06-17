"use client";

import { HardHat, ShoppingBasket, Trash2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GanttResourceDragPayload } from "./GanttResourcePanel";
import {
  basketItemKey,
  handleResourceDragEnd,
  setBasketDragData,
  setResourceDragData,
} from "./ganttResourceDrag";
import styles from "./gantt.module.css";

type Props = {
  items: GanttResourceDragPayload[];
  canEdit: boolean;
  onRemove: (key: string) => void;
  onClear: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function GanttResourceBasket({ items, canEdit, onRemove, onClear, t }: Props) {
  if (!canEdit) return null;

  return (
    <div className={styles.resourceBasket}>
      <div className={styles.resourceBasketHead}>
        <span className={styles.resourceBasketTitle}>
          <ShoppingBasket className="size-3.5" aria-hidden />
          {t("gantt.basket.title")}
        </span>
        {items.length > 0 ? (
          <button
            type="button"
            className={styles.resourceBasketClear}
            onClick={onClear}
            title={t("gantt.basket.clear")}
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      <p className={styles.resourceBasketHint}>{t("gantt.basket.hint")}</p>

      <div
        className={cn(
          styles.resourceBasketDrop,
          items.length > 0 && styles.resourceBasketDropFilled
        )}
        draggable={items.length > 0}
        onDragStart={(e) => {
          if (items.length === 0) {
            e.preventDefault();
            return;
          }
          setBasketDragData(e, items);
        }}
        onDragEnd={handleResourceDragEnd}
      >
        {items.length === 0 ? (
          <span className={styles.resourceBasketEmpty}>{t("gantt.basket.empty")}</span>
        ) : (
          <div className={styles.resourceBasketChips}>
            {items.map((item) => {
              const key = basketItemKey(item);
              return (
                <div
                  key={key}
                  className={cn(styles.basketChip, styles.resourceChipDraggable)}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setResourceDragData(e, item);
                  }}
                  onDragEnd={handleResourceDragEnd}
                  title={t("gantt.basket.dragOne")}
                >
                  {item.kind === "employee" ? (
                    <span className={styles.basketChipAvatar} aria-hidden>
                      {initials(item.name)}
                    </span>
                  ) : (
                    <span className={styles.basketChipIcon} aria-hidden>
                      <Wrench className="size-3" />
                    </span>
                  )}
                  <span className={styles.basketChipName}>{item.name}</span>
                  <button
                    type="button"
                    className={styles.basketChipRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(key);
                    }}
                    aria-label={t("gantt.basket.remove")}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {items.length > 1 ? (
          <p className={styles.resourceBasketBulk}>
            <HardHat className="size-3 inline" aria-hidden /> {t("gantt.basket.dragAll")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
