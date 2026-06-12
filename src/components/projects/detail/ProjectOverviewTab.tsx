"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { excerptText, getProjectSummaryText } from "@/lib/projectDashboard";
import type { ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import { buildProjectActivity, recentProjectActivity } from "@/lib/projectActivity";
import { ProjectNextActions } from "./ProjectNextActions";
import { ProjectPhaseWorkflow } from "./ProjectPhaseWorkflow";
import { ProjectTodayActionsPanel } from "./ProjectTodayActionsPanel";
import { ProjectCrewSummary } from "./ProjectCrewSummary";
import { ProjectTimeInvestmentPanel } from "./ProjectTimeInvestmentPanel";
import { useI18n } from "@/i18n/I18nContext";

type ProjectOverviewTabProps = {
  project: ProjectDoc;
  userId: string;
  tasks: TaskDoc[];
  phaseMetrics: ProjectPhaseMetrics;
  members: ProjectMemberRecord[];
  timeEntries: TimeEntryDoc[];
  documents: ProjectDocumentRecord[];
  activeTimers: Map<string, ActiveTimerState>;
  onProjectUpdated: (project: ProjectDoc) => void;
  onNavigate: (tab: ProjectDashboardTab) => void;
};

export function ProjectOverviewTab({
  project,
  userId,
  tasks,
  phaseMetrics,
  members,
  timeEntries,
  documents,
  activeTimers,
  onProjectUpdated,
  onNavigate,
}: ProjectOverviewTabProps) {
  const { t } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const fullSummary = getProjectSummaryText(project);
  const excerpt = excerptText(fullSummary, 220);
  const hasMore = fullSummary.length > excerpt.length;

  const recent = useMemo(
    () =>
      recentProjectActivity(
        buildProjectActivity({ project, tasks, timeEntries, documents }),
        5
      ),
    [project, tasks, timeEntries, documents]
  );

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5">
      <ProjectNextActions
        project={project}
        userId={userId}
        onProjectUpdated={onProjectUpdated}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ProjectTodayActionsPanel
          tasks={tasks}
          onOpenTasks={() => onNavigate("tasks")}
          onOpenWorkPlan={() => onNavigate("workplan")}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base text-[#1D376A]">
              {t("projects.overview.progress")}
            </CardTitle>
            <Button
              variant="link"
              className="h-auto p-0 text-xs text-[#e06737]"
              onClick={() => onNavigate("tasks")}
            >
              {t("projects.overview.openTasks")}
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-[#1D376A]">
                {phaseMetrics.overallPercent}%
              </span>
              <span className="text-sm text-muted-foreground">
                {t("projects.dashboard.kpi.tasksDone", {
                  done: String(phaseMetrics.doneTasks),
                  total: String(phaseMetrics.totalTasks),
                })}
              </span>
            </div>
            <ProjectPhaseWorkflow metrics={phaseMetrics} compact />
          </CardContent>
        </Card>

        <ProjectCrewSummary
          members={members}
          tasks={tasks}
          activeTimers={activeTimers}
          onAssignCrew={() => onNavigate("workplan")}
        />

        <ProjectTimeInvestmentPanel entries={timeEntries} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base text-[#1D376A]">
            {t("projects.overview.recentActivity")}
          </CardTitle>
          <Button
            variant="link"
            className="h-auto p-0 text-xs text-[#e06737]"
            onClick={() => onNavigate("activity")}
          >
            {t("projects.overview.viewAll")}
            <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("projects.draft.activityPlaceholder")}
            </p>
          ) : (
            <ul className="space-y-3">
              {recent.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 text-foreground">
                    {t(event.titleKey, event.params)}
                    {event.detail ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {event.detail}
                      </span>
                    ) : null}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(event.date)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {excerpt ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#1D376A]">
              {t("projects.dashboard.summary.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed text-foreground">{excerpt}</p>
            {hasMore ? (
              <Button
                variant="link"
                className="h-auto p-0 text-[#e06737]"
                onClick={() => setInfoOpen(true)}
              >
                {t("projects.dashboard.summary.showMore")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-[#1D376A]">
            {t("projects.dashboard.contactCard.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t("projects.draft.customerEmail")}</dt>
              <dd className="mt-0.5 font-medium">
                {project.customerEmail?.trim() || t("projects.dashboard.notSet")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("projects.draft.customerPhone")}</dt>
              <dd className="mt-0.5 font-medium">
                {project.customerPhone?.trim() || t("projects.dashboard.notSet")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("projects.dashboard.summary.modalTitle")}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{fullSummary}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
