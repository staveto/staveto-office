"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OctagonAlert, UserX, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  planPhaseTasks,
  planProjectPhases,
  shiftTaskDate,
} from "@/lib/projectPlanningDates";
import {
  canManageTaskPlanning,
  canWorkerToggleTaskStatus,
  filterTasksForWorkerView,
} from "@/lib/taskPlanningPermissions";
import { listAssignableProjectMembers } from "@/services/projects/projectMembersService";
import { listProjectTools } from "@/services/projects/projectToolsService";
import {
  createProjectPhase,
  listProjectPhases,
  updateProjectPhase,
} from "@/services/projects/projectPhasesService";
import {
  applyAssigneeToTasks,
  applyTaskDateMap,
} from "@/services/projects/projectPlanningApplyService";
import { updateTaskPlannedDate } from "@/services/projects/taskAssignmentService";
import { updateTaskTools } from "@/services/projects/taskToolsService";
import type {
  ProjectMemberRecord,
  ProjectPhaseRecord,
  TaskToolSnapshot,
} from "@/services/projects/taskPlanningTypes";
import type { WorkspaceRole } from "@/types/workspace";
import { TaskAssigneePicker } from "./TaskAssigneePicker";
import { TaskToolsPicker } from "./TaskToolsPicker";
import { ProjectPlanningToolbar } from "./ProjectPlanningToolbar";
import { ProjectPhasePlanningCard } from "./ProjectPhasePlanningCard";
import { ProjectPlanningInspector } from "./ProjectPlanningInspector";
import { ProjectTaskGroups } from "./ProjectTaskGroups";
import { ProjectAddPhaseDialog } from "./ProjectAddPhaseDialog";
import { ProjectBulkPlanDialog } from "./ProjectBulkPlanDialog";
import {
  ProjectPhasePlanDialog,
  type PhasePlanDialogResult,
} from "./ProjectPhasePlanDialog";
import { ProjectTaskQuickAdd } from "./ProjectTaskQuickAdd";
import { useI18n } from "@/i18n/I18nContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { isModuleEnabled } from "@/lib/enabledModules";
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
type BulkAssignScope = "phase" | "project" | "single";

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
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const urlPhaseId = searchParams.get("phaseId");
  const { modules } = useEnabledModules();
  const planningEnabled = isModuleEnabled(modules, "planning");
  const localeTag = locale === "de" ? "de-DE" : locale === "en" ? "en-GB" : "sk-SK";

  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [tools, setTools] = useState<TaskToolSnapshot[]>([]);
  const [phases, setPhases] = useState<ProjectPhaseRecord[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());

  const [assigneeTask, setAssigneeTask] = useState<TaskDoc | null>(null);
  const [assignScope, setAssignScope] = useState<BulkAssignScope>("single");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [toolsTask, setToolsTask] = useState<TaskDoc | null>(null);

  const [addPhaseOpen, setAddPhaseOpen] = useState(false);
  const [bulkPlanOpen, setBulkPlanOpen] = useState(false);
  const [phasePlanOpen, setPhasePlanOpen] = useState(false);
  const [phasePlanId, setPhasePlanId] = useState<string | null>(null);
  const [editPhaseOpen, setEditPhaseOpen] = useState(false);
  const [editPhaseName, setEditPhaseName] = useState("");
  const [sameDateOpen, setSameDateOpen] = useState(false);
  const [sameDateValue, setSameDateValue] = useState("");

  const [filters, setFilters] = useState({
    memberId: "all",
    status: "all" as StatusFilter,
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
  const showPlanningUi = canManage && planningEnabled;

  const reloadPhases = async () => {
    const phaseList = await listProjectPhases(project.id);
    setPhases(phaseList);
    if (!selectedPhaseId && phaseList.length > 0) {
      setSelectedPhaseId(phaseList[0].id);
    }
  };

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
        if (phaseList.length > 0) {
          const preferred =
            urlPhaseId && phaseList.some((p) => p.id === urlPhaseId)
              ? urlPhaseId
              : phaseList[0].id;
          setSelectedPhaseId(preferred);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, userId, urlPhaseId]);

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
      blocked: open.filter((x) => (x.status ?? "").toUpperCase() === "BLOCKED").length,
    };
  }, [baseTasks]);

  const visibleTasks = useMemo(() => {
    let list = baseTasks;
    if (filters.memberId !== "all") {
      list = list.filter((task) => task.assigneeId === filters.memberId);
    }
    if (filters.status === "open") list = list.filter((task) => task.status !== "DONE");
    else if (filters.status === "done") list = list.filter((task) => task.status === "DONE");
    else if (filters.status === "blocked") {
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

  const selectedPhaseMetric = useMemo(
    () => phaseMetrics.phases.find((p) => p.id === selectedPhaseId) ?? null,
    [phaseMetrics, selectedPhaseId]
  );

  const selectedPhaseTasks = useMemo(() => {
    if (!selectedPhaseMetric) return [];
    if (selectedPhaseMetric.isGeneral) {
      const known = new Set(phases.map((p) => p.id));
      return visibleTasks.filter((t) => !t.phaseId?.trim() || !known.has(t.phaseId.trim()));
    }
    return visibleTasks.filter((t) => t.phaseId?.trim() === selectedPhaseMetric.id);
  }, [selectedPhaseMetric, visibleTasks, phases]);

  const openTaskCount = useMemo(
    () =>
      baseTasks.filter(
        (t) => t.isActive !== false && (t.status ?? "OPEN").toUpperCase() !== "DONE"
      ).length,
    [baseTasks]
  );

  const patchTask = (taskId: string, patch: Partial<TaskDoc>) => {
    onTasksChange(tasks.map((x) => (x.id === taskId ? { ...x, ...patch } : x)));
  };

  const patchTasksFromMap = (dates: Map<string, string>) => {
    onTasksChange(
      tasks.map((task) => {
        const date = dates.get(task.id);
        return date ? { ...task, dueDate: date, plannedStart: date } : task;
      })
    );
  };

  const handleQuickAdd = async (phaseId: string | null, title: string) => {
    setQuickAddBusy(true);
    try {
      const taskId = await createTask(project.id, title, { phaseId: phaseId ?? undefined });
      onTasksChange([
        ...tasks,
        {
          id: taskId,
          projectId: project.id,
          title,
          status: "OPEN",
          phaseId: phaseId ?? undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      if (phaseId) setSelectedPhaseId(phaseId);
    } catch {
      /* ignore */
    } finally {
      setQuickAddBusy(false);
    }
  };

  const handleAddPhase = async (input: {
    name: string;
    order: number;
    addStarterTask: boolean;
  }) => {
    const created = await createProjectPhase(project.id, input.name, input.order);
    await reloadPhases();
    setSelectedPhaseId(created.id);
    if (input.addStarterTask) {
      await handleQuickAdd(created.id, t("projects.planning.starterTaskTitle"));
    }
  };

  const handleEditPhaseSave = async () => {
    if (!selectedPhaseId || selectedPhaseMetric?.isGeneral || !editPhaseName.trim()) return;
    await updateProjectPhase(project.id, selectedPhaseId, { name: editPhaseName.trim() });
    await reloadPhases();
    setEditPhaseOpen(false);
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

  const resolveAssignTargets = (): string[] => {
    if (assignScope === "single" && assigneeTask) return [assigneeTask.id];
    if (assignScope === "phase" && selectedPhaseMetric) {
      return selectedPhaseTasks
        .filter((t) => (t.status ?? "OPEN").toUpperCase() !== "DONE")
        .map((t) => t.id);
    }
    if (assignScope === "project") {
      return baseTasks
        .filter((t) => (t.status ?? "OPEN").toUpperCase() !== "DONE")
        .map((t) => t.id);
    }
    return [];
  };

  const handleAssigneeSelect = async (member: ProjectMemberRecord | null) => {
    const targets = resolveAssignTargets();
    if (targets.length === 0) return;
    setSavingTaskId(targets[0]);
    try {
      await applyAssigneeToTasks(project.id, targets, member);
      const name = member
        ? member.name?.trim() || member.email || member.userId
        : null;
      onTasksChange(
        tasks.map((task) =>
          targets.includes(task.id)
            ? {
                ...task,
                assigneeId: member?.userId ?? null,
                assigneeName: name,
              }
            : task
        )
      );
    } catch {
      /* ignore */
    } finally {
      setSavingTaskId(null);
      setAssigneeTask(null);
      setAssignScope("single");
      setAssigneeOpen(false);
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

  const applyPhasePlan = async (result: PhasePlanDialogResult) => {
    const phaseId = phasePlanId ?? selectedPhaseId;
    if (!phaseId) return;
    const phaseTasks = baseTasks.filter((t) => t.phaseId?.trim() === phaseId);
    const dates = planPhaseTasks(phaseTasks, result);
    if (dates.size === 0) return;
    await applyTaskDateMap(project.id, dates);
    patchTasksFromMap(dates);
    if (result.assigneeId) {
      const member = members.find((m) => m.userId === result.assigneeId) ?? null;
      if (member) {
        await applyAssigneeToTasks(project.id, [...dates.keys()], member);
        const name = member.name?.trim() || member.email || member.userId;
        onTasksChange(
          tasks.map((task) =>
            dates.has(task.id)
              ? { ...task, assigneeId: member.userId, assigneeName: name }
              : task
          )
        );
      }
    }
  };

  const applyBulkProjectPlan = async (input: {
    projectStartDate: string;
    defaultPhaseDurationDays: number;
    workingDaysOnly: boolean;
    gapBetweenPhasesDays: number;
  }) => {
    const dates = planProjectPhases(phases, baseTasks, input);
    if (dates.size === 0) return;
    await applyTaskDateMap(project.id, dates);
    patchTasksFromMap(dates);
  };

  const applySameDateToPhase = async () => {
    if (!sameDateValue || !selectedPhaseMetric) return;
    const targets = selectedPhaseTasks.filter(
      (t) => (t.status ?? "OPEN").toUpperCase() !== "DONE"
    );
    const dates = new Map(targets.map((t) => [t.id, sameDateValue]));
    await applyTaskDateMap(project.id, dates);
    patchTasksFromMap(dates);
    setSameDateOpen(false);
  };

  const shiftPhaseDates = async (days: number) => {
    if (!selectedPhaseMetric) return;
    const open = selectedPhaseTasks.filter(
      (t) => (t.status ?? "OPEN").toUpperCase() !== "DONE" && getTaskPlanDate(t)
    );
    const dates = new Map(
      open.map((t) => [t.id, shiftTaskDate(getTaskPlanDate(t)!, days, true)])
    );
    if (dates.size === 0) return;
    await applyTaskDateMap(project.id, dates);
    patchTasksFromMap(dates);
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

  const phasePlanTarget = phaseMetrics.phases.find((p) => p.id === (phasePlanId ?? selectedPhaseId));
  const phasePlanTasks = phasePlanTarget
    ? baseTasks.filter((t) =>
        phasePlanTarget.isGeneral
          ? !t.phaseId?.trim()
          : t.phaseId?.trim() === phasePlanTarget.id
      )
    : [];

  return (
    <div className="space-y-4">
      {showPlanningUi ? (
        <ProjectPlanningToolbar
          canManage={canManage}
          t={t}
          onAddPhase={() => setAddPhaseOpen(true)}
          onAddTask={() => {
            if (selectedPhaseId) void handleQuickAdd(selectedPhaseMetric?.isGeneral ? null : selectedPhaseId, t("projects.planning.starterTaskTitle"));
          }}
          onBulkPlan={() => setBulkPlanOpen(true)}
          onAssignCrew={() => {
            setAssignScope("project");
            setAssigneeTask(null);
            setAssigneeOpen(true);
          }}
        />
      ) : null}

      {attentionChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-950/40">
          <span className="text-xs font-semibold text-amber-900 dark:text-amber-100">
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
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  chip.active
                    ? "bg-[var(--po-primary)] text-white"
                    : "bg-[var(--po-card-bg)] text-amber-900 dark:text-amber-100"
                )}
              >
                <Icon className="size-3" />
                {chip.label} {chip.count}
              </button>
            );
          })}
        </div>
      ) : null}

      {showPlanningUi ? (
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-3">
          {phaseMetrics.phases
            .filter((p) => !p.isGeneral)
            .map((phase) => {
              const phaseTasks = baseTasks.filter((t) => t.phaseId?.trim() === phase.id);
              return (
                <ProjectPhasePlanningCard
                  key={phase.id}
                  phase={phase}
                  tasks={phaseTasks}
                  selected={selectedPhaseId === phase.id}
                  collapsed={collapsedPhases.has(phase.id)}
                  canManage={canManage}
                  locale={localeTag}
                  t={t}
                  onSelect={() => setSelectedPhaseId(phase.id)}
                  onToggleCollapse={() =>
                    setCollapsedPhases((prev) => {
                      const next = new Set(prev);
                      if (next.has(phase.id)) next.delete(phase.id);
                      else next.add(phase.id);
                      return next;
                    })
                  }
                  onEditPhase={() => {
                    setEditPhaseName(phase.name);
                    setEditPhaseOpen(true);
                  }}
                  onAddTask={() => void handleQuickAdd(phase.id, t("projects.planning.starterTaskTitle"))}
                  onPlanPhase={() => {
                    setPhasePlanId(phase.id);
                    setPhasePlanOpen(true);
                  }}
                  onAssignPhase={() => {
                    setSelectedPhaseId(phase.id);
                    setAssignScope("phase");
                    setAssigneeTask(null);
                    setAssigneeOpen(true);
                  }}
                />
              );
            })}
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setAddPhaseOpen(true)}
            >
              {t("projects.planning.addPhase")}
            </Button>
          ) : null}
        </div>

        <Card className="lg:col-span-6">
          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[130px] flex-1">
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
              <div className="min-w-[110px]">
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
                focusPhaseId={selectedPhaseId}
                showEmptyPhases={canManage}
                canManage={canManage}
                userId={userId}
                togglingTaskId={togglingTaskId}
                savingTaskId={savingTaskId}
                canToggleStatus={(task) => canWorkerToggleTaskStatus(task, userId, canManage)}
                onToggleStatus={(task) => void handleToggleTask(task)}
                onOpenAssignee={(task) => {
                  setAssignScope("single");
                  setAssigneeTask(task);
                  setAssigneeOpen(true);
                }}
                onOpenTools={setToolsTask}
                onPlanDateChange={(task, date) => void handlePlanDateChange(task, date)}
                onQuickAddTask={(phaseId, title) => void handleQuickAdd(phaseId, title)}
                quickAddBusy={quickAddBusy}
              />
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <ProjectPlanningInspector
            phase={selectedPhaseMetric}
            phaseTasks={selectedPhaseTasks}
            locale={localeTag}
            canManage={canManage}
            t={t}
            onPlanPhase={() => {
              setPhasePlanId(selectedPhaseId);
              setPhasePlanOpen(true);
            }}
            onAssignOpenTasks={() => {
              setAssignScope("phase");
              setAssigneeTask(null);
              setAssigneeOpen(true);
            }}
            onSetSameDate={() => setSameDateOpen(true)}
            onShiftDates={(days) => void shiftPhaseDates(days)}
          />
        </div>
      </div>
      ) : (
        <Card className="border-[var(--po-card-border)] bg-[var(--po-card-bg)]">
          <CardContent className="space-y-4 pt-4">
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
                focusPhaseId={null}
                showEmptyPhases={false}
                canManage={canManage}
                userId={userId}
                togglingTaskId={togglingTaskId}
                savingTaskId={savingTaskId}
                canToggleStatus={(task) => canWorkerToggleTaskStatus(task, userId, canManage)}
                onToggleStatus={(task) => void handleToggleTask(task)}
                onOpenAssignee={(task) => {
                  setAssignScope("single");
                  setAssigneeTask(task);
                  setAssigneeOpen(true);
                }}
                onOpenTools={setToolsTask}
                onPlanDateChange={(task, date) => void handlePlanDateChange(task, date)}
                onQuickAddTask={(phaseId, title) => void handleQuickAdd(phaseId, title)}
                quickAddBusy={quickAddBusy}
              />
            )}
          </CardContent>
        </Card>
      )}

      <ProjectAddPhaseDialog
        open={addPhaseOpen}
        onOpenChange={setAddPhaseOpen}
        defaultOrder={phases.length}
        onCreate={handleAddPhase}
        t={t}
      />

      <ProjectBulkPlanDialog
        open={bulkPlanOpen}
        onOpenChange={setBulkPlanOpen}
        phaseCount={phases.length}
        openTaskCount={openTaskCount}
        defaultStartDate={today}
        onApply={applyBulkProjectPlan}
        t={t}
      />

      <ProjectPhasePlanDialog
        open={phasePlanOpen}
        onOpenChange={setPhasePlanOpen}
        phaseName={phasePlanTarget?.name ?? ""}
        taskCount={
          phasePlanTasks.filter((t) => (t.status ?? "OPEN").toUpperCase() !== "DONE").length
        }
        members={members}
        defaultStartDate={today}
        onApply={applyPhasePlan}
        t={t}
      />

      <Dialog open={editPhaseOpen} onOpenChange={setEditPhaseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("projects.planning.editPhaseTitle")}</DialogTitle>
          </DialogHeader>
          <Input value={editPhaseName} onChange={(e) => setEditPhaseName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPhaseOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-[var(--po-primary)] hover:bg-[var(--po-primary-hover)]"
              disabled={!editPhaseName.trim()}
              onClick={() => void handleEditPhaseSave()}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sameDateOpen} onOpenChange={setSameDateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("projects.planning.sameDateTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            type="date"
            value={sameDateValue}
            onChange={(e) => setSameDateValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSameDateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-[var(--po-primary)] hover:bg-[var(--po-primary-hover)]"
              disabled={!sameDateValue}
              onClick={() => void applySameDateToPhase()}
            >
              {t("projects.planning.applyPlan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskAssigneePicker
        open={assigneeOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAssigneeOpen(false);
            setAssigneeTask(null);
            setAssignScope("single");
          }
        }}
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
    </div>
  );
}
