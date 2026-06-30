"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  Clock,
  FileText,
  Layers,
  MapPin,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import type { ProjectDoc } from "@/lib/projects";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import {
  getCustomerDisplayName,
  getHumanWorkflowStatusKey,
  getLocationDisplay,
  getNextStepKey,
} from "@/lib/projectDashboard";
import type { ProjectHealth } from "@/lib/projectHealth";
import type { ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import { ProjectHealthBadge } from "./ProjectHealthBadge";
import { JobSourceBadge } from "@/components/jobs/JobSourceBadge";
import { WorkTypeBadge } from "@/components/jobs/WorkTypeBadge";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu";
import { ProjectCoverThumbnail } from "@/components/projects/ProjectCoverThumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { WorkspaceRole } from "@/types/workspace";
import { cn } from "@/lib/utils";

type Props = {
  project: ProjectDoc;
  userId: string;
  role?: WorkspaceRole;
  health: ProjectHealth;
  phaseMetrics: ProjectPhaseMetrics;
  crewCount: number;
  investedMinutes: number;
  onProjectUpdated: (project: ProjectDoc) => void;
  onActionToast: (key: string) => void;
  onNavigate: (tab: ProjectDashboardTab) => void;
};

export function formatInvestedTime(
  minutes: number,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (!minutes || minutes <= 0) return t("projects.header.noTime");
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function MetaStat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon
        className={cn(
          "size-4 shrink-0",
          highlight ? "text-[var(--po-primary)]" : "text-[var(--po-text-muted)]"
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase leading-none tracking-wide text-[var(--po-text-muted)]">
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-sm font-semibold leading-tight",
            highlight ? "text-[var(--po-primary)]" : "text-[var(--po-text-primary)]"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function ProjectCompactHeader({
  project,
  userId,
  role,
  health,
  phaseMetrics,
  crewCount,
  investedMinutes,
  onProjectUpdated,
  onActionToast,
  onNavigate,
}: Props) {
  const { t } = useI18n();
  const customer = getCustomerDisplayName(project);
  const location = getLocationDisplay(project);
  const statusKey = getHumanWorkflowStatusKey(project);

  const firstReason = health.reasons[0];
  const nextActionText = firstReason
    ? t(firstReason.key, firstReason.params)
    : t(getNextStepKey(project));

  const activePhaseText =
    phaseMetrics.activePhaseName ??
    (phaseMetrics.hasPhases
      ? t("projects.dashboard.phaseGeneral")
      : t("projects.header.noPhase"));

  return (
    <header className="rounded-xl border border-[var(--po-card-border)] bg-[var(--po-card-bg)] shadow-sm">
      <div className="px-4 pt-2.5 sm:px-5">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--po-text-muted)] transition-colors hover:text-[var(--po-text-primary)]"
        >
          <ArrowLeft className="size-3.5" />
          {t("projects.titleJobs")}
        </Link>
      </div>

      <div className="flex flex-col gap-2 px-4 py-2 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <ProjectCoverThumbnail
            url={project.coverImageUrl}
            alt={t("projects.coverPhotoAlt", { name: project.name || t("projects.noName") })}
            size="lg"
            className="hidden sm:block"
          />
          <ProjectCoverThumbnail
            url={project.coverImageUrl}
            alt={t("projects.coverPhotoAlt", { name: project.name || t("projects.noName") })}
            size="md"
            className="sm:hidden"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="border-emerald-500/35 bg-emerald-500/10 font-normal text-emerald-900 dark:text-emerald-100"
            >
              {t(`projects.workflow.status.${statusKey}`)}
            </Badge>
            <ProjectHealthBadge status={health.status} size="sm" />
            <WorkTypeBadge project={project} />
            <JobSourceBadge project={project} />
          </div>

          <h1 className="truncate text-lg font-semibold leading-tight text-[var(--po-text-primary)] sm:text-xl">
            {project.name || t("projects.noName")}
          </h1>

          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[var(--po-text-secondary)]">
            {customer ? (
              <span className="font-medium text-[var(--po-text-primary)]">{customer}</span>
            ) : null}
            {customer && location ? <span aria-hidden>·</span> : null}
            {location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {location}
              </span>
            ) : null}
          </p>
          </div>
        </div>

        <div className="flex shrink-0 items-start">
          <ProjectActionsMenu
            project={project}
            userId={userId}
            role={role}
            variant="detail"
            onProjectUpdated={onProjectUpdated}
            onActionComplete={onActionToast}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[var(--po-card-border)] px-4 py-2.5 sm:grid-cols-3 sm:px-5 lg:grid-cols-5">
        <MetaStat icon={Layers} label={t("projects.header.activePhase")} value={activePhaseText} />
        <MetaStat
          icon={TrendingUp}
          label={t("projects.header.progress")}
          value={`${phaseMetrics.overallPercent}%`}
        />
        <MetaStat
          icon={Users}
          label={t("projects.header.crew")}
          value={
            crewCount > 0
              ? t("projects.ownership.assignedCount", { count: crewCount })
              : t("projects.dashboard.kpi.noTeam")
          }
        />
        <MetaStat
          icon={Clock}
          label={t("projects.header.time")}
          value={formatInvestedTime(investedMinutes, t)}
        />
        <MetaStat
          icon={ClipboardList}
          label={t("projects.header.nextAction")}
          value={nextActionText}
          highlight
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--po-card-border)] px-4 py-2.5 sm:px-5">
        <Button size="sm" className="min-h-11 bg-[var(--po-primary)] text-white hover:bg-[var(--po-primary-hover)] sm:min-h-9" onClick={() => onNavigate("tasks")}>
          <Plus className="mr-1 size-4" />
          {t("projects.addTask")}
        </Button>
        <Button size="sm" variant="outline" className="min-h-11 border-[var(--po-card-border)] sm:min-h-9" onClick={() => onNavigate("workplan")}>
          <UserPlus className="mr-1 size-4" />
          {t("projects.workPlan.assignWorker")}
        </Button>
        <Button size="sm" variant="outline" className="min-h-11 border-[var(--po-card-border)] sm:min-h-9" onClick={() => onNavigate("workplan")}>
          <ClipboardList className="mr-1 size-4" />
          {t("projects.header.openWorkPlan")}
        </Button>
        <Button size="sm" variant="outline" className="min-h-11 border-[var(--po-card-border)] sm:min-h-9" onClick={() => onNavigate("documents")}>
          <FileText className="mr-1 size-4" />
          {t("projects.header.createReport")}
        </Button>
      </div>
    </header>
  );
}
