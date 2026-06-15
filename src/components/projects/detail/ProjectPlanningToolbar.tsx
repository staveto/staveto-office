"use client";

import {
  CalendarRange,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  canManage: boolean;
  onAddPhase: () => void;
  onAddTask: () => void;
  onBulkPlan: () => void;
  onAssignCrew: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  className?: string;
};

export function ProjectPlanningToolbar({
  canManage,
  onAddPhase,
  onAddTask,
  onBulkPlan,
  onAssignCrew,
  t,
  className,
}: Props) {
  if (!canManage) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm",
        className
      )}
    >
      <span className="mr-1 text-xs font-bold uppercase tracking-wide text-[#1D376A]">
        {t("projects.planning.toolbarLabel")}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8"
        onClick={onAddPhase}
      >
        <Plus className="mr-1 size-3.5" />
        {t("projects.planning.addPhase")}
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-8 bg-[#e06737] hover:bg-[#c9582f]"
        onClick={onAddTask}
      >
        <Plus className="mr-1 size-3.5" />
        {t("projects.planning.addTask")}
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={onBulkPlan}>
        <CalendarRange className="mr-1 size-3.5" />
        {t("projects.planning.bulkPlan")}
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={onAssignCrew}>
        <Users className="mr-1 size-3.5" />
        {t("projects.planning.assignCrew")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 text-muted-foreground"
        disabled
        title={t("projects.planning.aiSoon")}
      >
        <Sparkles className="mr-1 size-3.5" />
        {t("projects.planning.aiPlan")}
      </Button>
    </div>
  );
}
