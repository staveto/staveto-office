"use client";

import { Button } from "@/components/ui/button";
import type { PhaseMetric } from "@/lib/projectPhaseMetrics";
import {
  formatDateRangeLabel,
  getPhaseDateRangeFromTasks,
} from "@/lib/projectPlanningDates";
import type { TaskDoc } from "@/lib/projects";
import { taskMissingAssignee, taskMissingTools } from "@/lib/taskPlanningDisplay";

type Props = {
  phase: PhaseMetric | null;
  phaseTasks: TaskDoc[];
  locale: string;
  canManage: boolean;
  onPlanPhase?: () => void;
  onAssignOpenTasks?: () => void;
  onSetSameDate?: () => void;
  onShiftDates?: (days: number) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ProjectPlanningInspector({
  phase,
  phaseTasks,
  locale,
  canManage,
  onPlanPhase,
  onAssignOpenTasks,
  onSetSameDate,
  onShiftDates,
  t,
}: Props) {
  if (!phase) {
    return (
      <aside className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
        {t("projects.planning.selectPhaseHint")}
      </aside>
    );
  }

  const name = phase.isGeneral ? t("projects.dashboard.phaseGeneral") : phase.name;
  const range = formatDateRangeLabel(getPhaseDateRangeFromTasks(phaseTasks), locale);
  const openTasks = phaseTasks.filter((x) => (x.status ?? "OPEN").toUpperCase() !== "DONE");
  const missingAssignee = openTasks.filter(taskMissingAssignee).length;
  const missingTools = openTasks.filter(taskMissingTools).length;

  return (
    <aside className="space-y-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("projects.planning.inspectorTitle")}
        </p>
        <h3 className="mt-1 text-base font-bold text-[#1D376A]">{name}</h3>
        <p className="text-sm text-muted-foreground">{range}</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("projects.planning.openTasks")}</dt>
          <dd className="font-semibold tabular-nums">{phase.open}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("projects.planning.doneTasks")}</dt>
          <dd className="font-semibold tabular-nums">{phase.done}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("projects.today.unassigned")}</dt>
          <dd className="font-semibold tabular-nums">{missingAssignee}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("projects.today.missingTools")}</dt>
          <dd className="font-semibold tabular-nums">{missingTools}</dd>
        </div>
      </dl>

      {canManage ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("projects.planning.applyToAll")}
          </p>
          {onPlanPhase ? (
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={onPlanPhase}>
              {t("projects.planning.planPhase")}
            </Button>
          ) : null}
          {onAssignOpenTasks ? (
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={onAssignOpenTasks}>
              {t("projects.planning.assignOpenInPhase")}
            </Button>
          ) : null}
          {onSetSameDate ? (
            <Button type="button" size="sm" variant="outline" className="w-full" onClick={onSetSameDate}>
              {t("projects.planning.sameDateAll")}
            </Button>
          ) : null}
          {onShiftDates ? (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onShiftDates(-1)}
              >
                {t("projects.planning.shiftBack")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => onShiftDates(1)}
              >
                {t("projects.planning.shiftForward")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
