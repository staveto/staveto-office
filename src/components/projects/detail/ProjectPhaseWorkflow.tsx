"use client";

import { ArrowRight, Check, Clock, Layers3 } from "lucide-react";
import type { PhaseMetric, ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import type { ProjectOverviewPhaseStatus } from "@/lib/projectOverviewViewModel";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./overview/poStyles";

type PhaseDetail = {
  id: string;
  overdueCount: number;
};

type Props = {
  metrics: ProjectPhaseMetrics;
  compact?: boolean;
  phaseStatuses?: Array<{ id: string; status: ProjectOverviewPhaseStatus }>;
  phaseDetails?: PhaseDetail[];
  waitingForQuote?: boolean;
  onPhaseClick?: (phaseId: string) => void;
};

const CARD_WIDTH = "w-[10.5rem] sm:w-[11.5rem]";

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
  overdueCount,
  t,
  waiting,
  clickable,
  onClick,
  isLast,
}: {
  phase: PhaseMetric;
  index: number;
  status: ProjectOverviewPhaseStatus;
  overdueCount: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  waiting?: boolean;
  clickable: boolean;
  onClick?: () => void;
  isLast: boolean;
}) {
  const demoted = waiting && status === "current";
  const label = phaseLabel(phase, t);

  const inner = (
    <>
      <div className="mb-2.5 flex items-start justify-between gap-1.5">
        <span
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
            status === "done" && "bg-emerald-600 text-white dark:bg-emerald-500",
            !demoted && status === "current" && "bg-[var(--po-primary)] text-white",
            status === "blocked" && "bg-red-600 text-white",
            (status === "not_started" || demoted) &&
              "bg-[var(--po-card-bg-elevated)] text-[var(--po-text-muted)] ring-1 ring-[var(--po-card-border)]"
          )}
        >
          {status === "done" ? <Check className="size-3.5" aria-hidden /> : index + 1}
        </span>

        {status === "done" ? (
          <span className="rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
            {t("projects.phaseWorkflow.done")}
          </span>
        ) : demoted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--po-card-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--po-text-muted)]">
            <Clock className="size-3" aria-hidden />
            {t("projects.phaseWorkflow.waiting")}
          </span>
        ) : status === "current" ? (
          <span className="rounded-full bg-[var(--po-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
            {t("projects.phaseWorkflow.current")}
          </span>
        ) : overdueCount > 0 ? (
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
            {t("projects.cockpit.phase.overdue", { count: overdueCount })}
          </span>
        ) : null}
      </div>

      <h3
        className={cn(
          "mb-3 line-clamp-2 min-h-[2.75rem] text-sm font-semibold leading-snug text-[var(--po-text-primary)]",
          status === "done" && "text-emerald-950 dark:text-emerald-50"
        )}
        title={label}
      >
        {label}
      </h3>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-black/8 dark:bg-white/10"
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
            status === "not_started" && "bg-[var(--po-text-muted)]/40"
          )}
          style={{ width: `${Math.max(phase.percent, phase.total > 0 ? 6 : 0)}%` }}
        />
      </div>

      <p
        className={cn(
          "mt-2 text-xs text-[var(--po-text-muted)] opacity-0 transition-opacity",
          "group-hover:opacity-100 group-focus-visible:opacity-100"
        )}
      >
        {t("projects.phaseWorkflow.taskSummary", {
          done: phase.done,
          total: phase.total,
        })}
        <span className="text-[var(--po-text-secondary)]"> · {phase.percent}%</span>
      </p>

      {clickable ? (
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1 text-xs font-medium text-sky-700 opacity-0 transition-opacity dark:text-sky-400",
            "group-hover:opacity-100 group-focus-visible:opacity-100"
          )}
        >
          {t("projects.cockpit.phase.open")}
          <ArrowRight className="size-3" />
        </p>
      ) : null}
    </>
  );

  const className = cn(
    "group relative shrink-0 snap-start rounded-xl border px-3 py-4 transition-all",
    CARD_WIDTH,
    "min-h-[9.5rem]",
    clickable &&
      "cursor-pointer hover:border-[var(--po-text-muted)]/40 hover:bg-[var(--po-card-muted)]/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
    !demoted &&
      status === "current" &&
      "border-[var(--po-primary)]/70 bg-[var(--po-card-bg-elevated)] ring-1 ring-[var(--po-primary)]/25",
    demoted && "border-[var(--po-card-border)]/50 bg-[var(--po-card-muted)]/40",
    status === "done" &&
      "border-emerald-500/30 bg-emerald-500/8 dark:border-emerald-500/25",
    status === "blocked" &&
      "border-red-500/35 bg-red-500/8",
    status === "not_started" && "border-[var(--po-card-border)]/40 bg-[var(--po-card-muted)]/25",
    overdueCount > 0 && status !== "current" && status !== "done" && "border-red-500/25"
  );

  const connector =
    !isLast ? (
      <span
        className="pointer-events-none absolute -right-2 top-[2.1rem] z-0 hidden h-0.5 w-4 bg-[var(--po-card-border)] sm:block"
        aria-hidden
      />
    ) : null;

  if (clickable && onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-current={!demoted && status === "current" ? "step" : undefined}
      >
        {connector}
        {inner}
      </button>
    );
  }

  return (
    <article
      className={className}
      aria-current={!demoted && status === "current" ? "step" : undefined}
    >
      {connector}
      {inner}
    </article>
  );
}

export function ProjectPhaseWorkflow({
  metrics,
  compact = false,
  phaseStatuses,
  phaseDetails,
  waitingForQuote = false,
  onPhaseClick,
}: Props) {
  const { t } = useI18n();

  if (metrics.phases.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--po-card-border)] bg-[var(--po-card-muted)]/40 px-4 py-3 text-sm text-[var(--po-text-muted)]">
        {t("projects.phaseWorkflow.empty")}
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--po-card-border)]/50 bg-[var(--po-card-bg)]/60",
        compact ? "border-0 bg-transparent p-0" : "p-4 sm:p-5"
      )}
      aria-label={t("projects.phaseWorkflow.title")}
    >
      {!compact ? (
        <div className="mb-4 flex items-center gap-2">
          <Layers3 className="size-4 text-[var(--po-text-muted)]" aria-hidden />
          <h2 className={po.sectionTitle}>{t("projects.phaseWorkflow.title")}</h2>
        </div>
      ) : null}

      {waitingForQuote ? (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--po-card-muted)]/60 px-3 py-2 text-xs text-[var(--po-text-muted)]">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          {t("projects.phaseWorkflow.waitingForQuote")}
        </p>
      ) : null}

      <div
        className={cn(
          "-mx-1 flex gap-3 overflow-x-auto px-1 pb-1",
          "snap-x snap-mandatory scroll-smooth",
          "[scrollbar-width:thin]"
        )}
      >
        {metrics.phases.map((phase, index) => {
          const overdueCount =
            phaseDetails?.find((p) => p.id === phase.id)?.overdueCount ?? 0;
          const clickable = !!onPhaseClick && phase.total > 0;
          return (
            <PhaseStep
              key={phase.id}
              phase={phase}
              index={index}
              status={resolveStatus(phase, phaseStatuses)}
              overdueCount={overdueCount}
              t={t}
              waiting={waitingForQuote}
              clickable={clickable}
              onClick={clickable ? () => onPhaseClick?.(phase.id) : undefined}
              isLast={index === metrics.phases.length - 1}
            />
          );
        })}
      </div>
    </section>
  );
}
