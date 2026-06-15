"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DateDistributionMode } from "@/lib/projectPlanningDates";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";

export type PhasePlanDialogResult = {
  startDate: string;
  endDate?: string;
  durationDays?: number;
  workingDaysOnly: boolean;
  mode: DateDistributionMode;
  assigneeId?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phaseName: string;
  taskCount: number;
  members: ProjectMemberRecord[];
  defaultStartDate?: string;
  onApply: (result: PhasePlanDialogResult) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectPhasePlanDialog({
  open,
  onOpenChange,
  phaseName,
  taskCount,
  members,
  defaultStartDate,
  onApply,
  t,
}: Props) {
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  const [endDate, setEndDate] = useState("");
  const [durationDays, setDurationDays] = useState("5");
  const [useDuration, setUseDuration] = useState(true);
  const [workingDaysOnly, setWorkingDaysOnly] = useState(true);
  const [mode, setMode] = useState<DateDistributionMode>("sequential");
  const [assigneeId, setAssigneeId] = useState<string>("__none__");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && defaultStartDate) setStartDate(defaultStartDate);
  }, [open, defaultStartDate]);

  const apply = async () => {
    if (!startDate || busy || taskCount === 0) return;
    setBusy(true);
    try {
      await onApply({
        startDate,
        endDate: useDuration ? undefined : endDate || undefined,
        durationDays: useDuration ? Number(durationDays) || 1 : undefined,
        workingDaysOnly,
        mode,
        assigneeId: assigneeId === "__none__" ? undefined : assigneeId,
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
          <DialogTitle>{t("projects.planning.planPhaseTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("projects.planning.planPhaseSubtitle", { phase: phaseName, count: taskCount })}
        </p>
        <div className="space-y-3">
          <div>
            <Label>{t("projects.planning.startDate")}</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useDuration}
              onChange={(e) => setUseDuration(e.target.checked)}
            />
            {t("projects.planning.useDuration")}
          </label>
          {useDuration ? (
            <div>
              <Label>{t("projects.planning.durationDays")}</Label>
              <Input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
              />
            </div>
          ) : (
            <div>
              <Label>{t("projects.planning.endDate")}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={workingDaysOnly}
              onChange={(e) => setWorkingDaysOnly(e.target.checked)}
            />
            {t("projects.planning.workingDaysOnly")}
          </label>
          <div>
            <Label>{t("projects.planning.distribution")}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as DateDistributionMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">{t("projects.planning.distSequential")}</SelectItem>
                <SelectItem value="evenly">{t("projects.planning.distEvenly")}</SelectItem>
                <SelectItem value="same">{t("projects.planning.distSame")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("projects.planning.optionalWorker")}</Label>
            <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v ?? "__none__")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("projects.tasks.unassigned")}</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name?.trim() || m.email || m.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-[#1D376A] hover:bg-[#162d58]"
            disabled={busy || !startDate || taskCount === 0}
            onClick={() => void apply()}
          >
            {t("projects.planning.applyPlan")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
