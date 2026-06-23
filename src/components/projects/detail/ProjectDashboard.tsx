"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import {
  FirestoreIndexError,
  getProject,
  listProjectQuoteDraftItems,
  listProjectTasks,
} from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import {
  isBlockedByUnsentQuote,
  type ProjectDashboardTab,
} from "@/lib/projectDashboard";
import { listProjectDocuments, type ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import { importAiWizardAttachmentsToProjectDetailed } from "@/services/projects/projectAiAttachmentsService";
import { useWorkspace } from "@/context/WorkspaceContext";
import { listAssignableProjectMembers } from "@/services/projects/projectMembersService";
import {
  listTimeEntriesForProjects,
  type TimeEntryDoc,
} from "@/services/attendance/timeTrackingReadService";
import {
  loadActiveTimers,
  type ActiveTimerState,
} from "@/services/operations/teamLiveStatusService";
import type { ProjectMemberRecord } from "@/services/projects/taskPlanningTypes";
import type { WorkspaceRole } from "@/types/workspace";
import { isDraftJob } from "@/lib/projectLifecycle";
import { buildPhaseLabelMap, taskMissingAssignee } from "@/lib/taskPlanningDisplay";
import { buildProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import { ProjectCompactHeader } from "./ProjectCompactHeader";
import { ProjectPhaseWorkflow } from "./ProjectPhaseWorkflow";
import { ProjectDetailTabs, type TabBadge } from "./ProjectDetailTabs";
import {
  ProjectOverviewTab,
  ProjectOverviewNextActionStrip,
} from "./ProjectOverviewTab";
import { po } from "./overview/poStyles";
import { ProjectTasksTab } from "./ProjectTasksTab";
import { ProjectWorkPlanTab } from "./ProjectWorkPlanTab";
import { listProjectPhases } from "@/services/projects/projectPhasesService";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import { ProjectQuoteTab } from "./ProjectQuoteTab";
import { ProjectDocumentsTab } from "./ProjectDocumentsTab";
import { ProjectActivityTab } from "./ProjectActivityTab";
import { ProjectProblemsTab } from "./ProjectProblemsTab";
import { ProjectExpensesPanel } from "@/components/projects/ProjectExpensesPanel";
import { computeProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import { computeProjectHealth } from "@/lib/projectHealth";
import { buildProjectActivity } from "@/lib/projectActivity";
import {
  listProjectProblems,
} from "@/services/projects/projectProblemsReadService";
import { isOpenProblem } from "@/services/projects/projectProblemsService";
import { cn } from "@/lib/utils";

function parseTab(raw: string | null): ProjectDashboardTab {
  if (
    raw === "tasks" ||
    raw === "workplan" ||
    raw === "quote" ||
    raw === "documents" ||
    raw === "activity" ||
    raw === "problems"
  ) {
    return raw;
  }
  if (raw === "materials" || raw === "expenses") return "quote";
  if (raw === "overview") return "overview";
  return "overview";
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

type ProjectDashboardProps = {
  project: ProjectDoc;
  userId: string;
  role?: WorkspaceRole;
  onProjectUpdated: (project: ProjectDoc) => void;
  toastMessage?: string | null;
  onActionToast?: (key: string) => void;
};

export function ProjectDashboard({
  project,
  userId,
  role,
  onProjectUpdated,
  toastMessage,
  onActionToast,
}: ProjectDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ProjectDashboardTab>(() =>
    parseTab(searchParams.get("tab"))
  );
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [quoteItems, setQuoteItems] = useState<QuoteDraftItemDoc[]>([]);
  const [documents, setDocuments] = useState<ProjectDocumentRecord[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [phases, setPhases] = useState<ProjectPhaseRecord[]>([]);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntryDoc[]>([]);
  const [activeTimers, setActiveTimers] = useState<Map<string, ActiveTimerState>>(new Map());
  const [openProblemsCount, setOpenProblemsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const selectedProblemId = searchParams.get("problemId");

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
    if (searchParams.get("problemId") && searchParams.get("tab") !== "problems") {
      setActiveTab("problems");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setTasksError(null);
      try {
        const freshProject = (await getProject(project.id)) ?? project;

        const [tasksList, items, docs, phaseList, memberList, entries, problemsList] =
          await Promise.all([
          listProjectTasks(project.id).catch((e) => {
            if (e instanceof FirestoreIndexError) throw e;
            return [] as TaskDoc[];
          }),
          listProjectQuoteDraftItems(project.id),
          listProjectDocuments(project.id),
          listProjectPhases(project.id),
          listAssignableProjectMembers(freshProject).catch(() => [] as ProjectMemberRecord[]),
          listTimeEntriesForProjects([project.id], "1970-01-01", todayYmd()).catch(
            () => [] as TimeEntryDoc[]
          ),
          listProjectProblems(project.id).catch(() => []),
        ]);

        let resolvedDocs = docs;
        const canImportAiAttachments =
          resolvedDocs.length === 0 &&
          activeWorkspace &&
          (freshProject.createdByAI ||
            !!freshProject.aiDraftId ||
            (freshProject.attachedFileIds?.length ?? 0) > 0 ||
            (freshProject.aiWizardAttachmentPaths?.length ?? 0) > 0);

        if (canImportAiAttachments) {
          const { imported } = await importAiWizardAttachmentsToProjectDetailed({
            projectId: project.id,
            workspace: activeWorkspace,
            userId,
            project: freshProject,
          }).catch(() => ({ imported: [], errors: [] }));
          if (imported.length > 0) {
            resolvedDocs = imported;
          } else {
            resolvedDocs = await listProjectDocuments(project.id).catch(() => docs);
          }
        }

        if (cancelled) return;
        setOpenProblemsCount(problemsList.filter((p) => isOpenProblem(p)).length);
        setTasks(tasksList);
        setQuoteItems(items);
        setDocuments(resolvedDocs);
        setPhases(phaseList);
        setMembers(memberList);
        setTimeEntries(entries);

        const timers = await loadActiveTimers(memberList.map((m) => m.userId)).catch(
          () => new Map<string, ActiveTimerState>()
        );
        if (!cancelled) setActiveTimers(timers);
      } catch (e) {
        if (!cancelled) {
          setTasksError(e instanceof FirestoreIndexError ? e.message : null);
          setTasks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.createdByAI, project.attachedFileIds, project.aiWizardAttachmentPaths, project.aiDraftId, userId, activeWorkspace]);

  const phaseMetrics = useMemo(
    () => computeProjectPhaseMetrics(phases, tasks),
    [phases, tasks]
  );

  const investedMinutes = useMemo(
    () => timeEntries.reduce((s, e) => s + Math.max(0, e.durationMinutes || 0), 0),
    [timeEntries]
  );

  const health = useMemo(
    () =>
      computeProjectHealth({
        project,
        tasks,
        phaseMetrics,
        assignedCrewCount: members.length,
      }),
    [project, tasks, phaseMetrics, members.length]
  );

  const overviewVm = useMemo(() => {
    if (isDraftJob(project)) return null;
    return buildProjectOverviewViewModel({
      project,
      tasks,
      phaseMetrics,
      members,
      timeEntries,
      documents,
      activeTimers,
      health,
      phaseLabels: buildPhaseLabelMap(phases),
    });
  }, [project, tasks, phaseMetrics, members, timeEntries, documents, activeTimers, health, phases]);

  const badges = useMemo<Partial<Record<ProjectDashboardTab, TabBadge>>>(() => {
    const active = tasks.filter((x) => x.isActive !== false);
    const openUnassigned = active.filter(
      (x) => x.status !== "DONE" && taskMissingAssignee(x)
    ).length;
    const activityCount = buildProjectActivity({
      project,
      tasks,
      timeEntries,
      documents,
    }).length;
    return {
      tasks: { count: active.length },
      workplan: { count: openUnassigned, warn: openUnassigned > 0 },
      problems: { count: openProblemsCount, warn: openProblemsCount > 0 },
      documents: { count: documents.length },
      activity: { count: activityCount },
    };
  }, [project, tasks, timeEntries, documents, openProblemsCount]);

  const handleTabChange = (tab: ProjectDashboardTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("setup");
    if (tab !== "problems") params.delete("problemId");
    router.replace(`/app/projects/${project.id}?${params.toString()}`, { scroll: false });
  };

  const handleProblemIdChange = (problemId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "problems");
    if (problemId) params.set("problemId", problemId);
    else params.delete("problemId");
    router.replace(`/app/projects/${project.id}?${params.toString()}`, { scroll: false });
  };

  const handleActionToast = (key: string) => {
    onActionToast?.(key);
  };

  const showExpenses = searchParams.get("tab") === "expenses";
  const showOverviewCommand = activeTab === "overview" && overviewVm && !overviewVm.project.isDraft;

  return (
    <div className={cn("project-command flex flex-col gap-4", po.page)}>
      {toastMessage ? (
        <div className="rounded-lg border border-[var(--po-card-border)] bg-[var(--po-card-muted)] px-4 py-2 text-sm text-[var(--po-text-primary)]">
          {toastMessage}
        </div>
      ) : null}

      <div className="order-1">
        <ProjectCompactHeader
          project={project}
          userId={userId}
          role={role}
          health={health}
          phaseMetrics={phaseMetrics}
          crewCount={members.length}
          investedMinutes={investedMinutes}
          onProjectUpdated={onProjectUpdated}
          onActionToast={handleActionToast}
          onNavigate={handleTabChange}
        />
      </div>

      {showOverviewCommand ? (
        <ProjectOverviewNextActionStrip
          vm={overviewVm}
          onNavigate={handleTabChange}
          className="order-2 lg:hidden"
        />
      ) : null}

      {phaseMetrics.phases.length > 0 ? (
        <div className="order-3 lg:order-2">
          <ProjectPhaseWorkflow
            metrics={phaseMetrics}
            phaseStatuses={overviewVm?.phases}
            waitingForQuote={isBlockedByUnsentQuote(project)}
          />
        </div>
      ) : null}

      <div className="order-4 lg:order-3">
        <ProjectDetailTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          badges={badges}
        />
      </div>

      {showOverviewCommand ? (
        <ProjectOverviewNextActionStrip
          vm={overviewVm}
          onNavigate={handleTabChange}
          className="order-5 hidden lg:block"
        />
      ) : null}

      <div className="order-6 lg:order-5">
        {loading && activeTab !== "overview" && activeTab !== "problems" ? (
          <div className="py-12 text-center text-sm text-[var(--po-text-muted)]">…</div>
        ) : showExpenses ? (
          <ProjectExpensesPanel project={project} />
        ) : activeTab === "overview" ? (
          <ProjectOverviewTab
            project={project}
            userId={userId}
            tasks={tasks}
            phases={phases}
            phaseMetrics={phaseMetrics}
            members={members}
            timeEntries={timeEntries}
            documents={documents}
            activeTimers={activeTimers}
            health={health}
            onProjectUpdated={onProjectUpdated}
            onNavigate={handleTabChange}
            hideNextActionStrip
          />
        ) : activeTab === "tasks" ? (
          <ProjectTasksTab
            project={project}
            tasks={tasks}
            tasksError={tasksError}
            onTasksChange={setTasks}
            userId={userId}
            role={role}
          />
        ) : activeTab === "workplan" ? (
          <ProjectWorkPlanTab
            project={project}
            tasks={tasks}
            phases={phases}
            userId={userId}
            role={role}
            onTasksChange={setTasks}
          />
        ) : activeTab === "problems" ? (
          <ProjectProblemsTab
            project={project}
            initialProblemId={selectedProblemId}
            onProblemIdChange={handleProblemIdChange}
          />
        ) : activeTab === "quote" ? (
          <ProjectQuoteTab project={project} quoteItems={quoteItems} tasks={tasks} />
        ) : activeTab === "documents" ? (
          <ProjectDocumentsTab
            project={project}
            documents={documents}
            userId={userId}
            onDocumentsChange={setDocuments}
          />
        ) : activeTab === "activity" ? (
          <ProjectActivityTab
            project={project}
            tasks={tasks}
            timeEntries={timeEntries}
            documents={documents}
          />
        ) : null}
      </div>
    </div>
  );
}
