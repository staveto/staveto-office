"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import { updateTaskStatus } from "@/lib/projects";
import {
  canManageTaskPlanning,
  canWorkerToggleTaskStatus,
  filterTasksForWorkerView,
} from "@/lib/taskPlanningPermissions";
import {
  computeMemberWorkloads,
  computePlanningKpis,
} from "@/lib/taskPlanningMetrics";
import {
  detectToolConflicts,
  detectWorkerConflicts,
  workerConflictUserIds,
} from "@/lib/taskPlanningConflicts";
import { listAssignableProjectMembers } from "@/services/projects/projectMembersService";
import {
  assignToolsToProject,
  listProjectAssignedTools,
  listProjectTools,
  listToolsForCurrentUser,
  unassignToolFromProject,
  type ProjectToolRecord,
} from "@/services/projects/projectToolsService";
import {
  clearTaskAssignee,
  updateTaskAssignee,
  updateTaskPlannedDate,
} from "@/services/projects/taskAssignmentService";
import { updateTaskTools } from "@/services/projects/taskToolsService";
import type { ProjectMemberRecord, ProjectPhaseRecord, TaskToolSnapshot } from "@/services/projects/taskPlanningTypes";
import type { WorkspaceRole } from "@/types/workspace";
import { ProjectPlanningKpis } from "./ProjectPlanningKpis";
import { ProjectPlanningConflictAlerts } from "./ProjectPlanningConflictAlerts";
import { buildConflictTaskIdSet } from "./ProjectWorkBoard";
import { ProjectWorkerBoard } from "./ProjectWorkerBoard";
import { ProjectBulkPlanningToolbar } from "./ProjectBulkPlanningToolbar";
import {
  loadActiveTimers,
  type ActiveTimerState,
} from "@/services/operations/teamLiveStatusService";
import { TaskAssigneePicker } from "./TaskAssigneePicker";
import { TaskToolsPicker } from "./TaskToolsPicker";
import { ProjectEquipmentPanel } from "./ProjectEquipmentPanel";
import { useI18n } from "@/i18n/I18nContext";

type Props = {
  project: ProjectDoc;
  tasks: TaskDoc[];
  phases: ProjectPhaseRecord[];
  userId: string;
  role?: WorkspaceRole;
  onTasksChange: (tasks: TaskDoc[]) => void;
};

type PickerMode = "single" | "bulk";

