"use client";

import { Check, ChevronRight, Clock } from "lucide-react";
import type { PhaseMetric, ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import type { ProjectOverviewPhaseStatus } from "@/lib/projectOverviewViewModel";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  metrics: ProjectPhaseMetrics;
  compact?: boolean;
  phaseStatuses?: Array<{ id: string; status: ProjectOverviewPhaseStatus }>;
  /**
   * When true the job is blocked by an unsent quote: phases are shown as
   * waiting/secondary (no "current" highlight) plus an explanatory note.
   */
  waitingForQuote?: boolean;
};

function phaseLabel(
  phase: PhaseMetric,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  return phase.isGeneral ? t("projects.dashboard.phaseGeneral") : phase.name;
}

function resolveStatus(
  phase: PhaseMetric,
  phaseStatuses?: Props["phaseStatuses"]
): ProjectOverviewPhaseStatus {
  const mapped = phaseStatuses?.find((p) => p.id === phase.id)?.status;
  if (mapped) return mapped;
  if (phase.isComplete) return "done";
  if (phase.isActive) return "current";
  return "not_started";
}

function PhaseStep({
  phase,
  compact,
  status,
  t,
  isLast,
  waiting,
}: {
  phase: PhaseMetric;
  compact: boolean;
  status: ProjectOverviewPhaseStatus;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLast: boolean;
  waiting?: boolean;
}) {
  // While the job is blocked by an unsent quote, demote the "current" phase to
  // a neutral "waiting" treatment so it never looks like the primary action.
  const demoted = waiting && status === "current";
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-0">
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border px-3 py-2.5 transition-colors",
          compact ? "min-w-[130px]" : "min-w-[160px]",
          !demoted &&
            status === "current" &&
            "border-[var(--po-primary)]/60 bg-[var(--po-card-bg-elevated)] shadow-sm ring-1 ring-[var(--po-primary)]/25",
          demoted &&
            "border-[var(--po-card-border)] bg-[var(--po-card-muted)]",
          status === "done" &&
            "border-emerald-500/35 bg-emerald-500/10 dark:bg-emerald-500/15",
          status === "blocked" &&
            "border-red-500/40 bg-red-500/10 dark:bg-red-500/15",
          status === "not_started" &&
            "border-[var(--po-card-border)] bg-[var(--po-card-muted)]"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm font-semibold text-[var(--po-text-primary)]",
              status === "done" && "text-emerald-900 dark:text-emerald-100"
            )}
          >
            {phaseLabel(phase, t)}
          </span>
          {status === "done" ? (
            <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : demoted ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[var(--po-card-bg-elevated)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--po-text-muted)]">
              <Clock className="size-2.5" aria-hidden />
              {t("projects.phaseWorkflow.waiting")}
            </span>
          ) : status === "current" ? (
            <span className="shrink-0 rounded bg-[var(--po-primary)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              {t("projects.phaseWorkflow.current")}
            </span>
          ) : status === "blocked" ? (
            <span className="shrink-0 rounded bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              {t("projects.command.phase.blocked")}
            </span>
          ) : null}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--po-card-muted)]">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              !demoted && status === "current" && "bg-[var(--po-primary)]",
              demoted && "bg-[var(--po-text-muted)]/40",
              status === "done" && "bg-emerald-500",
              status === "blocked" && "bg-red-500",
              status === "not_started" && "bg-[var(--po-text-muted)]/40"
            )}
            style={{ width: `${phase.percent}%` }}
          />
        </div>

        <p className="text-[11px] tabular-nums text-[var(--po-text-muted)]">
          {t("projects.phaseWorkflow.taskSummary", {
            done: phase.done,
            total: phase.total,
          })}
          {" · "}
          {phase.percent}%
        </p>
      </div>
      {!isLast ? (
        <div
          className="hidden w-3 shrink-0 self-center sm:block"
          aria-hidden
        >
          <ChevronRight className="size-4 text-[var(--po-text-muted)]" />
        </div>
      ) : null}
    </div>
  );
}

export function ProjectPhaseWorkflow({
  metrics,
  compact = false,
  phaseStatuses,
  waitingForQuote = false,
}: Props) {
  const { t } = useI18n();

  if (metrics.phases.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--po-card-border)] bg-[var(--po-card-muted)] px-4 py-3 text-sm text-[var(--po-text-muted)]">
        {t("projects.phaseWorkflow.empty")}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg)] p-3 shadow-sm",
        compact && "border-0 bg-transparent p-0 shadow-none"
      )}
    >
      {waitingForQuote ? (
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--po-text-muted)]">
          <Clock className="size-3.5" aria-hidden />
          {t("projects.phaseWorkflow.waitingForQuote")}
        </p>
      ) : null}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {metrics.phases.map((phase, index) => (
          <PhaseStep
            key={phase.id}
            phase={phase}
            compact={compact}
            status={resolveStatus(phase, phaseStatuses)}
            t={t}
            isLast={index === metrics.phases.length - 1}
            waiting={waitingForQuote}
          />
        ))}
      </div>
    </div>
  );
}
