"use client";

import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  UserRound,
} from "lucide-react";
import type { PhaseMetric } from "@/lib/projectPhaseMetrics";
import {
  countPhaseCrew,
  formatDateRangeLabel,
  getPhaseDateRangeFromTasks,
} from "@/lib/projectPlanningDates";
import type { TaskDoc } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Props = {
  phase: PhaseMetric;
  tasks: TaskDoc[];
  selected: boolean;
  collapsed: boolean;
  canManage: boolean;
  locale: string;
  onSelect: () => void;
  onToggleCollapse: () => void;
  onEditPhase?: () => void;
  onAddTask?: () => void;
  onPlanPhase?: () => void;
  onAssignPhase?: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectPhasePlanningCard({
  phase,
  tasks,
  selected,
  collapsed,
  canManage,
  locale,
  onSelect,
  onToggleCollapse,
  onEditPhase,
  onAddTask,
  onPlanPhase,
  onAssignPhase,
  t,
}: Props) {
  const name = phase.isGeneral ? t("projects.dashboard.phaseGeneral") : phase.name;
  const dateRange = formatDateRangeLabel(getPhaseDateRangeFromTasks(tasks), locale);
  const crewCount = countPhaseCrew(tasks);

  return (
    <article
      className={cn(
        "rounded-xl border bg-card transition-colors",
        selected ? "border-[#1D376A] ring-1 ring-[#1D376A]/30" : "border-border/70",
        phase.isActive && !selected && "border-[#1D376A]/40"
      )}
    >
      <button
        type="button"
        className="w-full px-3 py-2.5 text-left"
        onClick={onSelect}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#1D376A]">{name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3 shrink-0" />
              {dateRange}
            </p>
          </div>
          {phase.isActive ? (
            <span className="shrink-0 rounded-full bg-[#1D376A] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
              {t("projects.phaseWorkflow.current")}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span>
            {t("projects.taskGroups.summary", {
              total: phase.total,
              done: phase.done,
              open: phase.open,
            })}
          </span>
          <span>· {phase.percent}%</span>
          <span className="inline-flex items-center gap-0.5">
            <UserRound className="size-3" />
            {crewCount}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[#1D376A]"
            style={{ width: `${phase.percent}%` }}
          />
        </div>
      </button>

      {canManage && !collapsed ? (
        <div className="flex flex-wrap gap-1 border-t border-border/60 px-2 py-2">
          {onEditPhase && !phase.isGeneral ? (
            <ActionChip icon={Pencil} label={t("projects.planning.editPhase")} onClick={onEditPhase} />
          ) : null}
          {onAddTask ? (
            <ActionChip icon={Plus} label={t("projects.addTask")} onClick={onAddTask} />
          ) : null}
          {onPlanPhase ? (
            <ActionChip icon={Calendar} label={t("projects.planning.planPhase")} onClick={onPlanPhase} />
          ) : null}
          {onAssignPhase ? (
            <ActionChip icon={UserRound} label={t("projects.planning.assignPhase")} onClick={onAssignPhase} />
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="flex w-full items-center justify-center border-t border-border/40 py-1 text-muted-foreground hover:bg-muted/30"
        onClick={onToggleCollapse}
        aria-label={collapsed ? t("projects.planning.expand") : t("projects.planning.collapse")}
      >
        {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>
    </article>
  );
}

function ActionChip({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[10px] font-semibold text-[#1D376A] hover:bg-muted/50"
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}
