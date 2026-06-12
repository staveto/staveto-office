"use client";

import { Check, ChevronRight } from "lucide-react";
import type { PhaseMetric, ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  metrics: ProjectPhaseMetrics;
  compact?: boolean;
};

function phaseLabel(
  phase: PhaseMetric,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  return phase.isGeneral ? t("projects.dashboard.phaseGeneral") : phase.name;
}

function PhaseStep({
  phase,
  compact,
  t,
}: {
  phase: PhaseMetric;
  compact: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const state = phase.isComplete ? "complete" : phase.isActive ? "active" : "future";

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1.5 rounded-xl border px-3 py-2.5 transition-colors",
        compact ? "min-w-[140px]" : "min-w-[170px]",
        state === "active" && "border-[#1D376A] bg-[#1D376A] text-white shadow-sm",
        state === "complete" && "border-emerald-300 bg-emerald-50 text-emerald-800",
        state === "future" && "border-border/70 bg-muted/30 text-muted-foreground"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-sm font-semibold",
            state === "active" && "text-white",
            state === "complete" && "text-emerald-900"
          )}
        >
          {phaseLabel(phase, t)}
        </span>
        {state === "complete" ? (
          <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
        ) : state === "active" ? (
          <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
            {t("projects.phaseWorkflow.current")}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "h-1.5 w-full overflow-hidden rounded-full",
          state === "active" ? "bg-white/25" : "bg-black/10"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            state === "active" ? "bg-white" : state === "complete" ? "bg-emerald-500" : "bg-[#1D376A]/40"
          )}
          style={{ width: `${phase.percent}%` }}
        />
      </div>

      <p
        className={cn(
          "text-[11px] tabular-nums",
          state === "active" ? "text-white/80" : "text-muted-foreground"
        )}
      >
        {t("projects.phaseWorkflow.taskSummary", {
          done: phase.done,
          total: phase.total,
        })}
        {" · "}
        {phase.percent}%
      </p>
    </div>
  );
}

export function ProjectPhaseWorkflow({ metrics, compact = false }: Props) {
  const { t } = useI18n();

  if (metrics.phases.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
        {t("projects.phaseWorkflow.empty")}
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {metrics.phases.map((phase, index) => (
        <div key={phase.id} className="flex items-center gap-1.5">
          <PhaseStep phase={phase} compact={compact} t={t} />
          {index < metrics.phases.length - 1 ? (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
          ) : null}
        </div>
      ))}
    </div>
  );
}
