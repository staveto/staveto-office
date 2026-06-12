"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import {
  FirestoreIndexError,
  listProjectQuoteDraftItems,
  listProjectTasks,
} from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { listProjectDocuments, type ProjectDocumentRecord } from "@/services/projects/projectDocuments";
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
import { ProjectCompactHeader } from "./ProjectCompactHeader";
import { ProjectPhaseWorkflow } from "./ProjectPhaseWorkflow";
import { ProjectDetailTabs, type TabBadge } from "./ProjectDetailTabs";
import { ProjectOverviewTab } from "./ProjectOverviewTab";
import { ProjectTasksTab } from "./ProjectTasksTab";
import { ProjectWorkPlanTab } from "./ProjectWorkPlanTab";
import { listProjectPhases } from "@/services/projects/projectPhasesService";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import { ProjectQuoteTab } from "./ProjectQuoteTab";
import { ProjectDocumentsTab } from "./ProjectDocumentsTab";
import { ProjectActivityTab } from "./ProjectActivityTab";
import { ProjectExpensesPanel } from "@/components/projects/ProjectExpensesPanel";
import { computeProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import { computeProjectHealth } from "@/lib/projectHealth";
import { buildProjectActivity } from "@/lib/projectActivity";
import { taskMissingAssignee } from "@/lib/taskPlanningDisplay";

function parseTab(raw: string | null): ProjectDashboardTab {
  if (
    raw === "tasks" ||
    raw === "workplan" ||
    raw === "quote" ||
    raw === "documents" ||
    raw === "activity"
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setTasksError(null);
      try {
        const [tasksList, items, docs, phaseList, memberList, entries] = await Promise.all([
          listProjectTasks(project.id).catch((e) => {
            if (e instanceof FirestoreIndexError) throw e;
            return [] as TaskDoc[];
          }),
          listProjectQuoteDraftItems(project.id),
          listProjectDocuments(project.id),
          listProjectPhases(project.id),
          listAssignableProjectMembers(project).catch(() => [] as ProjectMemberRecord[]),
          listTimeEntriesForProjects([project.id], "1970-01-01", todayYmd()).catch(
            () => [] as TimeEntryDoc[]
          ),
        ]);
        if (cancelled) return;
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
  }, [project.id]);

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
      documents: { count: documents.length },
      activity: { count: activityCount },
    };
  }, [project, tasks, timeEntries, documents]);

  const handleTabChange = (tab: ProjectDashboardTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("setup");
    router.replace(`/app/projects/${project.id}?${params.toString()}`, { scroll: false });
  };

  const handleActionToast = (key: string) => {
    onActionToast?.(key);
  };

  const showExpenses = searchParams.get("tab") === "expenses";

  return (
    <div className="space-y-5">
      {toastMessage ? (
        <div className="rounded-lg border border-[#1D376A]/20 bg-[#1D376A]/5 px-4 py-2 text-sm text-[#1D376A]">
          {toastMessage}
        </div>
      ) : null}

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

      {phaseMetrics.phases.length > 0 ? (
        <ProjectPhaseWorkflow metrics={phaseMetrics} />
      ) : null}

      <ProjectDetailTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        badges={badges}
      />

      {loading && activeTab !== "overview" ? (
        <div className="py-12 text-center text-sm text-muted-foreground">…</div>
      ) : showExpenses ? (
        <ProjectExpensesPanel project={project} />
      ) : activeTab === "overview" ? (
        <ProjectOverviewTab
          project={project}
          userId={userId}
          tasks={tasks}
          phaseMetrics={phaseMetrics}
          members={members}
          timeEntries={timeEntries}
          documents={documents}
          activeTimers={activeTimers}
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
  );
}
