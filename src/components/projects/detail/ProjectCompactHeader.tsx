"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
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
} from "@/lib/projectDashboard";
import type { ProjectHealth } from "@/lib/projectHealth";
import type { ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import { ProjectHealthBadge } from "./ProjectHealthBadge";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu";
import { ProjectCoverThumbnail } from "@/components/projects/ProjectCoverThumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { WorkspaceRole } from "@/types/workspace";
import { cn } from "@/lib/utils";
import { po } from "./overview/poStyles";

type Props = {
  project: ProjectDoc;
  userId: string;
  role?: WorkspaceRole;
  health: ProjectHealth;
  phaseMetrics: ProjectPhaseMetrics;
  crewCount: number;
  openTasksCount: number;
  overdueTasksCount: number;
  onProjectUpdated: (project: ProjectDoc) => void;
  onActionToast: (key: string) => void;
  onNavigate: (tab: ProjectDashboardTab) => void;
};

function KpiStat({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Layers;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={po.kpiItem} aria-hidden={false}>
      <div className="mb-0.5 flex items-center gap-1">
        <Icon
          className={cn(
            "size-3 shrink-0 opacity-60",
            warn ? "text-red-600 dark:text-red-400" : "text-[var(--po-text-muted)]"
          )}
          aria-hidden
        />
        <p className="truncate text-[10px] text-[var(--po-text-muted)]">{label}</p>
      </div>
      <p
        className={cn(
          "truncate text-sm font-semibold tabular-nums leading-tight",
          warn ? "text-red-700 dark:text-red-300" : "text-[var(--po-text-primary)]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SecondaryActionsMenu({
  onNavigate,
  t,
  className,
}: {
  onNavigate: (tab: ProjectDashboardTab) => void;
  t: (key: string) => string;
  className?: string;
}) {
  return (
    <details className={cn("group relative", className)}>
      <summary
        className={cn(
          po.btnOutline,
          "flex min-h-10 cursor-pointer list-none items-center justify-center gap-1 rounded-md border px-3 text-sm font-medium"
        )}
      >
        {t("projects.cockpit.actionsMenu")}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-[220px] flex-col gap-0.5 rounded-lg border border-[var(--po-card-border)] bg-[var(--po-card-bg)] p-1.5 shadow-lg">
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => onNavigate("tasks")}>
          <Plus className="mr-2 size-4" />
          {t("projects.addTask")}
        </Button>
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => onNavigate("workplan")}>
          <UserPlus className="mr-2 size-4" />
          {t("projects.workPlan.assignWorker")}
        </Button>
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => onNavigate("workplan")}>
          <ClipboardList className="mr-2 size-4" />
          {t("projects.header.openWorkPlan")}
        </Button>
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => onNavigate("documents")}>
          <FileText className="mr-2 size-4" />
          {t("projects.header.createReport")}
        </Button>
      </div>
    </details>
  );
}

export function ProjectCompactHeader({
  project,
  userId,
  role,
  health,
  phaseMetrics,
  crewCount,
  openTasksCount,
  overdueTasksCount,
  onProjectUpdated,
  onActionToast,
  onNavigate,
}: Props) {
  const { t } = useI18n();
  const customer = getCustomerDisplayName(project);
  const location = getLocationDisplay(project);
  const statusKey = getHumanWorkflowStatusKey(project);

  const activePhaseText =
    phaseMetrics.activePhaseName ??
    (phaseMetrics.hasPhases
      ? t("projects.dashboard.phaseGeneral")
      : t("projects.header.noPhase"));

  const hasUrgent = overdueTasksCount > 0 || health.status !== "ON_TRACK";
  const primaryLabel = hasUrgent
    ? t("projects.cockpit.cta.solveProblem")
    : t("projects.cockpit.cta.openPlan");
  const primaryTab: ProjectDashboardTab = hasUrgent ? "tasks" : "workplan";

  const summaryKey = overdueTasksCount > 0
    ? "projects.cockpit.header.summaryOverdue"
    : health.status !== "ON_TRACK"
      ? "projects.cockpit.header.summaryAttention"
      : "projects.cockpit.header.summaryOk";

  return (
    <header className={cn(po.infoCard, "overflow-hidden")}>
      <div className="px-4 pt-2.5 sm:px-5">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--po-text-muted)] transition-colors hover:text-[var(--po-text-primary)]"
        >
          <ArrowLeft className="size-3.5" />
          {t("projects.titleJobs")}
        </Link>
      </div>

      <div className="flex flex-col gap-4 px-4 py-3 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
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
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/8 font-normal text-emerald-900 dark:text-emerald-100"
              >
                {t(`projects.workflow.status.${statusKey}`)}
              </Badge>
              {health.status !== "ON_TRACK" ? (
                <ProjectHealthBadge status={health.status} size="sm" />
              ) : null}
            </div>

            <h1 className="truncate text-xl font-semibold leading-tight text-[var(--po-text-primary)] sm:text-2xl">
              {project.name || t("projects.noName")}
            </h1>

            {location ? (
              <p className="flex items-center gap-1 text-sm text-[var(--po-text-secondary)]">
                <MapPin className="size-3.5 shrink-0" />
                {location}
                {customer ? (
                  <span className="text-[var(--po-text-muted)]">· {customer}</span>
                ) : null}
              </p>
            ) : customer ? (
              <p className="text-sm text-[var(--po-text-secondary)]">{customer}</p>
            ) : null}

            <p className={cn(po.body, "max-w-xl leading-relaxed")}>
              {t(summaryKey, { count: overdueTasksCount })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2">
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

      <div className={cn(po.kpiGrid, "border-t border-[var(--po-card-border)]/50 px-4 py-2.5 sm:px-5")}>
        <KpiStat icon={Layers} label={t("projects.header.activePhase")} value={activePhaseText} />
        <KpiStat
          icon={TrendingUp}
          label={t("projects.header.progress")}
          value={`${phaseMetrics.overallPercent}%`}
        />
        <KpiStat
          icon={ClipboardList}
          label={t("projects.command.health.tasksOpen")}
          value={String(openTasksCount)}
        />
        <KpiStat
          icon={ClipboardList}
          label={t("projects.cockpit.kpi.overdue")}
          value={String(overdueTasksCount)}
          warn={overdueTasksCount > 0}
        />
        <KpiStat
          icon={Users}
          label={t("projects.header.crew")}
          value={
            crewCount > 0
              ? t("projects.ownership.assignedCount", { count: crewCount })
              : t("projects.dashboard.kpi.noTeam")
          }
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-[var(--po-card-border)]/50 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
        <Button
          size="lg"
          className={cn(po.btnPrimaryLg, "w-full sm:w-auto")}
          onClick={() => onNavigate(primaryTab)}
        >
          {primaryLabel}
        </Button>
        <SecondaryActionsMenu onNavigate={onNavigate} t={t} className="w-full sm:w-auto" />
      </div>
    </header>
  );
}
