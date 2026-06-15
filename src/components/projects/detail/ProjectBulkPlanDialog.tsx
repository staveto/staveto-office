"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BulkPlanDialogResult = {
  projectStartDate: string;
  defaultPhaseDurationDays: number;
  workingDaysOnly: boolean;
  gapBetweenPhasesDays: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phaseCount: number;
  openTaskCount: number;
  defaultStartDate?: string;
  onApply: (result: BulkPlanDialogResult) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectBulkPlanDialog({
  open,
  onOpenChange,
  phaseCount,
  openTaskCount,
  defaultStartDate,
  onApply,
  t,
}: Props) {
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  const [duration, setDuration] = useState("5");
  const [gap, setGap] = useState("1");
  const [workingDaysOnly, setWorkingDaysOnly] = useState(true);
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (!startDate || busy) return;
    setBusy(true);
    try {
      await onApply({
        projectStartDate: startDate,
        defaultPhaseDurationDays: Number(duration) || 1,
        workingDaysOnly,
        gapBetweenPhasesDays: Number(gap) || 0,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.planning.bulkPlanTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("projects.planning.bulkPlanSubtitle", {
            phases: phaseCount,
            tasks: openTaskCount,
          })}
        </p>
        <div className="space-y-3">
          <div>
            <Label>{t("projects.planning.projectStartDate")}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("projects.planning.defaultPhaseDuration")}</Label>
            <Input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
          <div>
            <Label>{t("projects.planning.gapBetweenPhases")}</Label>
            <Input type="number" min={0} value={gap} onChange={(e) => setGap(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={workingDaysOnly}
              onChange={(e) => setWorkingDaysOnly(e.target.checked)}
            />
            {t("projects.planning.workingDaysOnly")}
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-[#1D376A] hover:bg-[#162d58]"
            disabled={busy || !startDate || phaseCount === 0}
            onClick={() => void apply()}
          >
            {t("projects.planning.applyPlan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
