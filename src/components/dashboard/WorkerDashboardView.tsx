"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Camera,
  CheckSquare,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  User,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  appListRowClassName,
  appMutedTextClassName,
  appOutlineActionClassName,
  appPanelClassName,
  appPanelInsetClassName,
  appSectionHeadingClassName,
  appSubtleTextClassName,
} from "@/components/settings/settingsStyles";

type WorkerDashboardViewProps = {
  activeWorkspace: ActiveWorkspace;
  displayName: string;
  uid: string;
};

function WorkerPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(appPanelClassName, className)}>
      <CardContent className="py-5">{children}</CardContent>
    </Card>
  );
}

function TodayJobCard({ project, t }: { project: ProjectDoc; t: (key: string) => string }) {
  const address = formatProjectAddress(project);
  const mapsUrl = buildMapsUrl(project);

  return (
    <div className={cn(appPanelInsetClassName, "space-y-3")}>
      <div>
        <p className="font-semibold text-[#152238]">{project.name}</p>
        {address ? (
          <p className={cn(appMutedTextClassName, "mt-1 flex items-start gap-1.5")}>
            <MapPin className="size-3.5 shrink-0 mt-0.5 text-[#1D376A]" aria-hidden />
            {address}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/app/projects/${project.id}`}
          className={cn(buttonVariants({ size: "sm" }))}
        >
          {t("workerDashboard.openJob")}
        </Link>
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              appOutlineActionClassName,
              "gap-1.5"
            )}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t("workerDashboard.navigate")}
          </a>
        ) : null}
      </div>
    </div>
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
  const greetingKey = getGreetingKey(new Date().getHours());

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

  const firstProject = data?.activeAssignedProjects[0] ?? data?.assignedProjects[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <Card className={cn(appPanelClassName, "border-l-4 border-l-[#1D376A]")}>
        <CardContent className="space-y-2 pt-6 pb-5">
          <p className={appMutedTextClassName}>
            {t(`dashboard.hero.greeting.${greetingKey}`, { name: displayName })}
          </p>
          <h2 className="text-xl font-bold text-[#152238]">{companyName}</h2>
          <p className="text-sm font-semibold text-[#1D376A]">
            {t("workerDashboard.connectedAsWorker")}
          </p>
          <p className={cn(appSubtleTextClassName, "mt-3 border-t border-[#d8e0ea] pt-3")}>
            {t("workerDashboard.scopeHint")}
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="worker-today-heading">
        <h3 id="worker-today-heading" className={cn(appSectionHeadingClassName, "mb-3")}>
          {t("workerDashboard.today.title")}
        </h3>
        {loading ? (
          <div className="flex justify-center rounded-xl border border-[#b8c5d4] bg-white py-10 shadow-sm">
            <Loader2 className="size-6 animate-spin text-[#1D376A]" />
          </div>
        ) : data && data.todayProjects.length > 0 ? (
          <div className="space-y-3">
            {data.todayProjects.map((project) => (
              <TodayJobCard key={project.id} project={project} t={t} />
            ))}
          </div>
        ) : data && data.activeAssignedProjects.length > 0 ? (
          <TodayJobCard project={data.activeAssignedProjects[0]!} t={t} />
        ) : (
          <WorkerPanel>
            <p className={cn(appMutedTextClassName, "text-center font-medium")}>
              {t("workerDashboard.today.empty")}
            </p>
            <p className={cn(appSubtleTextClassName, "mt-2 text-center")}>
              {t("workerDashboard.today.emptyHint")}
            </p>
          </WorkerPanel>
        )}
      </section>

      <section aria-labelledby="worker-jobs-heading">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 id="worker-jobs-heading" className={appSectionHeadingClassName}>
            {t("workerDashboard.myJobs.title")}
          </h3>
          <Link
            href="/app/projects?filter=assigned"
            className="text-xs font-semibold text-[#c4522a] hover:text-[#e06737] hover:underline"
          >
            {t("workerDashboard.myJobs.viewAll")}
          </Link>
        </div>
        {loading ? null : data && data.activeAssignedProjects.length > 0 ? (
          <ul className="space-y-2" role="list">
            {data.activeAssignedProjects.slice(0, 5).map((project) => (
              <li key={project.id}>
                <Link href={`/app/projects/${project.id}`} className={appListRowClassName}>
                  <Briefcase className="size-4 shrink-0 text-[#1D376A]" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#152238]">{project.name}</p>
                    {formatProjectAddress(project) ? (
                      <p className={cn(appSubtleTextClassName, "truncate")}>
                        {formatProjectAddress(project)}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <WorkerPanel>
            <p className={cn(appMutedTextClassName, "text-center")}>
              {t("workerDashboard.myJobs.empty")}
            </p>
          </WorkerPanel>
        )}
      </section>

      <section aria-labelledby="worker-tasks-heading">
        <h3 id="worker-tasks-heading" className={cn(appSectionHeadingClassName, "mb-3")}>
          {t("workerDashboard.tasks.title")}
        </h3>
        {loading ? null : data && data.openTasks.length > 0 ? (
          <ul className="space-y-2" role="list">
            {data.openTasks.slice(0, 8).map((task) => (
              <li key={`${task.projectId}-${task.id}`}>
                <Link href={`/app/projects/${task.projectId}`} className={appListRowClassName}>
                  <CheckSquare className="size-4 shrink-0 mt-0.5 text-[#1D376A]" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#152238]">{task.title}</p>
                    <p className={cn(appSubtleTextClassName, "truncate")}>{task.projectName}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <WorkerPanel>
            <p className={cn(appMutedTextClassName, "text-center")}>
              {t("workerDashboard.tasks.comingSoon")}
            </p>
          </WorkerPanel>
        )}
      </section>

      <section aria-labelledby="worker-actions-heading">
        <h3 id="worker-actions-heading" className={cn(appSectionHeadingClassName, "mb-3")}>
          {t("workerDashboard.quickActions.title")}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/app/projects?filter=assigned"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-auto min-h-[3rem] justify-start gap-2 rounded-xl px-4 py-3 bg-[#1D376A] shadow-sm hover:bg-[#162d57]"
            )}
          >
            <Briefcase className="size-4 shrink-0" aria-hidden />
            {t("workerDashboard.quickActions.myJobs")}
          </Link>
          {firstProject ? (
            <Link
              href={`/app/projects/${firstProject.id}`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                appOutlineActionClassName,
                "h-auto min-h-[3rem] justify-start gap-2 rounded-xl px-4 py-3"
              )}
            >
              <Camera className="size-4 shrink-0" aria-hidden />
              {t("workerDashboard.quickActions.addPhoto")}
            </Link>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled
              className={cn(
                appOutlineActionClassName,
                "h-auto min-h-[3rem] justify-start gap-2 rounded-xl px-4 py-3 opacity-60"
              )}
            >
              <Camera className="size-4 shrink-0" aria-hidden />
              {t("workerDashboard.quickActions.addPhoto")}
            </Button>
          )}
          <Link
            href="/app/help"
            className={cn(
              buttonVariants({ variant: "outline" }),
              appOutlineActionClassName,
              "h-auto min-h-[3rem] justify-start gap-2 rounded-xl px-4 py-3"
            )}
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {t("workerDashboard.quickActions.reportProblem")}
          </Link>
          <Button
            type="button"
            variant="outline"
            disabled
            className={cn(
              appOutlineActionClassName,
              "h-auto min-h-[3rem] justify-start gap-2 rounded-xl px-4 py-3 opacity-60"
            )}
          >
            <Clock className="size-4 shrink-0" aria-hidden />
            {t("workerDashboard.quickActions.attendance")}
          </Button>
        </div>
      </section>

      <Card className={appPanelClassName}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-[#152238]">
            <User className="size-4 text-[#1D376A]" aria-hidden />
            {t("workerDashboard.profile.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/app/settings"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              appOutlineActionClassName
            )}
          >
            {t("workerDashboard.profile.myProfile")}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