export function ProjectWorkPlanTab({
  project,
  tasks,
  phases,
  userId,
  role,
  onTasksChange,
}: Props) {
  const { t, locale } = useI18n();
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [activeTimers, setActiveTimers] = useState<Map<string, ActiveTimerState>>(new Map());
  const [tools, setTools] = useState<TaskToolSnapshot[]>([]);
  const [availableTools, setAvailableTools] = useState<ProjectToolRecord[]>([]);
  const [projectTools, setProjectTools] = useState<ProjectToolRecord[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [equipmentBusy, setEquipmentBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [assigneeTask, setAssigneeTask] = useState<TaskDoc | null>(null);
  const [toolsTask, setToolsTask] = useState<TaskDoc | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>("single");
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState("");

  const myMemberRecord = useMemo(
    () => members.find((m) => m.userId === userId) ?? null,
    [members, userId]
  );
  const canManage = useMemo(
    () => canManageTaskPlanning(project, userId, role, myMemberRecord),
    [project, userId, role, myMemberRecord]
  );
  const localeTag =
    locale === "de" ? "de-DE" : locale === "en" ? "en-GB" : "sk-SK";

  const visibleTasks = useMemo(
    () => (canManage ? tasks : filterTasksForWorkerView(tasks, userId)),
    [tasks, canManage, userId]
  );

  const reloadTools = async () => {
    const [toolList, avail, assigned] = await Promise.all([
      listProjectTools(project, userId),
      listToolsForCurrentUser(project, userId),
      listProjectAssignedTools(project.id, userId),
    ]);
    setTools(toolList);
    setAvailableTools(avail);
    setProjectTools(assigned);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      const m = await listAssignableProjectMembers(project);
      if (!cancelled) {
        setMembers(m);
        await reloadTools();
        setLoadingMeta(false);
      }
      const timers = await loadActiveTimers(m.map((x) => x.userId));
      if (!cancelled) setActiveTimers(timers);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, userId]);

  const toolConflicts = useMemo(() => detectToolConflicts(visibleTasks), [visibleTasks]);
  const workerConflicts = useMemo(() => detectWorkerConflicts(visibleTasks), [visibleTasks]);
  const conflictTaskIds = useMemo(
    () => buildConflictTaskIdSet(toolConflicts, workerConflicts),
    [toolConflicts, workerConflicts]
  );
  const metrics = useMemo(() => computePlanningKpis(visibleTasks), [visibleTasks]);
  const workloads = useMemo(
    () => computeMemberWorkloads(visibleTasks, members, workerConflictUserIds(workerConflicts)),
    [visibleTasks, members, workerConflicts]
  );
  const patchTasks = (patches: Map<string, Partial<TaskDoc>>) => {
    onTasksChange(
      tasks.map((task) => {
        const patch = patches.get(task.id);
        return patch ? { ...task, ...patch } : task;
      })
    );
  };

  const patchTask = (taskId: string, patch: Partial<TaskDoc>) => {
    onTasksChange(tasks.map((x) => (x.id === taskId ? { ...x, ...patch } : x)));
  };

  const handleToggleStatus = async (task: TaskDoc) => {
    if (!canWorkerToggleTaskStatus(task, userId, canManage)) return;
    setTogglingTaskId(task.id);
    try {
      const next = task.status === "DONE" ? "OPEN" : "DONE";
      await updateTaskStatus(project.id, task.id, next);
      patchTask(task.id, { status: next });
    } catch {
      /* ignore */
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handleAssigneeSelect = async (member: ProjectMemberRecord | null) => {
    const targets =
      pickerMode === "bulk"
        ? [...selectedIds]
        : assigneeTask
          ? [assigneeTask.id]
          : [];

    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const patches = new Map<string, Partial<TaskDoc>>();
      await Promise.all(
        targets.map(async (taskId) => {
          if (member) {
            await updateTaskAssignee(
              project.id,
              taskId,
              member.userId,
              member.name?.trim() || member.email || member.userId
            );
            patches.set(taskId, {
              assigneeId: member.userId,
              assigneeName: member.name?.trim() || member.email || member.userId,
            });
          } else {
            await clearTaskAssignee(project.id, taskId);
            patches.set(taskId, { assigneeId: null, assigneeName: null });
          }
        })
      );
      patchTasks(patches);
      if (pickerMode === "bulk") setSelectedIds(new Set());
    } catch {
      /* ignore */
    } finally {
      setBulkBusy(false);
      setAssigneeTask(null);
      setPickerMode("single");
    }
  };

  const handleToolsSave = async (selected: TaskToolSnapshot[]) => {
    const targets =
      pickerMode === "bulk" ? [...selectedIds] : toolsTask ? [toolsTask.id] : [];
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const patches = new Map<string, Partial<TaskDoc>>();
      await Promise.all(
        targets.map(async (taskId) => {
          await updateTaskTools(project.id, taskId, selected);
          patches.set(taskId, {
            assignedTools: selected,
            assignedToolIds: selected.map((s) => s.id),
          });
        })
      );
      patchTasks(patches);
      if (pickerMode === "bulk") setSelectedIds(new Set());
    } catch {
      /* ignore */
    } finally {
      setBulkBusy(false);
      setToolsTask(null);
      setPickerMode("single");
    }
  };

  const applyBulkDate = async () => {
    if (!bulkDate.trim()) return;
    const targets = [...selectedIds];
    setBulkBusy(true);
    try {
      const patches = new Map<string, Partial<TaskDoc>>();
      await Promise.all(
        targets.map(async (taskId) => {
          await updateTaskPlannedDate(project.id, taskId, bulkDate);
          patches.set(taskId, { dueDate: bulkDate, plannedStart: bulkDate });
        })
      );
      patchTasks(patches);
      setSelectedIds(new Set());
      setDateDialogOpen(false);
    } catch {
      /* ignore */
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkStatus = async (status: "OPEN" | "DONE") => {
    const targets = [...selectedIds];
    setBulkBusy(true);
    try {
      const patches = new Map<string, Partial<TaskDoc>>();
      await Promise.all(
        targets.map(async (taskId) => {
          await updateTaskStatus(project.id, taskId, status);
          patches.set(taskId, { status });
        })
      );
      patchTasks(patches);
      setSelectedIds(new Set());
    } catch {
      /* ignore */
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelect = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  if (loadingMeta && visibleTasks.length > 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-bold text-[var(--po-text-primary)]">{t("projects.workPlan.title")}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t("projects.workPlan.subtitle")}</p>
      </header>

      <ProjectPlanningKpis metrics={metrics} t={t} />

      <ProjectPlanningConflictAlerts
        withoutWorkerCount={metrics.withoutWorker}
        withoutToolsCount={metrics.withoutTools}
        toolConflicts={toolConflicts}
        workerConflicts={workerConflicts}
        t={t}
      />

      <ProjectEquipmentPanel
        projectAssigned={projectTools}
        availableTools={availableTools}
        canManage={canManage}
        busy={equipmentBusy}
        onAssignToProject={async (picked) => {
          setEquipmentBusy(true);
          try {
            await assignToolsToProject(project.id, userId, picked);
            await reloadTools();
          } finally {
            setEquipmentBusy(false);
          }
        }}
        onUnassignFromProject={async (toolId) => {
          setEquipmentBusy(true);
          try {
            await unassignToolFromProject(userId, toolId);
            await reloadTools();
          } finally {
            setEquipmentBusy(false);
          }
        }}
        t={t}
      />

      <ProjectWorkerBoard
        tasks={visibleTasks}
        members={members}
        phases={phases}
        workloads={workloads}
        activeTimers={activeTimers}
        canManage={canManage}
        selectedIds={selectedIds}
        togglingTaskId={togglingTaskId}
        conflictTaskIds={conflictTaskIds}
        locale={localeTag}
        onToggleSelect={toggleSelect}
        onToggleStatus={(task) => void handleToggleStatus(task)}
        onOpenAssignee={(task) => {
          setPickerMode("single");
          setAssigneeTask(task);
        }}
        onOpenTools={(task) => {
          setPickerMode("single");
          setToolsTask(task);
        }}
        canToggleStatus={(task) => canWorkerToggleTaskStatus(task, userId, canManage)}
      />

      {canManage ? (
        <ProjectBulkPlanningToolbar
          selectedCount={selectedIds.size}
          busy={bulkBusy}
          onAssignWorker={() => {
            setPickerMode("bulk");
            setAssigneeTask({ id: "__bulk__" } as TaskDoc);
          }}
          onAssignTools={() => {
            setPickerMode("bulk");
            setToolsTask({ id: "__bulk__" } as TaskDoc);
          }}
          onSetDate={() => {
            setBulkDate(new Date().toISOString().slice(0, 10));
            setDateDialogOpen(true);
          }}
          onChangeStatus={(s) => void handleBulkStatus(s)}
          onClear={() => setSelectedIds(new Set())}
          t={t}
        />
      ) : null}

      <TaskAssigneePicker
        open={!!assigneeTask}
        onOpenChange={(o) => {
          if (!o) {
            setAssigneeTask(null);
            setPickerMode("single");
          }
        }}
        members={members}
        selectedId={pickerMode === "single" ? assigneeTask?.assigneeId : undefined}
        onSelect={(m) => void handleAssigneeSelect(m)}
        t={t}
      />

      <TaskToolsPicker
        open={!!toolsTask}
        onOpenChange={(o) => {
          if (!o) {
            setToolsTask(null);
            setPickerMode("single");
          }
        }}
        tools={tools}
        selected={pickerMode === "single" ? toolsTask?.assignedTools ?? [] : []}
        onSave={(selected) => void handleToolsSave(selected)}
        t={t}
      />

      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("projects.workPlan.setDate")}</DialogTitle>
          </DialogHeader>
          <Input
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
            className="h-11"
          />
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setDateDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-[var(--po-primary)] hover:bg-[var(--po-primary-hover)]"
              disabled={bulkBusy || !bulkDate}
              onClick={() => void applyBulkDate()}
            >
              {t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
