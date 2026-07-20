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
  isProjectDashboardTabVisible,
  type ProjectDashboardTab,
} from "@/lib/projectDashboard";
import {
  parseProjectDashboardTab,
  resolveProjectDefaultTabForProject,
} from "@/lib/projectDefaultTab";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { listProjectDocuments, type ProjectDocumentRecord } from "@/services/projects/projectDocuments";
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
import { buildPhaseLabelMap } from "@/lib/taskPlanningDisplay";
import { buildProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import { ProjectCompactHeader } from "./ProjectCompactHeader";
import { ProjectPhaseWorkflow } from "./ProjectPhaseWorkflow";
import { ProjectDetailTabs, type TabBadge } from "./ProjectDetailTabs";
import {
  ProjectOverviewTab,
  ProjectOverviewTodayFocus,
} from "./ProjectOverviewTab";
import { ProjectCockpitHelpButton } from "./overview/ProjectOverviewHint";
import { cn } from "@/lib/utils";
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
import {
  listProjectProblems,
} from "@/services/projects/projectProblemsReadService";
import { isOpenProblem } from "@/services/projects/projectProblemsService";
import { PlanningNotifyDialog } from "@/components/planning/PlanningScheduleFeedback";
import { useI18n } from "@/i18n/I18nContext";

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
  const { modules } = useEnabledModules();
  const [activeTab, setActiveTab] = useState<ProjectDashboardTab>(() =>
    resolveProjectDefaultTabForProject(project, searchParams.get("tab"), modules)
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
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const selectedProblemId = searchParams.get("problemId");
  const { t } = useI18n();

  useEffect(() => {
    const rawTab = searchParams.get("tab");
    const resolved = resolveProjectDefaultTabForProject(project, rawTab, modules);

    // Soft-land quote prep when URL has no tab — sync once, no loop.
    if (!rawTab && resolved === "quote") {
      setActiveTab("quote");
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "quote");
      router.replace(`/app/projects/${project.id}?${params.toString()}`, {
        scroll: false,
      });
      return;
    }

    const explicit = parseProjectDashboardTab(rawTab);
    if (
      explicit &&
      explicit !== resolved &&
      !isProjectDashboardTabVisible(explicit, modules) &&
      !(explicit === "quote")
    ) {
      // Hidden module tab → fall back without fighting explicit overview/quote.
      setActiveTab(resolved);
      const params = new URLSearchParams(searchParams.toString());
      if (resolved === "overview") params.delete("tab");
      else params.set("tab", resolved);
      params.delete("problemId");
      router.replace(
        params.toString()
          ? `/app/projects/${project.id}?${params.toString()}`
          : `/app/projects/${project.id}`,
        { scroll: false }
      );
      return;
    }

    setActiveTab(resolved);
    if (searchParams.get("problemId") && searchParams.get("tab") !== "problems") {
      if (isProjectDashboardTabVisible("problems", modules)) {
        setActiveTab("problems");
      }
    }
  }, [searchParams, modules, project, router]);

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

        if (cancelled) return;
        setOpenProblemsCount(problemsList.filter((p) => isOpenProblem(p)).length);
        setTasks(tasksList);
        setQuoteItems(items);
        setDocuments(docs);
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

  const overdueTasksCount = useMemo(() => {
    const today = todayYmd();
    return tasks
      .filter((t) => t.isActive !== false && (t.status ?? "OPEN").toUpperCase() !== "DONE")
      .filter((t) => {
        const d = t.plannedStart?.slice(0, 10) || t.dueDate?.slice(0, 10);
        return !!d && d < today;
      }).length;
  }, [tasks]);

  const openTasksCount = useMemo(
    () =>
      tasks.filter(
        (t) => t.isActive !== false && (t.status ?? "OPEN").toUpperCase() !== "DONE"
      ).length,
    [tasks]
  );

  const badges = useMemo<Partial<Record<ProjectDashboardTab, TabBadge>>>(() => {
    return {
      tasks: overdueTasksCount > 0 ? { count: overdueTasksCount } : undefined,
      documents: documents.length > 0 ? { count: documents.length } : undefined,
    };
  }, [documents.length, overdueTasksCount]);

  const handlePhaseOpen = (phaseId: string) => {
    setActiveTab("tasks");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "tasks");
    params.set("phaseId", phaseId);
    router.replace(`/app/projects/${project.id}?${params.toString()}`, { scroll: false });
  };

  const handleTabChange = (tab: ProjectDashboardTab) => {
    if (!isProjectDashboardTabVisible(tab, modules)) return;
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
  const showTodayFocus = overviewVm && !overviewVm.project.isDraft;

  return (
    <div className={cn("project-command flex flex-col gap-6", po.page)}>
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
          openTasksCount={openTasksCount}
          overdueTasksCount={overdueTasksCount}
          activeTab={activeTab}
          onProjectUpdated={onProjectUpdated}
          onActionToast={handleActionToast}
          onNavigate={handleTabChange}
        />
      </div>

      {showTodayFocus ? (
        <ProjectOverviewTodayFocus
          vm={overviewVm}
          onNavigate={handleTabChange}
          onNotifyTeam={() => setNotifyDialogOpen(true)}
          className="order-2"
        />
      ) : null}

      {phaseMetrics.phases.length > 0 ? (
        <div className="order-3">
          <ProjectPhaseWorkflow
            metrics={phaseMetrics}
            phaseStatuses={overviewVm?.phases}
            phaseDetails={overviewVm?.phases.map((p) => ({
              id: p.id,
              overdueCount: p.overdueCount,
            }))}
            waitingForQuote={isBlockedByUnsentQuote(project)}
            onPhaseClick={handlePhaseOpen}
          />
        </div>
      ) : null}

      <div className="order-4 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <ProjectDetailTabs
            project={project}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            badges={badges}
          />
        </div>
        <ProjectCockpitHelpButton className="mb-1.5 shrink-0" />
      </div>

      <div className="order-5">
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
          <ProjectQuoteTab
            project={project}
            quoteItems={quoteItems}
            tasks={tasks}
            userId={userId}
            onProjectUpdated={onProjectUpdated}
            onQuoteItemsChanged={setQuoteItems}
          />
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

      <PlanningNotifyDialog
        open={notifyDialogOpen}
        onOpenChange={setNotifyDialogOpen}
        taskTitle={overviewVm?.todayFocus.criticalTask?.title}
        onConfirm={() => handleActionToast("planning.notify.placeholder")}
        t={t}
      />
    </div>
  );
}
