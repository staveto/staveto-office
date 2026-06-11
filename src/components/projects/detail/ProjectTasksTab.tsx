"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  Plus,
  UserRound,
  Wrench,
} from "lucide-react";
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
import { groupTasksByPhase, computeTaskProgressStats } from "@/lib/projectDashboard";
import {
  buildPhaseLabelMap,
  getTaskPlanDate,
  getTaskToolsLabel,
  resolvePhaseLabel,
  shouldGroupTasksByPhase,
  taskMissingAssignee,
  taskMissingTools,
} from "@/lib/taskPlanningDisplay";
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
import type { ProjectMemberRecord, ProjectPhaseRecord, TaskToolSnapshot } from "@/services/projects/taskPlanningTypes";
import type { WorkspaceRole } from "@/types/workspace";
import { TaskAssigneePicker } from "./TaskAssigneePicker";
import { TaskToolsPicker } from "./TaskToolsPicker";
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

type FilterState = {
  memberId: string;
  phaseId: string;
  status: string;
  unassignedOnly: boolean;
  missingToolsOnly: boolean;
};

function TaskPlanningTable({
  tasks,
  phaseLabels,
  canManage,
  userId,
  togglingTaskId,
  savingTaskId,
  onToggleStatus,
  onOpenAssignee,
  onOpenTools,
  onPlanDateChange,
  t,
}: {
  tasks: TaskDoc[];
  phaseLabels: Map<string, string>;
  canManage: boolean;
  userId: string;
  togglingTaskId: string | null;
  savingTaskId: string | null;
  onToggleStatus: (task: TaskDoc) => void;
  onOpenAssignee: (task: TaskDoc) => void;
  onOpenTools: (task: TaskDoc) => void;
  onPlanDateChange: (task: TaskDoc, date: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 w-10" />
            <th className="px-3 py-2">{t("projects.tasks.col.task")}</th>
            <th className="px-3 py-2">{t("projects.tasks.col.phase")}</th>
            <th className="px-3 py-2">{t("projects.tasks.assignee")}</th>
            <th className="px-3 py-2">{t("projects.tasks.tools")}</th>
            <th className="px-3 py-2">{t("projects.tasks.plannedDate")}</th>
            <th className="px-3 py-2">{t("projects.tasks.col.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {tasks.map((task) => {
            const missingPerson = taskMissingAssignee(task);
            const missingTool = taskMissingTools(task);
            const planDate = getTaskPlanDate(task);
            const toolsLabel = getTaskToolsLabel(task);
            const canToggle = canWorkerToggleTaskStatus(task, userId, canManage);

            return (
              <tr key={task.id} className="align-top hover:bg-muted/20">
                <td className="px-2 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!canToggle || togglingTaskId === task.id}
                    onClick={() => onToggleStatus(task)}
                  >
                    {togglingTaskId === task.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : task.status === "DONE" ? (
                      <CheckCircle2 className="size-4 text-[#e06737]" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "font-medium",
                      task.status === "DONE" && "line-through text-muted-foreground"
                    )}
                  >
                    {task.title || t("projects.noName")}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {resolvePhaseLabel(task.phaseId, phaseLabels, t)}
                </td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/60",
                        missingPerson ? "border-amber-300 text-amber-800" : "border-border"
                      )}
                      disabled={savingTaskId === task.id}
                      onClick={() => onOpenAssignee(task)}
                    >
                      <UserRound className="size-3.5" />
                      {task.assigneeName?.trim() || t("projects.tasks.unassigned")}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">
                      {task.assigneeName?.trim() || t("projects.tasks.unassigned")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/60 max-w-[160px] truncate",
                        missingTool ? "border-amber-300 text-amber-800" : "border-border"
                      )}
                      disabled={savingTaskId === task.id}
                      onClick={() => onOpenTools(task)}
                    >
                      <Wrench className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {toolsLabel || t("projects.tasks.noTools")}
                      </span>
                    </button>
                  ) : (
                    <span className="text-muted-foreground truncate max-w-[160px] inline-block">
                      {toolsLabel || t("projects.tasks.noTools")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <Input
                      type="date"
                      className="h-8 w-[140px] text-xs"
                      value={planDate ?? ""}
                      disabled={savingTaskId === task.id}
                      onChange={(e) => onPlanDateChange(task, e.target.value)}
                    />
                  ) : (
                    <span className="text-muted-foreground whitespace-nowrap">
                      {planDate ?? "—"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      task.status === "DONE"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    {task.status === "DONE"
                      ? t("projects.tasks.statusDone")
                      : t("projects.tasks.statusOpen")}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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

  const canManage = canManageTaskPlanning(project, userId, role);
  const phaseLabels = useMemo(() => buildPhaseLabelMap(phases), [phases]);
  const groupByPhase = shouldGroupTasksByPhase(project, tasks);

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

  const visibleTasks = useMemo(() => {
    let list = canManage ? tasks : filterTasksForWorkerView(tasks, userId);

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
    }
    if (filters.unassignedOnly) {
      list = list.filter((task) => taskMissingAssignee(task));
    }
    if (filters.missingToolsOnly) {
      list = list.filter((task) => taskMissingTools(task));
    }

    return list;
  }, [tasks, canManage, userId, filters]);

  const stats = computeTaskProgressStats(tasks);
  const groups = groupTasksByPhase(visibleTasks);

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

  const tableProps = {
    phaseLabels,
    canManage,
    userId,
    togglingTaskId,
    savingTaskId,
    onToggleStatus: (task: TaskDoc) => void handleToggleTask(task),
    onOpenAssignee: setAssigneeTask,
    onOpenTools: setToolsTask,
    onPlanDateChange: (task: TaskDoc, date: string) => void handlePlanDateChange(task, date),
    t,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-[#1D376A]">{t("projects.dashboard.tab.tasks")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.length > 0 ? (
          <div className="rounded-lg bg-muted/40 px-4 py-3 grid gap-2 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t("projects.dashboard.tasks.phases")}</p>
              <p className="font-semibold text-[#1D376A]">{stats.phaseCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("projects.dashboard.tasks.taskCount")}</p>
              <p className="font-semibold text-[#1D376A]">{stats.total}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("projects.dashboard.tasks.completed")}</p>
              <p className="font-semibold text-[#1D376A]">
                {t("projects.dashboard.kpi.progressPercent", { percent: String(stats.percent) })}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[140px]">
            <label className="text-xs text-muted-foreground block mb-1">
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
            <label className="text-xs text-muted-foreground block mb-1">
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
            <label className="text-xs text-muted-foreground block mb-1">
              {t("projects.tasks.filterByStatus")}
            </label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v ?? "all" }))}
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
          <Button
            type="button"
            size="sm"
            variant={filters.unassignedOnly ? "default" : "outline"}
            className={filters.unassignedOnly ? "bg-[#1D376A]" : ""}
            onClick={() => setFilters((f) => ({ ...f, unassignedOnly: !f.unassignedOnly }))}
          >
            {t("projects.tasks.filterUnassigned")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filters.missingToolsOnly ? "default" : "outline"}
            className={filters.missingToolsOnly ? "bg-[#1D376A]" : ""}
            onClick={() => setFilters((f) => ({ ...f, missingToolsOnly: !f.missingToolsOnly }))}
          >
            {t("projects.tasks.filterMissingTools")}
          </Button>
        </div>

        {canManage ? (
          <div className="flex gap-2">
            <Input
              placeholder={t("projects.newTaskPlaceholder")}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void handleAddTask())}
            />
            <Button
              size="sm"
              className="bg-[#e06737] hover:bg-[#c9582f] shrink-0"
              onClick={() => void handleAddTask()}
              disabled={addingTask || !newTaskTitle.trim()}
            >
              <Plus className="size-4 mr-1" />
              {t("projects.addTask")}
            </Button>
          </div>
        ) : null}

        {tasksError ? <p className="text-sm text-destructive">{tasksError}</p> : null}

        {visibleTasks.length === 0 && !tasksError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tasks.length === 0 ? t("projects.tasksEmpty") : t("projects.tasks.noFilterResults")}
          </p>
        ) : groupByPhase ? (
          <div className="space-y-3">
            {groups.map((group, i) => (
              <PhaseTableSection
                key={group.id}
                label={
                  group.label === "general"
                    ? t("projects.dashboard.phaseGeneral")
                    : phaseLabels.get(group.id) ??
                      (group.label.startsWith("phase-")
                        ? t("projects.dashboard.phaseNumber", {
                            num: group.label.replace("phase-", ""),
                          })
                        : group.label)
                }
                tasks={group.tasks}
                defaultOpen={i === 0}
                tableProps={tableProps}
              />
            ))}
          </div>
        ) : (
          <TaskPlanningTable tasks={visibleTasks} {...tableProps} />
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
  );
}

type TaskTableSharedProps = Omit<React.ComponentProps<typeof TaskPlanningTable>, "tasks">;

function PhaseTableSection({
  label,
  tasks,
  defaultOpen,
  tableProps,
}: {
  label: string;
  tasks: TaskDoc[];
  defaultOpen?: boolean;
  tableProps: TaskTableSharedProps;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const done = tasks.filter((x) => x.status === "DONE").length;

  return (
    <div className="rounded-lg border border-border/70 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 bg-muted/30 px-4 py-3 text-left"
      >
        <span className="font-medium text-[#1D376A] text-sm">{label}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {done}/{tasks.length}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="p-2">
          <TaskPlanningTable tasks={tasks} {...tableProps} />
        </div>
      ) : null}
    </div>
  );
}
