"use client";

import { Bell, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import styles from "./gantt.module.css";

export type ScheduleChangeToastState = {
  taskTitle: string;
  oldRange: string;
  newRange: string;
};

type ScheduleChangeToastProps = {
  toast: ScheduleChangeToastState | null;
  onDismiss: () => void;
  onUndo?: () => void;
  onNotify?: () => void;
  undoDisabled?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ScheduleChangeToast({
  toast,
  onDismiss,
  onUndo,
  onNotify,
  undoDisabled,
  t,
}: ScheduleChangeToastProps) {
  if (!toast) return null;

  return (
    <div className={styles.scheduleToast} role="status" aria-live="polite">
      <div className="min-w-0 flex-1">
        <p className={styles.scheduleToastTitle}>{t("planning.scheduleToast.saved")}</p>
        <p className={styles.scheduleToastTask}>{toast.taskTitle}</p>
        <p className={styles.scheduleToastRange}>
          {toast.oldRange} → <strong>{toast.newRange}</strong>
        </p>
      </div>
      <div className={styles.scheduleToastActions}>
        {onUndo ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={undoDisabled}
            onClick={onUndo}
            title={undoDisabled ? t("planning.scheduleToast.undoSoon") : undefined}
          >
            <RotateCcw className="mr-1 size-3.5" />
            {t("planning.scheduleToast.undo")}
          </Button>
        ) : null}
        {onNotify ? (
          <Button type="button" size="sm" variant="outline" onClick={onNotify}>
            <Bell className="mr-1 size-3.5" />
            {t("planning.scheduleToast.notify")}
          </Button>
        ) : null}
        <button type="button" className={styles.scheduleToastClose} onClick={onDismiss}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

type PlanningNotifyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle?: string;
  onConfirm?: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function PlanningNotifyDialog({
  open,
  onOpenChange,
  taskTitle,
  onConfirm,
  t,
}: PlanningNotifyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("planning.notify.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {taskTitle
            ? t("planning.notify.bodyTask", { task: taskTitle })
            : t("planning.notify.body")}
        </p>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <input type="checkbox" defaultChecked disabled className="size-4" />
            {t("planning.notify.assignedWorker")}
          </li>
          <li className="flex items-center gap-2">
            <input type="checkbox" defaultChecked className="size-4" />
            {t("planning.notify.projectTeam")}
          </li>
          <li className="flex items-center gap-2">
            <input type="checkbox" className="size-4" />
            {t("planning.notify.manager")}
          </li>
          <li className="flex items-center gap-2 opacity-50">
            <input type="checkbox" disabled className="size-4" />
            {t("planning.notify.customer")}
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">{t("planning.notify.placeholder")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button className="bg-[#1D376A]" onClick={() => { onConfirm?.(); onOpenChange(false); }}>
            {t("planning.notify.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
