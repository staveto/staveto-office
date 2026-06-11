"use client";

import { Calendar, Loader2, UserRound, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  selectedCount: number;
  busy?: boolean;
  onAssignWorker: () => void;
  onAssignTools: () => void;
  onSetDate: () => void;
  onChangeStatus: (status: "OPEN" | "DONE") => void;
  onClear: () => void;
  t: (key: string) => string;
  className?: string;
};

export function ProjectBulkPlanningToolbar({
  selectedCount,
  busy,
  onAssignWorker,
  onAssignTools,
  onSetDate,
  onChangeStatus,
  onClear,
  t,
  className,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-[#1D376A]/20 bg-[#1D376A] text-white px-4 py-3 shadow-lg",
        className
      )}
    >
      <span className="text-sm font-semibold mr-1 tabular-nums">
        {selectedCount} {t("projects.workPlan.selected")}
      </span>
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 bg-white/15 text-white hover:bg-white/25 border-0"
        disabled={busy}
        onClick={onAssignWorker}
      >
        <UserRound className="size-3.5 mr-1" />
        {t("projects.workPlan.assignWorker")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 bg-white/15 text-white hover:bg-white/25 border-0"
        disabled={busy}
        onClick={onAssignTools}
      >
        <Wrench className="size-3.5 mr-1" />
        {t("projects.workPlan.assignTools")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 bg-white/15 text-white hover:bg-white/25 border-0"
        disabled={busy}
        onClick={onSetDate}
      >
        <Calendar className="size-3.5 mr-1" />
        {t("projects.workPlan.setDate")}
      </Button>
      <Select
        onValueChange={(v) => {
          if (v === "OPEN" || v === "DONE") onChangeStatus(v);
        }}
      >
        <SelectTrigger className="h-8 w-[130px] bg-white/15 text-white border-white/20 text-xs">
          <SelectValue placeholder={t("projects.workPlan.changeStatus")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="OPEN">{t("projects.tasks.statusOpen")}</SelectItem>
          <SelectItem value="DONE">{t("projects.tasks.statusDone")}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 text-white/90 hover:text-white hover:bg-white/10 ml-auto"
        disabled={busy}
        onClick={onClear}
      >
        <X className="size-3.5 mr-1" />
        {t("projects.workPlan.clearSelection")}
      </Button>
    </div>
  );
}
