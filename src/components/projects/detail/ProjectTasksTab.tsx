"use client";

import { useEffect, useMemo, useState } from "react";
import { OctagonAlert, Plus, UserX, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import { createTask, updateTaskStatus } from "@/lib/projects";
import {
  getTaskPlanDate,
  taskMissingAssignee,
  taskMissingTools,
} from "@/lib/taskPlanningDisplay";
import { computeProjectPhaseMetrics } from "@/lib/projectPhaseMetrics";
import {
  canManageTaskPlanning,
  canWorkerToggleTaskStatus,
  filterTasksForWorkerView,
} from "@/lib/taskPlanningPermissions";
import { listAssignableProjectMembers } from "@/services/projects/projectMembersService";
import { listProjectTools } from "@/services/projects/projectToolsService";
import { listProjectPhases } from "@/services/projects/projectPhasesService";
import {
  clearTaskAssignee,
  updateTaskAssignee,
  updateTaskPlannedDate,
} from "@/services/projects/taskAssignmentService";
import { updateTaskTools } from "@/services/projects/taskToolsService";
import type {
  ProjectMemberRecord,
  ProjectPhaseRecord,
  TaskToolSnapshot,
} from "@/services/projects/taskPlanningTypes";
import type { WorkspaceRole } from "@/types/workspace";
import { TaskAssigneePicker } from "./TaskAssigneePicker";
import { TaskToolsPicker } from "./TaskToolsPicker";
import { ProjectPhaseWorkflow } from "./ProjectPhaseWorkflow";
import { ProjectTaskGroups } from "./ProjectTaskGroups";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type ProjectTasksTabProps = {
  project: ProjectDoc;
  tasks: TaskDoc[];
  tasksError: string | null;
  onTasksChange: (tasks: TaskDoc[]) => void;
  userId: string;
  role?: WorkspaceRole;
};

type StatusFilter = "all" | "open" | "done" | "blocked";

type FilterState = {
  memberId: string;
  phaseId: string;
  status: StatusFilter;
  unassignedOnly: boolean;
  missingToolsOnly: boolean;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function ProjectTasksTab({
  project,
  tasks,
  tasksError,
  onTasksChange,
  userId,
  role,
}: ProjectTasksTabProps) {
  const { t } = useI18n();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [tools, setTools] = useState<TaskToolSnapshot[]>([]);
  const [phases, setPhases] = useState<ProjectPhaseRecord[]>([]);
  const [assigneeTask, setAssigneeTask] = useState<TaskDoc | null>(null);
  const [toolsTask, setToolsTask] = useState<TaskDoc | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    memberId: "all",
    phaseId: "all",
    status: "all",
    unassignedOnly: false,
    missingToolsOnly: false,
  });

  const myMemberRecord = useMemo(
    () => members.find((m) => m.userId === userId) ?? null,
    [members, userId]
  );
  const canManage = useMemo(
    () => canManageTaskPlanning(project, userId, role, myMemberRecord),
    [project, userId, role, myMemberRecord]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, toolList, phaseList] = await Promise.all([
        listAssignableProjectMembers(project),
        listProjectTools(project, userId),
        listProjectPhases(project.id),
      ]);
      if (!cancelled) {
        setMembers(m);
        setTools(toolList);
        setPhases(phaseList);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, userId]);

  const baseTasks = useMemo(
    () => (canManage ? tasks : filterTasksForWorkerView(tasks, userId)),
    [tasks, canManage, userId]
  );

  const today = todayYmd();
  const attention = useMemo(() => {
    const open = baseTasks.filter(
      (x) => x.isActive !== false && (x.status ?? "OPEN").toUpperCase() !== "DONE"
    );
    return {
      unassigned: open.filter(taskMissingAssignee).length,
      missingTools: open.filter(taskMissingTools).length,
      overdue: open.filter((x) => {
        const d = getTaskPlanDate(x);
        return !!d && d < today;
      }).length,
      blocked: open.filter((x) => (x.status ?? "").toUpperCase() === "BLOCKED").length,
    };
  }, [baseTasks, today]);

  const visibleTasks = useMemo(() => {
    let list = baseTasks;
    if (filters.memberId !== "all") {
      list = list.filter((task) => task.assigneeId === filters.memberId);
    }
    if (filters.phaseId !== "all") {
      if (filters.phaseId === "__general__") {
        list = list.filter((task) => !task.phaseId?.trim());
      } else {
        list = list.filter((task) => task.phaseId === filters.phaseId);
      }
    }
    if (filters.status === "open") {
      list = list.filter((task) => task.status !== "DONE");
    } else if (filters.status === "done") {
      list = list.filter((task) => task.status === "DONE");
    } else if (filters.status === "blocked") {
      list = list.filter((task) => (task.status ?? "").toUpperCase() === "BLOCKED");
    }
    if (filters.unassignedOnly) list = list.filter(taskMissingAssignee);
    if (filters.missingToolsOnly) list = list.filter(taskMissingTools);
    return list;
  }, [baseTasks, filters]);

  const phaseMetrics = useMemo(
    () => computeProjectPhaseMetrics(phases, visibleTasks),
    [phases, visibleTasks]
  );

  const patchTask = (taskId: string, patch: Partial<TaskDoc>) => {
    onTasksChange(tasks.map((x) => (x.id === taskId ? { ...x, ...patch } : x)));
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || addingTask) return;
    setAddingTask(true);
    try {
      const taskId = await createTask(project.id, newTaskTitle.trim());
      onTasksChange([
        ...tasks,
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
      /* ignore */
    } finally {
      setAddingTask(false);
    }
  };

  const handleToggleTask = async (task: TaskDoc) => {
    if (togglingTaskId || !canWorkerToggleTaskStatus(task, userId, canManage)) return;
    setTogglingTaskId(task.id);
    try {
      const nextStatus = task.status === "DONE" ? "OPEN" : "DONE";
      await updateTaskStatus(project.id, task.id, nextStatus);
      patchTask(task.id, { status: nextStatus });
    } catch {
      /* ignore */
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handleAssigneeSelect = async (member: ProjectMemberRecord | null) => {
    if (!assigneeTask) return;
    setSavingTaskId(assigneeTask.id);
    try {
      if (member) {
        await updateTaskAssignee(
          project.id,
          assigneeTask.id,
          member.userId,
          member.name?.trim() || member.email || member.userId
        );
        patchTask(assigneeTask.id, {
          assigneeId: member.userId,
          assigneeName: member.name?.trim() || member.email || member.userId,
        });
      } else {
        await clearTaskAssignee(project.id, assigneeTask.id);
        patchTask(assigneeTask.id, { assigneeId: null, assigneeName: null });
      }
    } catch {
      /* ignore */
    } finally {
      setSavingTaskId(null);
      setAssigneeTask(null);
    }
  };

  const handleToolsSave = async (selected: TaskToolSnapshot[]) => {
    if (!toolsTask) return;
    setSavingTaskId(toolsTask.id);
    try {
      await updateTaskTools(project.id, toolsTask.id, selected);
      patchTask(toolsTask.id, {
        assignedTools: selected,
        assignedToolIds: selected.map((s) => s.id),
      });
    } catch {
      /* ignore */
    } finally {
      setSavingTaskId(null);
      setToolsTask(null);
    }
  };

  const handlePlanDateChange = async (task: TaskDoc, date: string) => {
    if (!date) return;
    setSavingTaskId(task.id);
    try {
      await updateTaskPlannedDate(project.id, task.id, date);
      patchTask(task.id, { dueDate: date, plannedStart: date });
    } catch {
      /* ignore */
    } finally {
      setSavingTaskId(null);
    }
  };

  const attentionChips = [
    {
      key: "unassigned",
      icon: UserX,
      label: t("projects.today.unassigned"),
      count: attention.unassigned,
      onClick: () =>
        setFilters((f) => ({ ...f, unassignedOnly: !f.unassignedOnly, missingToolsOnly: false })),
      active: filters.unassignedOnly,
    },
    {
      key: "tools",
      icon: Wrench,
      label: t("projects.today.missingTools"),
      count: attention.missingTools,
      onClick: () =>
        setFilters((f) => ({ ...f, missingToolsOnly: !f.missingToolsOnly, unassignedOnly: false })),
      active: filters.missingToolsOnly,
    },
    {
      key: "blocked",
      icon: OctagonAlert,
      label: t("projects.today.blocked"),
      count: attention.blocked,
      onClick: () =>
        setFilters((f) => ({ ...f, status: f.status === "blocked" ? "all" : "blocked" })),
      active: filters.status === "blocked",
    },
  ].filter((chip) => chip.count > 0);

  return (
    <div className="space-y-4">
      {phaseMetrics.phases.length > 0 ? (
        <ProjectPhaseWorkflow metrics={phaseMetrics} compact />
      ) : null}

      {attentionChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {t("projects.tasks.attentionRequired")}
          </span>
          {attentionChips.map((chip) => {
            const Icon = chip.icon;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={chip.onClick}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  chip.active
                    ? "border-[#1D376A] bg-[#1D376A] text-white"
                    : "border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                )}
              >
                <Icon className="size-3.5" />
                {chip.label}
                <span className="tabular-nums">{chip.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-[#1D376A]">
            {t("projects.dashboard.tab.tasks")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("projects.tasks.filterByMember")}
              </label>
              <Select
                value={filters.memberId}
                onValueChange={(v) => setFilters((f) => ({ ...f, memberId: v ?? "all" }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("projects.tasks.filterAll")}</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name?.trim() || m.email || m.userId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("projects.tasks.filterByPhase")}
              </label>
              <Select
                value={filters.phaseId}
                onValueChange={(v) => setFilters((f) => ({ ...f, phaseId: v ?? "all" }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("projects.tasks.filterAll")}</SelectItem>
                  <SelectItem value="__general__">{t("projects.dashboard.phaseGeneral")}</SelectItem>
                  {phases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px]">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("projects.tasks.filterByStatus")}
              </label>
              <Select
                value={filters.status}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, status: (v as StatusFilter) ?? "all" }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("projects.tasks.filterAll")}</SelectItem>
                  <SelectItem value="open">{t("projects.tasks.statusOpen")}</SelectItem>
                  <SelectItem value="done">{t("projects.tasks.statusDone")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {canManage ? (
            <div className="flex gap-2">
              <Input
                placeholder={t("projects.newTaskPlaceholder")}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), void handleAddTask())
                }
              />
              <Button
                size="sm"
                className="shrink-0 bg-[#e06737] hover:bg-[#c9582f]"
                onClick={() => void handleAddTask()}
                disabled={addingTask || !newTaskTitle.trim()}
              >
                <Plus className="mr-1 size-4" />
                {t("projects.addTask")}
              </Button>
            </div>
          ) : null}

          {tasksError ? <p className="text-sm text-destructive">{tasksError}</p> : null}

          {visibleTasks.length === 0 && !tasksError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tasks.length === 0
                ? t("projects.tasksEmpty")
                : t("projects.tasks.noFilterResults")}
            </p>
          ) : (
            <ProjectTaskGroups
              tasks={visibleTasks}
              phaseMetrics={phaseMetrics}
              canManage={canManage}
              userId={userId}
              togglingTaskId={togglingTaskId}
              savingTaskId={savingTaskId}
              canToggleStatus={(task) => canWorkerToggleTaskStatus(task, userId, canManage)}
              onToggleStatus={(task) => void handleToggleTask(task)}
              onOpenAssignee={setAssigneeTask}
              onOpenTools={setToolsTask}
              onPlanDateChange={(task, date) => void handlePlanDateChange(task, date)}
            />
          )}

          <TaskAssigneePicker
            open={!!assigneeTask}
            onOpenChange={(o) => !o && setAssigneeTask(null)}
            members={members}
            selectedId={assigneeTask?.assigneeId}
            onSelect={(m) => void handleAssigneeSelect(m)}
            t={t}
          />

          <TaskToolsPicker
            open={!!toolsTask}
            onOpenChange={(o) => !o && setToolsTask(null)}
            tools={tools}
            selected={toolsTask?.assignedTools ?? []}
            onSave={(selected) => void handleToolsSave(selected)}
            t={t}
          />
        </CardContent>
      </Card>
    </div>
  );
}
