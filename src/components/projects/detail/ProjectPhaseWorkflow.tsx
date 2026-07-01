"use client";

import { Check, Clock, Layers3 } from "lucide-react";
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

const CARD_WIDTH = "w-[11.75rem] sm:w-[13rem]";

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
  index,
  status,
  t,
  waiting,
}: {
  phase: PhaseMetric;
  index: number;
  status: ProjectOverviewPhaseStatus;
  t: (key: string, params?: Record<string, string | number>) => string;
  waiting?: boolean;
}) {
  const demoted = waiting && status === "current";
  const label = phaseLabel(phase, t);

  return (
    <article
      className={cn(
        CARD_WIDTH,
        "shrink-0 snap-start rounded-xl border px-3 py-3 shadow-sm transition-colors",
        !demoted &&
          status === "current" &&
          "border-[var(--po-primary)] bg-[var(--po-card-bg-elevated)] ring-2 ring-[var(--po-primary)]/30",
        demoted && "border-[var(--po-card-border)] bg-[var(--po-card-muted)]",
        status === "done" &&
          "border-emerald-500/40 bg-emerald-500/10 dark:border-emerald-500/35 dark:bg-emerald-500/12",
        status === "blocked" &&
          "border-red-500/45 bg-red-500/10 dark:border-red-500/40 dark:bg-red-500/12",
        status === "not_started" &&
          "border-[var(--po-card-border)] bg-[var(--po-card-muted)]/80"
      )}
      aria-current={!demoted && status === "current" ? "step" : undefined}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
            status === "done" &&
              "bg-emerald-600 text-white dark:bg-emerald-500",
            !demoted &&
              status === "current" &&
              "bg-[var(--po-primary)] text-white",
            status === "blocked" && "bg-red-600 text-white",
            (status === "not_started" || demoted) &&
              "bg-[var(--po-card-bg-elevated)] text-[var(--po-text-muted)] ring-1 ring-[var(--po-card-border)]"
          )}
        >
          {status === "done" ? <Check className="size-3.5" aria-hidden /> : index + 1}
        </span>

        {status === "done" ? (
          <span className="rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
            {t("projects.phaseWorkflow.done")}
          </span>
        ) : demoted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--po-card-bg-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--po-text-muted)]">
            <Clock className="size-3" aria-hidden />
            {t("projects.phaseWorkflow.waiting")}
          </span>
        ) : status === "current" ? (
          <span className="rounded-full bg-[var(--po-primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {t("projects.phaseWorkflow.current")}
          </span>
        ) : status === "blocked" ? (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {t("projects.command.phase.blocked")}
          </span>
        ) : null}
      </div>

      <h3
        className={cn(
          "mb-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-[var(--po-text-primary)]",
          status === "done" && "text-emerald-950 dark:text-emerald-50"
        )}
        title={label}
      >
        {label}
      </h3>

      <div
        className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
        role="progressbar"
        aria-valuenow={phase.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            !demoted && status === "current" && "bg-[var(--po-primary)]",
            demoted && "bg-[var(--po-text-muted)]/50",
            status === "done" && "bg-emerald-500",
            status === "blocked" && "bg-red-500",
            status === "not_started" && "bg-[var(--po-text-muted)]/45"
          )}
          style={{ width: `${Math.max(phase.percent, phase.total > 0 ? 4 : 0)}%` }}
        />
      </div>

      <p className="text-[11px] leading-relaxed tabular-nums text-[var(--po-text-muted)]">
        {t("projects.phaseWorkflow.taskSummary", {
          done: phase.done,
          total: phase.total,
        })}
        <span className="text-[var(--po-text-secondary)]"> · {phase.percent}%</span>
      </p>
    </article>
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

  const activePhase = metrics.phases.find((p) => p.isActive);

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg)] shadow-sm",
        compact ? "border-0 bg-transparent p-0 shadow-none" : "p-4"
      )}
      aria-label={t("projects.phaseWorkflow.title")}
    >
      {!compact ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers3 className="size-4 text-[var(--po-primary)]" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-[var(--po-text-primary)]">
                {t("projects.phaseWorkflow.title")}
              </h2>
              {activePhase && !waitingForQuote ? (
                <p className="text-xs text-[var(--po-text-muted)]">
                  {t("projects.phaseWorkflow.activeHint", {
                    name: phaseLabel(activePhase, t),
                    percent: activePhase.percent,
                  })}
                </p>
              ) : null}
            </div>
          </div>
          <p className="text-[11px] text-[var(--po-text-muted)]">
            {t("projects.phaseWorkflow.scrollHint")}
          </p>
        </div>
      ) : null}

      {waitingForQuote ? (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--po-card-muted)] px-3 py-2 text-xs font-medium text-[var(--po-text-muted)]">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          {t("projects.phaseWorkflow.waitingForQuote")}
        </p>
      ) : null}

      <div
        className={cn(
          "-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1",
          "snap-x snap-mandatory scroll-smooth",
          "[scrollbar-width:thin]"
        )}
      >
        {metrics.phases.map((phase, index) => (
          <PhaseStep
            key={phase.id}
            phase={phase}
            index={index}
            status={resolveStatus(phase, phaseStatuses)}
            t={t}
            waiting={waitingForQuote}
          />
        ))}
      </div>
    </section>
  );
}
