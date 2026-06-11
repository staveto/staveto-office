"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Camera,
  CheckSquare,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  AlertTriangle,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { getGreetingKey } from "@/lib/dashboardCommandCenter";
import type { ActiveWorkspace } from "@/types/workspace";
import {
  buildMapsUrl,
  fetchWorkerDashboardData,
  formatProjectAddress,
  type WorkerDashboardData,
} from "@/services/worker/workerDashboardService";
import type { ProjectDoc } from "@/lib/projects";
import { DashboardSection } from "./DashboardSection";
import { EmptyState } from "./EmptyState";
import { CompanyMetricCard } from "./CompanyMetricCard";
import { CompactActionButton } from "./CompactActionButton";

type WorkerDashboardViewProps = {
  activeWorkspace: ActiveWorkspace;
  displayName: string;
  uid: string;
};

function WorkerHero({
  displayName,
  companyName,
  t,
}: {
  displayName: string;
  companyName: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const greetingKey = getGreetingKey(new Date().getHours());

  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border",
        "bg-gradient-to-br from-[#1D376A]/10 via-card to-[#e06737]/5",
        "shadow-sm"
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-[#1D376A]/10 blur-2xl"
        aria-hidden
      />
      <div className="relative px-4 py-5 sm:px-6 sm:py-6">
        <p className="text-sm text-muted-foreground">
          {t(`dashboard.hero.greeting.${greetingKey}`, { name: displayName })}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {companyName}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className="border border-[#1D376A]/20 bg-[#1D376A]/10 text-[#1D376A] dark:text-[#93b4e8]"
          >
            {t("workerDashboard.connectedAsWorker")}
          </Badge>
        </div>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {t("workerDashboard.scopeHint")}
        </p>
      </div>
    </header>
  );
}

function TodayJobCard({
  project,
  t,
  featured = false,
}: {
  project: ProjectDoc;
  t: (key: string) => string;
  featured?: boolean;
}) {
  const address = formatProjectAddress(project);
  const mapsUrl = buildMapsUrl(project);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        featured ? "border-[#1D376A]/25 ring-1 ring-[#1D376A]/10" : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            featured ? "bg-[#1D376A]/10 text-[#1D376A]" : "bg-muted text-muted-foreground"
          )}
        >
          <Briefcase className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{project.name}</p>
          {address ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>{address}</span>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/app/projects/${project.id}`}
          className={cn(
            buttonVariants({ size: "sm" }),
            featured && "bg-[#e06737] hover:bg-[#c95a30] text-white"
          )}
        >
          {t("workerDashboard.openJob")}
        </Link>
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t("workerDashboard.navigate")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function JobListRow({ project }: { project: ProjectDoc }) {
  const address = formatProjectAddress(project);

  return (
    <Link
      href={`/app/projects/${project.id}`}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
        "shadow-sm transition-colors hover:border-[#1D376A]/30 hover:bg-muted/40"
      )}
    >
      <Briefcase className="size-4 shrink-0 text-[#1D376A]/80" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
        {address ? (
          <p className="truncate text-xs text-muted-foreground">{address}</p>
        ) : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export function WorkerDashboardView({
  activeWorkspace,
  displayName,
  uid,
}: WorkerDashboardViewProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<WorkerDashboardData | null>(null);

  const companyName = activeWorkspace.name?.trim() || t("dashboard.hero.companyFallback");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchWorkerDashboardData(activeWorkspace, uid)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace, uid]);

  const assignedProjects = data?.assignedProjects ?? [];
  const todayProjects = data?.todayProjects ?? [];
  const openTasks = data?.openTasks ?? [];
  const firstProject = assignedProjects[0];

  const focusProject = useMemo(() => {
    if (todayProjects.length > 0) return todayProjects[0]!;
    if (assignedProjects.length > 0) return assignedProjects[0]!;
    return null;
  }, [todayProjects, assignedProjects]);

  const todayCount = todayProjects.length;
  const jobsCount = assignedProjects.length;
  const tasksCount = openTasks.length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <WorkerHero displayName={displayName} companyName={companyName} t={t} />

      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
        role="region"
        aria-label={t("dashboard.stats")}
      >
        <CompanyMetricCard
          title={t("workerDashboard.myJobs.title")}
          value={loading ? null : jobsCount}
          icon={Briefcase}
          loading={loading}
        />
        <CompanyMetricCard
          title={t("workerDashboard.today.title")}
          value={loading ? null : todayCount}
          icon={CalendarDays}
          loading={loading}
        />
        <CompanyMetricCard
          title={t("workerDashboard.tasks.title")}
          value={loading ? null : tasksCount}
          icon={CheckSquare}
          loading={loading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <DashboardSection
            title={t("workerDashboard.today.title")}
            description={
              focusProject
                ? undefined
                : t("workerDashboard.today.emptyHint")
            }
          >
            {loading ? (
              <div className="flex justify-center rounded-xl border border-border bg-card py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : focusProject ? (
              <TodayJobCard project={focusProject} t={t} featured />
            ) : (
              <EmptyState
                message={t("workerDashboard.today.empty")}
                hint={t("workerDashboard.today.emptyHint")}
              />
            )}
          </DashboardSection>

          <DashboardSection
            title={t("workerDashboard.myJobs.title")}
            description={
              assignedProjects.length > 0
                ? undefined
                : t("workerDashboard.myJobs.empty")
            }
          >
            <div className="mb-3 flex justify-end">
              <Link
                href="/app/projects?filter=assigned"
                className="text-xs font-semibold text-[#e06737] hover:underline"
              >
                {t("workerDashboard.myJobs.viewAll")}
              </Link>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : assignedProjects.length > 0 ? (
              <ul className="space-y-2" role="list">
                {assignedProjects.slice(0, 6).map((project) => (
                  <li key={project.id}>
                    <JobListRow project={project} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message={t("workerDashboard.myJobs.empty")} />
            )}
          </DashboardSection>
        </div>

        <div className="space-y-5">
          <DashboardSection title={t("workerDashboard.tasks.title")}>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : openTasks.length > 0 ? (
              <ul className="space-y-2" role="list">
                {openTasks.slice(0, 6).map((task) => (
                  <li key={`${task.projectId}-${task.id}`}>
                    <Link
                      href={`/app/projects/${task.projectId}`}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3",
                        "shadow-sm transition-colors hover:border-[#1D376A]/30 hover:bg-muted/40"
                      )}
                    >
                      <CheckSquare className="size-4 shrink-0 mt-0.5 text-[#1D376A]/80" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{task.projectName}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message={t("workerDashboard.tasks.comingSoon")} />
            )}
          </DashboardSection>

          <DashboardSection title={t("workerDashboard.quickActions.title")}>
            <div className="flex flex-wrap gap-2">
              <CompactActionButton
                label={t("workerDashboard.quickActions.myJobs")}
                icon={Briefcase}
                href="/app/projects?filter=assigned"
              />
              <CompactActionButton
                label={t("workerDashboard.quickActions.addPhoto")}
                icon={Camera}
                href={firstProject ? `/app/projects/${firstProject.id}` : undefined}
                disabled={!firstProject}
              />
              <CompactActionButton
                label={t("workerDashboard.quickActions.reportProblem")}
                icon={AlertTriangle}
                href="/app/help"
              />
              <CompactActionButton
                label={t("workerDashboard.quickActions.attendance")}
                icon={Clock}
                disabled
              />
            </div>
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}
