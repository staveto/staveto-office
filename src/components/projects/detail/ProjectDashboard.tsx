"use client";

import { useEffect, useState } from "react";
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
import type { WorkspaceRole } from "@/types/workspace";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectKpiCards } from "./ProjectKpiCards";
import { ProjectDetailTabs } from "./ProjectDetailTabs";
import { ProjectOverviewTab } from "./ProjectOverviewTab";
import { ProjectTasksTab } from "./ProjectTasksTab";
import { ProjectWorkPlanTab } from "./ProjectWorkPlanTab";
import { listProjectPhases } from "@/services/projects/projectPhasesService";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import { ProjectQuoteTab } from "./ProjectQuoteTab";
import { ProjectDocumentsTab } from "./ProjectDocumentsTab";
import { ProjectActivityTab } from "./ProjectActivityTab";
import { ProjectExpensesPanel } from "@/components/projects/ProjectExpensesPanel";

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
        const [tasksList, items, docs, phaseList] = await Promise.all([
          listProjectTasks(project.id).catch((e) => {
            if (e instanceof FirestoreIndexError) throw e;
            return [] as TaskDoc[];
          }),
          listProjectQuoteDraftItems(project.id),
          listProjectDocuments(project.id),
          listProjectPhases(project.id),
        ]);
        if (cancelled) return;
        setTasks(tasksList);
        setQuoteItems(items);
        setDocuments(docs);
        setPhases(phaseList);
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
    <div className="space-y-6">
      {toastMessage ? (
        <div className="rounded-lg border border-[#1D376A]/20 bg-[#1D376A]/5 px-4 py-2 text-sm text-[#1D376A]">
          {toastMessage}
        </div>
      ) : null}

      <ProjectHeader
        project={project}
        userId={userId}
        role={role}
        onProjectUpdated={onProjectUpdated}
        onActionToast={handleActionToast}
      />

      <ProjectKpiCards
        project={project}
        tasks={tasks}
        quoteItems={quoteItems}
      />

      <ProjectDetailTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {loading && activeTab !== "overview" ? (
        <div className="py-12 text-center text-sm text-muted-foreground">…</div>
      ) : showExpenses ? (
        <ProjectExpensesPanel project={project} />
      ) : activeTab === "overview" ? (
        <ProjectOverviewTab
          project={project}
          userId={userId}
          onProjectUpdated={onProjectUpdated}
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
        <ProjectActivityTab project={project} />
      ) : null}
    </div>
  );
}
