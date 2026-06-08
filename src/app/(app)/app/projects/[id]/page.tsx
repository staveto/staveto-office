"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { canEditProjectExpenses } from "@/lib/expenses";
import {
  listProjectTasks,
  createTask,
  updateTaskStatus,
  hasProjectAccess,
  FirestoreIndexError,
  type ProjectDoc,
  type TaskDoc,
} from "@/lib/projects";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, Circle, Loader2, Plus } from "lucide-react";
import { isDraftJob } from "@/lib/projectLifecycle";
import { DraftJobWorkspace } from "@/components/jobs/DraftJobWorkspace";
import { JobLifecycleBadge } from "@/components/jobs/JobLifecycleBadge";
import { WorkTypeBadge } from "@/components/jobs/WorkTypeBadge";
import { ProjectOwnershipBadge } from "@/components/projects/ProjectOwnershipBadge";
import { ProjectOwnershipMeta } from "@/components/projects/ProjectOwnershipMeta";
import { ProjectMaterialsPanel } from "@/components/projects/ProjectMaterialsPanel";
import { ProjectExpensesPanel } from "@/components/projects/ProjectExpensesPanel";

type TabId = "overview" | "tasks" | "expenses" | "materials";

function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded bg-muted/50 animate-pulse" />
      <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const { role } = useWorkspaceProduct();
  const id = params.id as string;

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [tasks, setTasks] = useState<TaskDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = searchParams.get("tab");
    if (tab === "materials" || tab === "tasks" || tab === "expenses" || tab === "overview") {
      return tab;
    }
    return "overview";
  });
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user?.id) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setAccessDenied(false);
      try {
        const { allowed, project: p } = await hasProjectAccess(id, user!.id);
        if (cancelled) return;
        if (!allowed || !p) {
          setAccessDenied(true);
          setProject(null);
          setTasks([]);
          setLoading(false);
          return;
        }
        setProject(p);
        const draft = isDraftJob(p);
        if (draft) {
          setTasks([]);
          setLoading(false);
          return;
        }
        setTasksError(null);
        try {
          const tasksList = await listProjectTasks(id);
          if (cancelled) return;
          setTasks(tasksList);
        } catch (te) {
          if (cancelled) return;
          setTasksError(te instanceof FirestoreIndexError ? te.message : "Failed to load tasks");
          setTasks([]);
        }
      } catch {
        if (!cancelled) {
          setAccessDenied(true);
          setProject(null);
          setTasks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

  const handleAddTask = async () => {
    if (!project || !newTaskTitle.trim() || addingTask) return;
    setAddingTask(true);
    try {
      const taskId = await createTask(project.id, newTaskTitle.trim());
      setTasks((prev) => [
        ...prev,
        {
          id: taskId,
          projectId: project.id,
          title: newTaskTitle.trim(),
          status: "OPEN",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      setNewTaskTitle("");
    } catch {
      // ignore
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTask = async (task: TaskDoc) => {
    if (!project || togglingTaskId) return;
    setTogglingTaskId(task.id);
    try {
      const nextStatus = task.status === "DONE" ? "OPEN" : "DONE";
      await updateTaskStatus(project.id, task.id, nextStatus);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: nextStatus } : t
        )
      );
    } catch {
      // ignore
    } finally {
      setTogglingTaskId(null);
    }
  };

  const canEditProject = !!project && !!user?.id && canEditProjectExpenses(project, user.id, role);

  if (loading) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("projects.titleJobs")}
        </Link>
        <ProjectDetailSkeleton />
      </div>
    );
  }

  if (accessDenied || !project) {
    return (
      <div className="space-y-6">
        <Link
          href="/app/projects"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("projects.titleJobs")}
        </Link>
        <Card className="border-destructive/50">
          <CardContent className="py-8">
            <p className="text-center text-destructive font-medium">
              {t("projects.accessDenied")}
            </p>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {t("projects.accessDeniedHint")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showDraft = isDraftJob(project);

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: t("projects.tabOverview") },
    { id: "tasks", label: t("projects.tabTasks") },
    { id: "expenses", label: t("projects.tabExpenses") },
    { id: "materials", label: t("projects.tabMaterials") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/app/projects"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="size-4" />
            {t("projects.titleJobs")}
          </Link>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("projects.jobDetailLabel")}
          </p>
          <h1 className="text-xl font-semibold">{project.name || t("projects.noName")}</h1>
          <ProjectOwnershipMeta project={project} className="mt-2" />
          {(project.addressText || project.city) && (
            <p className="text-sm text-muted-foreground mt-1">
              {[project.addressText, project.city].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <ProjectOwnershipBadge project={project} />
          <WorkTypeBadge project={project} />
          <JobLifecycleBadge project={project} />
        </div>
      </div>

      {showDraft && user?.id ? (
        <DraftJobWorkspace
          project={project}
          userId={user.id}
          onProjectUpdated={setProject}
        />
      ) : (
        <>
      <WorkTypeBadge project={project} />

      <div className="flex gap-2 border-b">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? "border-b-2 border-[#1D376A] rounded-b-none"
                : ""
            }
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "overview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("projects.tabOverview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProjectOwnershipMeta project={project} variant="panel" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">{t("projects.tabTasks")}</p>
                <p className="text-lg font-medium">{tasks.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("projects.tabExpenses")}</p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-lg font-medium"
                  onClick={() => setActiveTab("expenses")}
                >
                  {t("quotes.view")}
                </Button>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {t("help.faq2a")}
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === "tasks" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("projects.tabTasks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder={t("projects.newTaskPlaceholder")}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTask())}
              />
              <Button
                size="sm"
                onClick={handleAddTask}
                disabled={addingTask || !newTaskTitle.trim()}
              >
                <Plus className="size-4 mr-2" />
                {t("projects.addTask")}
              </Button>
            </div>
            {tasksError && (
              <p className="text-sm text-destructive">{tasksError}</p>
            )}
            {tasks.length === 0 && !tasksError ? (
              <div className="py-12 text-center text-muted-foreground">
                {t("projects.tasksEmpty")}
              </div>
            ) : tasks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("projects.tasksToggle")}</TableHead>
                    <TableHead>{t("estimates.titleCol")}</TableHead>
                    <TableHead>{t("estimates.statusCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="w-12">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleTask(task)}
                          disabled={togglingTaskId === task.id}
                          title={task.status === "DONE" ? "Mark open" : "Mark done"}
                          className="p-0 h-8 w-8"
                        >
                          {togglingTaskId === task.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : task.status === "DONE" ? (
                            <CheckCircle2 className="size-4 text-[#e06737]" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            task.status === "DONE"
                              ? "line-through text-muted-foreground"
                              : ""
                          }
                        >
                          {task.title || t("projects.noName")}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={task.status === "DONE" ? "secondary" : "default"}>
                          {task.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </CardContent>
        </Card>
      )}

      {activeTab === "materials" && (
        <ProjectMaterialsPanel project={project} canEdit={canEditProject} />
      )}

      {activeTab === "expenses" && <ProjectExpensesPanel project={project} />}
        </>
      )}
    </div>
  );
}
