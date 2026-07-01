"use client";

import { useMemo } from "react";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import type { ProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import type { ProjectHealth } from "@/lib/projectHealth";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import { buildPhaseLabelMap } from "@/lib/taskPlanningDisplay";
import { buildProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import { ProjectNextActions } from "./ProjectNextActions";
import { ProjectNextActionStrip } from "./overview/ProjectNextActionStrip";
import { ProjectActivePhaseWorkBoard } from "./overview/ProjectActivePhaseWorkBoard";
import { ProjectHealthCard } from "./overview/ProjectHealthCard";
import { ProjectTeamCard } from "./overview/ProjectTeamCard";
import { ProjectTimeCard } from "./overview/ProjectTimeCard";
import { ProjectDocumentsProofCard } from "./overview/ProjectDocumentsProofCard";
import { ProjectPhotosCard } from "./overview/ProjectPhotosCard";
import { ProjectActivityPreview } from "./overview/ProjectActivityPreview";
import {
  ProjectContactCard,
  ProjectSummaryCard,
} from "./overview/ProjectSummaryContactCards";

type ProjectOverviewTabProps = {
  project: ProjectDoc;
  userId: string;
  tasks: TaskDoc[];
  phases: ProjectPhaseRecord[];
  phaseMetrics: ProjectPhaseMetrics;
  members: ProjectMemberRecord[];
  timeEntries: TimeEntryDoc[];
  documents: ProjectDocumentRecord[];
  activeTimers: Map<string, ActiveTimerState>;
  health: ProjectHealth;
  onProjectUpdated: (project: ProjectDoc) => void;
  onNavigate: (tab: ProjectDashboardTab) => void;
  /** When true, next-action strip is rendered by the parent (mobile order). */
  hideNextActionStrip?: boolean;
};

export function ProjectOverviewTab({
  project,
  userId,
  tasks,
  phases,
  phaseMetrics,
  members,
  timeEntries,
  documents,
  activeTimers,
  health,
  onProjectUpdated,
  onNavigate,
  hideNextActionStrip = false,
}: ProjectOverviewTabProps) {
  const phaseLabels = useMemo(() => buildPhaseLabelMap(phases), [phases]);

  const vm = useMemo(
    () =>
      buildProjectOverviewViewModel({
        project,
        tasks,
        phaseMetrics,
        members,
        timeEntries,
        documents,
        activeTimers,
        health,
        phaseLabels,
      }),
    [
      project,
      tasks,
      phaseMetrics,
      members,
      timeEntries,
      documents,
      activeTimers,
      health,
      phaseLabels,
    ]
  );

  if (vm.project.isDraft) {
    return (
      <div className="space-y-5">
        <ProjectNextActions
          project={project}
          userId={userId}
          onProjectUpdated={onProjectUpdated}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!hideNextActionStrip ? (
        <ProjectNextActionStrip nextAction={vm.nextAction} onNavigate={onNavigate} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className="lg:col-start-1 lg:row-start-1">
          <ProjectActivePhaseWorkBoard
            activePhaseName={vm.progress.activePhaseName}
            tasks={vm.activePhaseTasks}
            onNavigate={onNavigate}
          />
        </div>
        <div className="lg:col-start-2 lg:row-start-1">
          <ProjectHealthCard progress={vm.progress} />
        </div>
        <div className="lg:col-start-2 lg:row-start-2">
          <ProjectTeamCard team={vm.team} onNavigate={onNavigate} />
        </div>
        <div className="lg:col-start-2 lg:row-start-3">
          <ProjectTimeCard time={vm.time} />
        </div>
        <div className="lg:col-start-2 lg:row-start-4">
          <ProjectDocumentsProofCard documents={vm.documents} onNavigate={onNavigate} />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <ProjectPhotosCard photos={vm.photos} onNavigate={onNavigate} />
        </div>
        <div className="lg:col-start-1 lg:row-start-3">
          <ProjectActivityPreview activity={vm.activity} onNavigate={onNavigate} />
        </div>
        <div className="lg:col-start-1 lg:row-start-4">
          <ProjectSummaryCard project={project} />
        </div>
        <div className="lg:col-start-2 lg:row-start-5">
          <ProjectContactCard
            project={project}
            customerName={vm.project.customerName}
            location={vm.project.location}
          />
        </div>
      </div>
    </div>
  );
}

export function ProjectOverviewNextActionStrip({
  vm,
  onNavigate,
  className,
}: {
  vm: ReturnType<typeof buildProjectOverviewViewModel>;
  onNavigate: (tab: ProjectDashboardTab) => void;
  className?: string;
}) {
  if (vm.project.isDraft) return null;
  return (
    <div className={className}>
      <ProjectNextActionStrip nextAction={vm.nextAction} onNavigate={onNavigate} />
    </div>
  );
}
