"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import styles from "./gantt.module.css";

export type TaskGanttContextAction = "editDates" | "shiftLater" | "extend1" | "extend3";

export type TaskGanttContextMenuState = {
  projectId: string;
  taskId: string;
  x: number;
  y: number;
};

type Props = {
  menu: TaskGanttContextMenuState | null;
  onClose: () => void;
  onAction: (action: TaskGanttContextAction) => void;
  t: (key: string) => string;
};

export function TaskGanttContextMenu({ menu, onClose, onAction, t }: Props) {
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [menu, onClose]);

  if (!menu || typeof document === "undefined") return null;

  const items: { action: TaskGanttContextAction; labelKey: string }[] = [
    { action: "editDates", labelKey: "planning.gantt.context.editDates" },
    { action: "shiftLater", labelKey: "planning.gantt.context.shiftLater" },
    { action: "extend1", labelKey: "planning.gantt.context.extend1" },
    { action: "extend3", labelKey: "planning.gantt.context.extend3" },
  ];

  return createPortal(
    <div
      className={styles.taskContextMenu}
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={styles.taskContextMenuItem}
          onClick={() => {
            onAction(item.action);
            onClose();
          }}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>,
    document.body
  );
}
