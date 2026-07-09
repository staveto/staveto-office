"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaskDoc } from "@/lib/projects";
import {
  applyDurationChange,
  applyQuickShift,
  buildTaskSchedulePatchFromDraft,
  countWorkingDaysInclusive,
  taskDateDraftFromDoc,
  type TaskDateDraft,
} from "@/lib/planningDateRange";
import { updateTaskSchedule } from "@/services/planning/ganttPlanningService";

export type DateRangeSaveResult = {
  taskTitle: string;
  oldRange: string;
  newRange: string;
  patch: {
    plannedStart: string;
    plannedEnd: string | null;
    dueDate: string;
  };
};

type PlanningDateRangeEditorProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  task: TaskDoc;
  canEdit: boolean;
  onSaved: (result: DateRangeSaveResult) => void;
  onNotifyRequest?: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function formatRange(draft: TaskDateDraft): string {
  if (draft.plannedStart === draft.plannedEnd) return draft.plannedStart;
  return `${draft.plannedStart} – ${draft.plannedEnd}`;
}

export function PlanningDateRangeEditor({
  open,
  onOpenChange,
  projectId,
  task,
  canEdit,
  onSaved,
  onNotifyRequest,
  t,
}: PlanningDateRangeEditorProps) {
  const initial = useMemo(() => taskDateDraftFromDoc(task), [task]);
  const [draft, setDraft] = useState<TaskDateDraft | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(taskDateDraftFromDoc(task));
      setError(null);
    }
  }, [open, task]);

  if (!draft) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-sm text-muted-foreground">{t("planning.dateEditor.noDates")}</p>
        </DialogContent>
      </Dialog>
    );
  }

  const workingDays = countWorkingDaysInclusive(draft.plannedStart, draft.plannedEnd);

  const persist = async (notifyAfter: boolean) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    const oldRange = formatRange(taskDateDraftFromDoc(task) ?? draft);
    try {
      const patch = buildTaskSchedulePatchFromDraft(draft);
      await updateTaskSchedule(projectId, task.id, patch);
      onSaved({
        taskTitle: task.title,
        oldRange,
        newRange: formatRange(draft),
        patch,
      });
      onOpenChange(false);
      if (notifyAfter) onNotifyRequest?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("gantt.updateError"));
    } finally {
      setSaving(false);
    }
  };

  const quick = (fn: (d: TaskDateDraft) => TaskDateDraft) => {
    setDraft((prev) => (prev ? fn(prev) : prev));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="size-5" />
            {t("planning.dateEditor.title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium text-foreground">{task.title}</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="plan-start">{t("planning.taskDrawer.plannedStart")}</Label>
            <Input
              id="plan-start"
              type="date"
              value={draft.plannedStart}
              onChange={(e) => {
                const ns = e.target.value;
                setDraft((prev) => {
                  if (!prev) return prev;
                  if (!prev.canResize) {
                    return { ...prev, plannedStart: ns, plannedEnd: ns, dueDate: ns };
                  }
                  const endBumped = ns > prev.plannedEnd;
                  const ne = endBumped ? ns : prev.plannedEnd;
                  return {
                    ...prev,
                    plannedStart: ns,
                    plannedEnd: ne,
                    dueDate: endBumped ? ne : prev.dueDate,
                  };
                });
              }}
            />
          </div>
          <div>
            <Label htmlFor="plan-end">{t("planning.taskDrawer.plannedEnd")}</Label>
            <Input
              id="plan-end"
              type="date"
              value={draft.plannedEnd}
              disabled={!draft.canResize}
              onChange={(e) => {
                const ne = e.target.value;
                setDraft((prev) => (prev ? { ...prev, plannedEnd: ne, dueDate: ne } : prev));
              }}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="plan-due">{t("planning.taskDrawer.dueDate")}</Label>
            <Input
              id="plan-due"
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, dueDate: e.target.value } : prev))}
            />
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          {t("planning.dateEditor.duration", { count: workingDays })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" onClick={() => quick((d) => applyQuickShift(d, 1))}>
            {t("planning.dateEditor.plus1")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => quick((d) => applyQuickShift(d, 3))}>
            {t("planning.dateEditor.plus3")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => quick((d) => applyQuickShift(d, 7))}>
            {t("planning.dateEditor.plusWeek")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => quick((d) => applyQuickShift(d, -1))}>
            <ChevronLeft className="mr-0.5 size-3.5" />
            {t("planning.dateEditor.minus1")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => quick((d) => applyQuickShift(d, 1))}>
            <ChevronRight className="mr-0.5 size-3.5" />
            {t("planning.dateEditor.plus1day")}
          </Button>
        </div>

        {draft.canResize ? (
          <div className="flex items-center gap-2">
            <Label htmlFor="duration-days" className="shrink-0">
              {t("planning.dateEditor.workingDays")}
            </Label>
            <Input
              id="duration-days"
              type="number"
              min={1}
              className="w-20"
              value={workingDays}
              onChange={(e) => {
                const n = Math.max(1, parseInt(e.target.value, 10) || 1);
                setDraft((prev) => (prev ? applyDurationChange(prev, n) : prev));
              }}
            />
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full bg-[#1D376A]"
            disabled={saving || !canEdit}
            onClick={() => void persist(false)}
          >
            {t("common.save")}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={saving || !canEdit}
            onClick={() => void persist(true)}
          >
            {t("planning.dateEditor.saveAndNotify")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
