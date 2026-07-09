"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  HardHat,
  Lightbulb,
  Loader2,
  Wrench,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  buildTimelineDays,
  buildGanttYearOptions,
  collectGanttYearBounds,
  computeTaskExtendPatch,
  computeTaskResizePatch,
  computeTaskShiftPatch,
  countDaysInclusive,
  getTaskDateRange,
  getViewRange,
  previewTaskResizeRange,
  resolveGanttDayWidth,
  setAnchorYear,
  type GanttProjectNode,
  type GanttTaskNode,
  type GanttTimeline,
  type GanttViewMode,
} from "@/lib/ganttTimeline";
import {
  buildProjectCardSummaries,
} from "@/lib/planningSummaryMetrics";
import { countPlannedTasksInProject, canApplyAggregatedShift } from "@/lib/planningDateRange";
import { buildGanttBarTooltipData } from "@/lib/ganttBarDisplay";
import { updateTaskStatus } from "@/lib/projects";
import { distributeDatesAcrossTasks } from "@/lib/projectPlanningDates";
import { addDays, parseIsoDateLocal, toIsoDateLocal } from "@/lib/planningDates";
import {
  fetchGanttPlanningData,
  moveTaskScheduleByDays,
  computeMoveTaskSchedulePatch,
  resizeTaskSchedule,
  scheduleTaskOnTimeline,
  shiftPhaseSchedule,
  updateTaskSchedule,
  applyTaskSchedulePatchToGanttData,
  type GanttPlanningData,
  type TaskDoc,
  type TaskSchedulePatch,
} from "@/services/planning/ganttPlanningService";
import { GanttToolbar, type GanttFilterState } from "./GanttToolbar";
import { GanttTimelineHeader } from "./GanttTimelineHeader";
import { GanttInteractiveTimeline } from "./GanttInteractiveTimeline";
import { GanttBar } from "./GanttBar";
import { GanttLegend } from "./GanttLegend";
import { GanttUnscheduledPanel } from "./GanttUnscheduledPanel";
import {
  GanttResourcePanel,
  type GanttEmployeeResource,
  type GanttResourceDragPayload,
} from "./GanttResourcePanel";
import { basketItemKey, isResourceDrag, readDropPayloads, subscribeGanttResourceDrag, isGanttResourceDragSessionActive } from "./ganttResourceDrag";
import { PersonalPlanningPlaceholder } from "./PersonalPlanningPlaceholder";
import { ProjectPlanningBelt } from "./ProjectPlanningBelt";
import {
  TaskPlanningDrawer,
  type TaskDrawerSelection,
} from "./TaskPlanningDrawer";
import {
  ScheduleChangeToast,
  PlanningNotifyDialog,
  type ScheduleChangeToastState,
} from "./PlanningScheduleFeedback";
import {
  PlanningDateRangeEditor,
  type DateRangeSaveResult,
} from "./PlanningDateRangeEditor";
import {
  TaskGanttContextMenu,
  type TaskGanttContextAction,
  type TaskGanttContextMenuState,
} from "./TaskGanttContextMenu";
import {
  listWorkspaceEquipment,
  type WorkspaceEquipmentItem,
} from "@/services/projects/projectToolsService";
import { updateTaskAssignee } from "@/services/projects/taskAssignmentService";
import { updateTaskTools } from "@/services/projects/taskToolsService";
import type { TaskToolSnapshot } from "@/services/projects/taskPlanningTypes";
import styles from "./gantt.module.css";
import { cn } from "@/lib/utils";

function formatGanttRange(startYmd?: string, endYmd?: string): string | undefined {
  if (!startYmd) return undefined;
  const fmt = (ymd: string) =>
    parseIsoDateLocal(ymd).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  if (!endYmd || endYmd === startYmd) return fmt(startYmd);
  return `${fmt(startYmd)} – ${fmt(endYmd)}`;
}

const GANTT_ZOOM_MIN = 0.5;
const GANTT_ZOOM_MAX = 3;
const GANTT_ZOOM_STEP = 0.25;

type DragKind = "task" | "phase";

type DragState = {
  kind: DragKind;
  projectId: string;
  taskId?: string;
  phaseId?: string;
  startX: number;
  offsetPx: number;
  baseStartYmd?: string;
  baseEndYmd?: string;
  pointerX: number;
  pointerY: number;
};

type ResizeState = {
  projectId: string;
  taskId: string;
  edge: "start" | "end";
  startX: number;
  offsetPx: number;
  startYmd: string;
  endYmd: string;
  pointerX: number;
  pointerY: number;
};

export function GanttPlanningPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusProjectId = searchParams.get("projectId");
  const showAll = searchParams.get("showAll") === "1";
  const showGantt = !!focusProjectId || showAll;

  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { isCompany, role } = useWorkspaceProduct();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GanttPlanningData | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<GanttViewMode>("month");
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const scheduleDragRef = useRef<DragState | null>(null);
  const scheduleResizeRef = useRef<ResizeState | null>(null);
  const [phaseShift, setPhaseShift] = useState<{
    projectId: string;
    phaseId: string;
    phaseName: string;
    days: number;
    taskCount: number;
  } | null>(null);
  const [projectShift, setProjectShift] = useState<{
    projectId: string;
    projectName: string;
    days: number;
    taskCount: number;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  const [equipment, setEquipment] = useState<WorkspaceEquipmentItem[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [resourceBasket, setResourceBasket] = useState<GanttResourceDragPayload[]>([]);
  const [resourceDragActive, setResourceDragActive] = useState(false);
  const [taskDrawer, setTaskDrawer] = useState<TaskDrawerSelection | null>(null);
  const [dateEditor, setDateEditor] = useState<{ projectId: string; task: TaskDoc } | null>(null);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [taskContextMenu, setTaskContextMenu] = useState<TaskGanttContextMenuState | null>(null);
  const [scheduleToast, setScheduleToast] = useState<ScheduleChangeToastState | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartFrameRef = useRef<HTMLDivElement>(null);

  const GANTT_LABEL_WIDTH_WIDE = 340;

  const [filters, setFilters] = useState<GanttFilterState>({
    projectId: focusProjectId ?? "all",
    workerId: "all",
    status: "all",
    phaseId: "all",
    unassignedOnly: false,
    overdueOnly: false,
  });

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      projectId: focusProjectId ?? (showAll ? "all" : f.projectId),
      phaseId: "all",
    }));
  }, [focusProjectId, showAll]);

  const load = useCallback(async () => {
    if (!user?.id || !activeWorkspace || !isCompanyWorkspaceType(activeWorkspace.type)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGanttPlanningData(activeWorkspace, user.id, role);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("gantt.loadError"));
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeWorkspace, role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const focusProject = useMemo(
    () => (focusProjectId ? data?.projects.find((p) => p.id === focusProjectId) : undefined),
    [data, focusProjectId]
  );

  const projectCardSummaries = useMemo(
    () => (data ? buildProjectCardSummaries(data.projects) : []),
    [data]
  );

  const range = useMemo(() => getViewRange(anchor, viewMode), [anchor, viewMode]);
  const anchorYear = anchor.getFullYear();
  const yearOptions = useMemo(() => {
    const bounds = data ? collectGanttYearBounds(data.projects) : collectGanttYearBounds([]);
    return buildGanttYearOptions(bounds, anchorYear);
  }, [data, anchorYear]);

  const dayWidthPx = useMemo(
    () =>
      resolveGanttDayWidth(viewMode, zoom, range, {
        fullscreen: chartExpanded,
        chartAreaWidth,
        labelWidthPx: GANTT_LABEL_WIDTH_WIDE,
      }),
    [viewMode, zoom, range, chartExpanded, chartAreaWidth]
  );

  const timeline: GanttTimeline = useMemo(
    () => buildTimelineDays(range.startYmd, range.endYmd, viewMode, dayWidthPx),
    [range, viewMode, dayWidthPx]
  );

  useEffect(() => {
    const el = chartFrameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setChartAreaWidth(w);
    });
    ro.observe(el);
    setChartAreaWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [loading, chartExpanded, showGantt]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const next = z + (e.deltaY < 0 ? GANTT_ZOOM_STEP : -GANTT_ZOOM_STEP);
        return Math.min(GANTT_ZOOM_MAX, Math.max(GANTT_ZOOM_MIN, +next.toFixed(2)));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loading, showGantt]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    let list = data.projects;
    const pid = focusProjectId ?? filters.projectId;
    if (pid !== "all") {
      list = list.filter((p) => p.id === pid);
    } else if (filters.projectId !== "all") {
      list = list.filter((p) => p.id === filters.projectId);
    }
    return list
      .map((project) => {
        const phases = project.phases
          .map((phase) => {
            let tasks = phase.tasks;
            if (filters.workerId !== "all") {
              tasks = tasks.filter((tk) => tk.assigneeId === filters.workerId);
            }
            if (filters.status === "open") {
              tasks = tasks.filter((tk) => (tk.status ?? "").toUpperCase() !== "DONE");
            } else if (filters.status === "done") {
              tasks = tasks.filter((tk) => (tk.status ?? "").toUpperCase() === "DONE");
            } else if (filters.status === "blocked") {
              tasks = tasks.filter((tk) => (tk.status ?? "").toUpperCase() === "BLOCKED");
            }
            if (filters.unassignedOnly) {
              tasks = tasks.filter((tk) => tk.barStatus === "unassigned");
            }
            if (filters.overdueOnly) {
              tasks = tasks.filter((tk) => tk.barStatus === "overdue");
            }
            if (filters.phaseId !== "all") {
              tasks = filters.phaseId === phase.id ? tasks : [];
            }
            return { ...phase, tasks };
          })
          .filter(Boolean) as typeof project.phases;
        return { ...project, phases };
      })
      .filter(
        (p) =>
          p.phases.length > 0 ||
          p.totalTasks > 0 ||
          pid === p.id
      );
  }, [data, filters, focusProjectId]);

  const unscheduledFiltered = useMemo(() => {
    if (!data) return [];
    let list = data.unscheduled;
    const pid = focusProjectId ?? filters.projectId;
    if (pid !== "all") list = list.filter((t) => t.projectId === pid);
    if (filters.workerId !== "all") list = list.filter((t) => t.assigneeId === filters.workerId);
    return list;
  }, [data, filters, focusProjectId]);

  const workerOptions = useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return [];
    for (const member of data.teamMembers) {
      map.set(member.id, member.name);
    }
    for (const p of data.projects) {
      for (const ph of p.phases) {
        for (const tk of ph.tasks) {
          if (tk.assigneeId) {
            map.set(tk.assigneeId, tk.assigneeName ?? map.get(tk.assigneeId) ?? tk.assigneeId);
          }
        }
      }
    }
    for (const tk of data.unscheduled) {
      if (tk.assigneeId) {
        map.set(tk.assigneeId, tk.assigneeName ?? map.get(tk.assigneeId) ?? tk.assigneeId);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const findTaskDoc = (projectId: string, taskId: string): TaskDoc | undefined =>
    data?.tasksByProject[projectId]?.find((t) => t.id === taskId);

  const reloadAfterMutation = useCallback(() => load(), [load]);

  const optimisticTaskSchedulePatch = useCallback(
    (projectId: string, taskId: string, patch: TaskSchedulePatch) => {
      setData((prev) =>
        prev ? applyTaskSchedulePatchToGanttData(prev, projectId, taskId, patch) : prev
      );
    },
    []
  );

  const showScheduleFeedback = useCallback(
    (taskTitle: string, oldStart?: string, oldEnd?: string, newStart?: string, newEnd?: string) => {
      setScheduleToast({
        taskTitle,
        oldRange: formatGanttRange(oldStart, oldEnd) ?? "—",
        newRange: formatGanttRange(newStart, newEnd) ?? "—",
      });
    },
    []
  );

  const handleDateEditorSaved = useCallback(
    (result: DateRangeSaveResult) => {
      setScheduleToast({
        taskTitle: result.taskTitle,
        oldRange: result.oldRange,
        newRange: result.newRange,
      });
      if (dateEditor) {
        const draftPatch = result.patch;
        if (draftPatch) {
          optimisticTaskSchedulePatch(dateEditor.projectId, dateEditor.task.id, draftPatch);
        }
      }
      void reloadAfterMutation();
    },
    [reloadAfterMutation, dateEditor, optimisticTaskSchedulePatch]
  );

  const openTaskDrawer = useCallback(
    (projectId: string, projectName: string, phaseName: string, task: GanttTaskNode) => {
      setSelectedTaskKey(`${projectId}:${task.id}`);
      setTaskDrawer({
        projectId,
        projectName,
        phaseName,
        task,
        taskDoc: findTaskDoc(projectId, task.id),
      });
    },
    [data]
  );

  const openDateEditor = useCallback(
    (projectId: string, taskId: string) => {
      const doc = findTaskDoc(projectId, taskId);
      if (!doc) return;
      setSelectedTaskKey(`${projectId}:${taskId}`);
      setDateEditor({ projectId, task: doc });
    },
    [data]
  );

  const applyTaskSchedulePatch = useCallback(
    async (
      projectId: string,
      task: TaskDoc,
      patch: { plannedStart: string; plannedEnd: string | null; dueDate: string }
    ) => {
      const range = getTaskDateRange(task);
      const oldStart = range.startYmd;
      const oldEnd = range.endYmd ?? range.startYmd;
      optimisticTaskSchedulePatch(projectId, task.id, patch);
      await updateTaskSchedule(projectId, task.id, patch);
      showScheduleFeedback(
        task.title ?? task.id,
        oldStart,
        oldEnd,
        patch.plannedStart,
        patch.plannedEnd ?? patch.plannedStart
      );
      void reloadAfterMutation();
    },
    [optimisticTaskSchedulePatch, reloadAfterMutation, showScheduleFeedback]
  );

  const handleTaskContextAction = useCallback(
    async (action: TaskGanttContextAction) => {
      if (!taskContextMenu || !data?.canEdit) return;
      const doc = findTaskDoc(taskContextMenu.projectId, taskContextMenu.taskId);
      if (!doc) return;
      try {
        setActionError(null);
        if (action === "editDates") {
          openDateEditor(taskContextMenu.projectId, taskContextMenu.taskId);
          return;
        }
        const patch =
          action === "shiftLater"
            ? computeTaskShiftPatch(doc, 1)
            : action === "extend1"
              ? computeTaskExtendPatch(doc, 1)
              : computeTaskExtendPatch(doc, 3);
        await applyTaskSchedulePatch(taskContextMenu.projectId, doc, patch);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
      }
    },
    [taskContextMenu, data?.canEdit, openDateEditor, applyTaskSchedulePatch, t]
  );

  const handleEditProjectDates = useCallback(
    (projectId: string) => {
      const tasks = data?.tasksByProject[projectId] ?? [];
      const count = countPlannedTasksInProject(tasks);
      const name = data?.projectList.find((p) => p.id === projectId)?.name ?? "";
      if (count === 0) {
        router.push(`/app/planning/gantt?projectId=${encodeURIComponent(projectId)}`);
        return;
      }
      setProjectShift({
        projectId,
        projectName: name,
        days: 0,
        taskCount: count,
      });
    },
    [data, router]
  );

  const employees = useMemo<GanttEmployeeResource[]>(() => {
    if (!data) return [];
    const counts = new Map<string, { task: number; overdue: number }>();
    for (const p of data.projects) {
      for (const ph of p.phases) {
        for (const tk of ph.tasks) {
          if (!tk.assigneeId) continue;
          const c = counts.get(tk.assigneeId) ?? { task: 0, overdue: 0 };
          c.task += 1;
          if (tk.barStatus === "overdue") c.overdue += 1;
          counts.set(tk.assigneeId, c);
        }
      }
    }
    const list: GanttEmployeeResource[] = data.teamMembers.map((m) => ({
      id: m.id,
      name: m.name,
      taskCount: counts.get(m.id)?.task ?? 0,
      overdueCount: counts.get(m.id)?.overdue ?? 0,
    }));
    for (const [id, c] of counts) {
      if (list.some((e) => e.id === id)) continue;
      const name = workerOptions.find((w) => w.id === id)?.name ?? id.slice(0, 8);
      list.push({ id, name, taskCount: c.task, overdueCount: c.overdue });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [data, workerOptions]);

  useEffect(() => {
    if (!data || !resourcesOpen || !user?.id || !showGantt) return;
    let cancelled = false;
    setEquipmentLoading(true);
    listWorkspaceEquipment(data.projectList, user.id)
      .then((rows) => {
        if (!cancelled) setEquipment(rows);
      })
      .catch(() => {
        if (!cancelled) setEquipment([]);
      })
      .finally(() => {
        if (!cancelled) setEquipmentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, resourcesOpen, user?.id, showGantt]);

  useEffect(() => {
    return subscribeGanttResourceDrag(() => {
      setResourceDragActive(isGanttResourceDragSessionActive());
    });
  }, []);

  const handleDropResource = useCallback(
    async (payloads: GanttResourceDragPayload[], projectId: string, taskIds: string[]) => {
      if (!data?.canEdit || taskIds.length === 0 || payloads.length === 0) return;
      const employees = payloads.filter((p) => p.kind === "employee");
      const equipmentItems = payloads.filter((p) => p.kind === "equipment");

      try {
        setActionError(null);
        if (employees.length > 0) {
          await Promise.all(
            taskIds.map((tid, idx) => {
              const emp = employees[idx % employees.length];
              return updateTaskAssignee(projectId, tid, emp.id, emp.name);
            })
          );
        }
        if (equipmentItems.length > 0) {
          await Promise.all(
            taskIds.map((tid) => {
              const taskDoc = data.tasksByProject[projectId]?.find((t) => t.id === tid);
              const existing = taskDoc?.assignedTools ?? [];
              const merged: TaskToolSnapshot[] = [...existing];
              for (const eq of equipmentItems) {
                if (merged.some((tl) => tl.id === eq.id)) continue;
                merged.push({
                  id: eq.id,
                  name: eq.name,
                  type: eq.type ?? null,
                  qrCode: null,
                });
              }
              if (merged.length === existing.length) return Promise.resolve();
              return updateTaskTools(projectId, tid, merged);
            })
          );
        }
        await reloadAfterMutation();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
      }
    },
    [data, reloadAfterMutation, t]
  );

  const addToResourceBasket = useCallback((item: GanttResourceDragPayload) => {
    const key = basketItemKey(item);
    setResourceBasket((prev) => {
      if (prev.some((p) => basketItemKey(p) === key)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeFromResourceBasket = useCallback((key: string) => {
    setResourceBasket((prev) => prev.filter((p) => basketItemKey(p) !== key));
  }, []);

  const clearResourceBasket = useCallback(() => setResourceBasket([]), []);

  const phaseOptions = useMemo(() => {
    const pid = focusProjectId ?? filters.projectId;
    if (!data || pid === "all") return [];
    const project = data.projects.find((p) => p.id === pid);
    if (!project) return [];
    return project.phases.map((ph) => ({
      id: ph.id,
      name: ph.isGeneral ? t("projects.dashboard.phaseGeneral") : ph.name,
    }));
  }, [data, filters.projectId, focusProjectId, t]);

  const dragIndicator = useMemo(() => {
    const dayW = timeline.dayWidthPx;
    if (resize) {
      const delta = Math.round(resize.offsetPx / dayW);
      const { startYmd: s, endYmd: e } = previewTaskResizeRange(
        resize.startYmd,
        resize.endYmd,
        resize.edge,
        delta
      );
      const days = countDaysInclusive(s, e);
      const rangeLabel = formatGanttRange(s, e) ?? "";
      const label = `${rangeLabel} / ${days} ${t("gantt.daysShort")}`;
      return { label, delta, x: resize.pointerX, y: resize.pointerY };
    }
    if (drag && drag.baseStartYmd) {
      const delta = Math.round(drag.offsetPx / dayW);
      const ns = toIsoDateLocal(addDays(parseIsoDateLocal(drag.baseStartYmd), delta));
      const ne = drag.baseEndYmd
        ? toIsoDateLocal(addDays(parseIsoDateLocal(drag.baseEndYmd), delta))
        : ns;
      return { label: formatGanttRange(ns, ne) ?? "", delta, x: drag.pointerX, y: drag.pointerY };
    }
    return null;
  }, [drag, resize, timeline.dayWidthPx, t]);

  const dragSessionKey = drag
    ? `${drag.kind}:${drag.projectId}:${drag.taskId ?? ""}:${drag.phaseId ?? ""}`
    : null;
  const resizeSessionKey = resize
    ? `${resize.projectId}:${resize.taskId}:${resize.edge}`
    : null;

  useEffect(() => {
    if (!dragSessionKey || !data?.canEdit) return;
    scheduleDragRef.current = drag;
    const onMove = (e: MouseEvent) => {
      const current = scheduleDragRef.current;
      if (!current) return;
      const raw = e.clientX - current.startX;
      const snapped = Math.round(raw / timeline.dayWidthPx) * timeline.dayWidthPx;
      const next = { ...current, offsetPx: snapped, pointerX: e.clientX, pointerY: e.clientY };
      scheduleDragRef.current = next;
      setDrag(next);
    };
    const onUp = async () => {
      const current = scheduleDragRef.current;
      scheduleDragRef.current = null;
      setDrag(null);
      if (!current || !data?.canEdit) return;
      const deltaDays = Math.round(current.offsetPx / timeline.dayWidthPx);
      if (deltaDays === 0) return;
      try {
        setActionError(null);
        if (current.kind === "task" && current.taskId) {
          const doc = findTaskDoc(current.projectId, current.taskId);
          if (!doc) return;
          const range = getTaskDateRange(doc);
          const oldStart = range.startYmd;
          const oldEnd = range.endYmd ?? range.startYmd;
          const newStart = oldStart
            ? toIsoDateLocal(addDays(parseIsoDateLocal(oldStart), deltaDays))
            : undefined;
          const newEnd = oldEnd
            ? toIsoDateLocal(addDays(parseIsoDateLocal(oldEnd), deltaDays))
            : newStart;
          const patch = computeMoveTaskSchedulePatch(doc, deltaDays, true);
          optimisticTaskSchedulePatch(current.projectId, current.taskId, patch);
          await moveTaskScheduleByDays(current.projectId, doc, deltaDays, true);
          showScheduleFeedback(doc.title ?? current.taskId, oldStart, oldEnd, newStart, newEnd);
          void reloadAfterMutation();
        } else if (current.kind === "phase" && current.phaseId) {
          const phase = data.projects
            .find((p) => p.id === current.projectId)
            ?.phases.find((ph) => ph.id === current.phaseId);
          const tasks = data.tasksByProject[current.projectId] ?? [];
          const taskCount = tasks.filter((tk) => {
            const pid = tk.phaseId?.trim() || "__general__";
            return pid === current.phaseId && !!(tk.plannedStart || tk.dueDate);
          }).length;
          setPhaseShift({
            projectId: current.projectId,
            phaseId: current.phaseId,
            phaseName:
              phase?.name === "__general__"
                ? t("projects.dashboard.phaseGeneral")
                : phase?.name ?? "",
            days: deltaDays,
            taskCount,
          });
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
        await reloadAfterMutation();
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragSessionKey, data, timeline.dayWidthPx, t, reloadAfterMutation, showScheduleFeedback]);

  useEffect(() => {
    if (!resizeSessionKey || !data?.canEdit) return;
    scheduleResizeRef.current = resize;
    const onMove = (e: MouseEvent) => {
      const current = scheduleResizeRef.current;
      if (!current) return;
      const raw = e.clientX - current.startX;
      const snapped = Math.round(raw / timeline.dayWidthPx) * timeline.dayWidthPx;
      const next = { ...current, offsetPx: snapped, pointerX: e.clientX, pointerY: e.clientY };
      scheduleResizeRef.current = next;
      setResize(next);
    };
    const onUp = async () => {
      const current = scheduleResizeRef.current;
      scheduleResizeRef.current = null;
      setResize(null);
      if (!current || !data?.canEdit) return;
      const delta = Math.round(current.offsetPx / timeline.dayWidthPx);
      if (delta === 0) return;
      const base = current.edge === "start" ? current.startYmd : current.endYmd;
      const nextDate = toIsoDateLocal(addDays(parseIsoDateLocal(base), delta));
      try {
        setActionError(null);
        const doc = findTaskDoc(current.projectId, current.taskId);
        if (!doc) return;
        const patch = computeTaskResizePatch(doc, current.edge, nextDate);
        optimisticTaskSchedulePatch(current.projectId, current.taskId, patch);
        await resizeTaskSchedule(current.projectId, doc, current.edge, nextDate);
        showScheduleFeedback(
          doc.title ?? current.taskId,
          current.startYmd,
          current.endYmd,
          patch.plannedStart,
          patch.plannedEnd ?? patch.plannedStart
        );
        void reloadAfterMutation();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t("gantt.resizeNotAllowed"));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeSessionKey, data, timeline.dayWidthPx, t, reloadAfterMutation, showScheduleFeedback]);

  const confirmPhaseShift = async () => {
    if (!phaseShift || !data) return;
    try {
      const tasks = data.tasksByProject[phaseShift.projectId] ?? [];
      await shiftPhaseSchedule(
        phaseShift.projectId,
        tasks,
        phaseShift.phaseId,
        phaseShift.days,
        true
      );
      setPhaseShift(null);
      await reloadAfterMutation();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
    }
  };

  const confirmProjectShift = async () => {
    if (!projectShift || !data || projectShift.days === 0) return;
    try {
      const tasks = data.tasksByProject[projectShift.projectId] ?? [];
      for (const task of tasks) {
        const range = getTaskDateRange(task);
        if (range.isUnscheduled) continue;
        await moveTaskScheduleByDays(projectShift.projectId, task, projectShift.days, true);
      }
      setProjectShift(null);
      router.push(`/app/planning/gantt?projectId=${encodeURIComponent(projectShift.projectId)}`);
      await reloadAfterMutation();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
    }
  };

  const scrollToToday = () => {
    const idx = timeline.days.findIndex((d) => d.isToday);
    if (idx < 0 || !scrollRef.current) return;
    scrollRef.current.scrollLeft = Math.max(0, idx * timeline.dayWidthPx - 120);
  };

  useEffect(() => {
    if (loading || !data || !showGantt) return;
    const timer = window.setTimeout(() => scrollToToday(), 80);
    return () => window.clearTimeout(timer);
  }, [loading, data?.projects.length, timeline.dayWidthPx, showGantt]);

  const handleAutoSchedule = async () => {
    if (!data?.canEdit || unscheduledFiltered.length === 0) return;
    const ids = unscheduledFiltered.map((t) => t.id);
    const dates = distributeDatesAcrossTasks(
      ids,
      timeline.startYmd,
      timeline.endYmd,
      "sequential",
      true
    );
    try {
      await Promise.all(
        [...dates.entries()].map(([taskId, date]) => {
          const node = unscheduledFiltered.find((u) => u.id === taskId);
          if (!node) return Promise.resolve();
          return scheduleTaskOnTimeline(node.projectId, taskId, date, 1);
        })
      );
      await reloadAfterMutation();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
    }
  };

  useEffect(() => {
    if (!chartExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChartExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [chartExpanded]);

  const toggleChartExpanded = useCallback(() => {
    setChartExpanded((v) => !v);
  }, []);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isCompany) return <PersonalPlanningPlaceholder />;

  const shell = (
    <div
      className={cn(
        styles.ganttShell,
        chartExpanded ? styles.ganttExpanded : "mx-auto max-w-[96rem] space-y-4 pb-8",
        chartExpanded && styles.ganttShellWide
      )}
    >
      {!showGantt && !chartExpanded ? (
        <>
          <header className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">{t("gantt.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("planning.ganttPicker.subtitle")}</p>
          </header>
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className={styles.planningEmptyPanel}>
                <p className={styles.planningEmptyTitle}>{t("planning.ganttPicker.prompt")}</p>
                <p className={styles.planningEmptyDesc}>{t("planning.ganttPicker.hint")}</p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/app/planning/gantt?showAll=1">{t("planning.ganttPicker.showAll")}</Link>
                </Button>
              </div>
              <ProjectPlanningBelt
                projects={projectCardSummaries}
                ganttBasePath="/app/planning/gantt"
                onEditDates={handleEditProjectDates}
                t={t}
              />
            </>
          )}
        </>
      ) : (
        <>
          {!chartExpanded ? (
            <nav className={styles.ganttBreadcrumb} aria-label="Breadcrumb">
              <Link href="/app/planning" className={styles.ganttBreadcrumbLink}>
                {t("planning.title")}
              </Link>
              <span className={styles.ganttBreadcrumbSep}>/</span>
              {focusProject ? (
                <>
                  <span className={styles.ganttBreadcrumbCurrent}>{focusProject.name}</span>
                  <span className={styles.ganttBreadcrumbSep}>/</span>
                  <span className={styles.ganttBreadcrumbMuted}>{t("gantt.title")}</span>
                </>
              ) : (
                <span className={styles.ganttBreadcrumbCurrent}>{t("gantt.title")}</span>
              )}
            </nav>
          ) : null}

          <header className={cn(chartExpanded && "shrink-0", "flex flex-wrap items-start justify-between gap-3")}>
            <div>
              <h1 className={cn("font-bold text-foreground", chartExpanded ? "text-lg" : "text-2xl")}>
                {focusProject ? focusProject.name : t("gantt.title")}
              </h1>
              {!chartExpanded && focusProject ? (
                <p className="text-sm text-muted-foreground">{t("planning.focus.subtitle")}</p>
              ) : null}
            </div>
            {!chartExpanded && focusProjectId ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/app/planning">
                  <ArrowLeft className="mr-1 size-4" />
                  {t("planning.focus.backToOverview")}
                </Link>
              </Button>
            ) : null}
          </header>

          <div className={cn(chartExpanded && "shrink-0")}>
            <GanttToolbar
              variant="full"
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              filters={filters}
              onFiltersChange={(patch) =>
                setFilters((f) => {
                  const next = { ...f, ...patch };
                  if (patch.projectId != null && patch.projectId !== f.projectId) {
                    next.phaseId = "all";
                  }
                  return next;
                })
              }
              projectOptions={data?.projectList.map((p) => ({ id: p.id, name: p.name })) ?? []}
              workerOptions={workerOptions}
              phaseOptions={phaseOptions}
              selectedProjectId={focusProjectId ?? filters.projectId}
              canEdit={data?.canEdit ?? false}
              onToday={scrollToToday}
              zoom={zoom}
              onZoomIn={() => setZoom((z) => Math.min(GANTT_ZOOM_MAX, +(z + GANTT_ZOOM_STEP).toFixed(2)))}
              onZoomOut={() => setZoom((z) => Math.max(GANTT_ZOOM_MIN, +(z - GANTT_ZOOM_STEP).toFixed(2)))}
              onZoomReset={() => setZoom(1)}
              onAutoSchedule={() => void handleAutoSchedule()}
              onPrev={() => setAnchor((d) => addDays(d, viewMode === "week" ? -7 : viewMode === "month" ? -30 : -90))}
              onNext={() => setAnchor((d) => addDays(d, viewMode === "week" ? 7 : viewMode === "month" ? 30 : 90))}
              anchorYear={anchorYear}
              yearOptions={yearOptions}
              onYearChange={(year) => setAnchor((d) => setAnchorYear(d, year))}
              chartExpanded={chartExpanded}
              onToggleChartExpanded={toggleChartExpanded}
              resourcesOpen={resourcesOpen}
              onToggleResources={() => setResourcesOpen((v) => !v)}
              hideProjectFilter={!!focusProjectId}
              t={t}
            />
          </div>

          {!chartExpanded ? <GanttLegend t={t} /> : null}

          {data?.canEdit && !chartExpanded ? (
            <p className={styles.hintBanner}>
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#e06737]" aria-hidden />
              <span>{t("gantt.interactionHint")}</span>
            </p>
          ) : null}

          {error || actionError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error ?? actionError}
            </p>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className={cn(styles.ganttBody, chartExpanded && styles.ganttBodyExpanded)}>
              <div
                ref={chartFrameRef}
                className={cn(
                  "rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden min-w-0",
                  styles.ganttChartFlex,
                  chartExpanded && styles.ganttChartFrame,
                  resourceDragActive && styles.ganttChartDropReady
                )}
              >
                <div className={styles.timelineScroll} ref={scrollRef}>
                  <div
                    className={styles.ganttChartInner}
                    style={{
                      minWidth: chartExpanded
                        ? "100%"
                        : `calc(var(--gantt-label-width) + ${timeline.totalWidthPx}px)`,
                      width: chartExpanded
                        ? `max(100%, calc(var(--gantt-label-width) + ${timeline.totalWidthPx}px))`
                        : undefined,
                    }}
                  >
                    <div className={styles.headerRow}>
                      <div
                        className={cn(
                          styles.labelCol,
                          "flex items-center px-3 text-xs font-bold uppercase text-muted-foreground"
                        )}
                      >
                        {t("gantt.treeColumn")}
                      </div>
                      <div className={cn(chartExpanded && styles.timelinePane)}>
                        <GanttTimelineHeader timeline={timeline} fillWidth={chartExpanded} />
                      </div>
                    </div>

                    {filteredProjects.length === 0 ? (
                      <div className={styles.planningEmptyPanel}>
                        <p className={styles.planningEmptyTitle}>{t("planning.empty.noTasksPlanned")}</p>
                      </div>
                    ) : (
                      filteredProjects.map((project) => (
                        <GanttProjectRows
                          key={project.id}
                          project={project}
                          timeline={timeline}
                          fillWidth={chartExpanded}
                          collapsed={collapsed}
                          onToggleCollapse={toggleCollapse}
                          canEdit={data?.canEdit ?? false}
                          drag={drag}
                          onTaskDragStart={(projectId, taskId, startYmd, endYmd, e) => {
                            if (!data?.canEdit) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const state: DragState = {
                              kind: "task",
                              projectId,
                              taskId,
                              startX: e.clientX,
                              offsetPx: 0,
                              baseStartYmd: startYmd,
                              baseEndYmd: endYmd,
                              pointerX: e.clientX,
                              pointerY: e.clientY,
                            };
                            scheduleDragRef.current = state;
                            setDrag(state);
                          }}
                          onPhaseDragStart={(projectId, phaseId, startYmd, endYmd, e) => {
                            if (!data?.canEdit) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const state: DragState = {
                              kind: "phase",
                              projectId,
                              phaseId,
                              startX: e.clientX,
                              offsetPx: 0,
                              baseStartYmd: startYmd,
                              baseEndYmd: endYmd,
                              pointerX: e.clientX,
                              pointerY: e.clientY,
                            };
                            scheduleDragRef.current = state;
                            setDrag(state);
                          }}
                          onScheduleTask={async (projectId, taskId, startYmd) => {
                            try {
                              setActionError(null);
                              await scheduleTaskOnTimeline(projectId, taskId, startYmd, 1);
                              await reloadAfterMutation();
                            } catch (e) {
                              setActionError(
                                e instanceof Error ? e.message : t("gantt.updateError")
                              );
                            }
                          }}
                          onTaskResizeStart={(projectId, taskId, edge, startYmd, endYmd, e) => {
                            if (!data?.canEdit) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const state: ResizeState = {
                              projectId,
                              taskId,
                              edge,
                              startX: e.clientX,
                              offsetPx: 0,
                              startYmd,
                              endYmd,
                              pointerX: e.clientX,
                              pointerY: e.clientY,
                            };
                            scheduleResizeRef.current = state;
                            setResize(state);
                          }}
                          resize={resize}
                          onDropResource={data?.canEdit ? handleDropResource : undefined}
                          resourceDragActive={resourceDragActive}
                          onTaskSelect={openTaskDrawer}
                          selectedTaskKey={selectedTaskKey}
                          onOpenDateEditor={openDateEditor}
                          onTaskContextMenu={(projectId, taskId, e) => {
                            setTaskContextMenu({
                              projectId,
                              taskId,
                              x: e.clientX,
                              y: e.clientY,
                            });
                          }}
                          onPhaseEditDates={(projectId, phaseId, phaseName) => {
                            const tasks = data?.tasksByProject[projectId] ?? [];
                            const taskCount = tasks.filter((tk) => {
                              const pid = tk.phaseId?.trim() || "__general__";
                              return pid === phaseId && !!(tk.plannedStart || tk.dueDate);
                            }).length;
                            setPhaseShift({
                              projectId,
                              phaseId,
                              phaseName,
                              days: 0,
                              taskCount,
                            });
                          }}
                          t={t}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
              {resourcesOpen ? (
                <GanttResourcePanel
                  employees={employees}
                  equipment={equipment}
                  canEdit={data?.canEdit ?? false}
                  loading={equipmentLoading}
                  basketItems={resourceBasket}
                  onAddToBasket={addToResourceBasket}
                  onRemoveFromBasket={removeFromResourceBasket}
                  onClearBasket={clearResourceBasket}
                  onClose={() => setResourcesOpen(false)}
                  t={t}
                />
              ) : null}
            </div>
          )}

          {!loading ? (
            <div className={cn(chartExpanded && styles.ganttExpandedPanel)}>
              <GanttUnscheduledPanel
                tasks={unscheduledFiltered}
                canEdit={data?.canEdit ?? false}
                timelineStartYmd={timeline.startYmd}
                onPickDate={async (task, date) => {
                  try {
                    await scheduleTaskOnTimeline(task.projectId, task.id, date, 1);
                    await reloadAfterMutation();
                  } catch (e) {
                    setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
                  }
                }}
                t={t}
              />
            </div>
          ) : null}
        </>
      )}

      <Dialog open={!!phaseShift} onOpenChange={(o) => !o && setPhaseShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {phaseShift?.days !== 0 ? t("gantt.phaseShiftTitle") : t("planning.phaseDates.title")}
            </DialogTitle>
          </DialogHeader>
          {phaseShift ? (
            <>
              <p className="text-sm text-muted-foreground">{t("planning.phaseDates.explainer")}</p>
              {phaseShift.days !== 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("gantt.phaseShiftBody", {
                    phase: phaseShift.phaseName,
                    days: Math.abs(phaseShift.days),
                    direction: phaseShift.days > 0 ? t("gantt.forward") : t("gantt.backward"),
                  })}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPhaseShift((p) => (p ? { ...p, days: -1 } : p))}
                  >
                    {t("planning.dateEditor.minus1")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPhaseShift((p) => (p ? { ...p, days: 1 } : p))}
                  >
                    {t("planning.dateEditor.plus1day")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPhaseShift((p) => (p ? { ...p, days: 3 } : p))}
                  >
                    {t("planning.dateEditor.plus3")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPhaseShift((p) => (p ? { ...p, days: 7 } : p))}
                  >
                    {t("planning.dateEditor.plusWeek")}
                  </Button>
                </div>
              )}
              <p className="text-sm font-medium">
                {t("planning.phaseDates.affected", { count: phaseShift.taskCount })}
              </p>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-[#1D376A]"
                onClick={() => {
                  if (!phaseShift) return;
                  router.push(
                    `/app/planning/gantt?projectId=${encodeURIComponent(phaseShift.projectId)}`
                  );
                  setPhaseShift(null);
                }}
              >
                {t("planning.phaseDates.openGantt")}
              </Button>
            </>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhaseShift(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-[#1D376A]"
              disabled={!phaseShift || !canApplyAggregatedShift(phaseShift.days)}
              onClick={() => void confirmPhaseShift()}
            >
              {t("gantt.applyShift")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!projectShift} onOpenChange={(o) => !o && setProjectShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("planning.projectDates.title")}</DialogTitle>
          </DialogHeader>
          {projectShift ? (
            <>
              <p className="text-sm text-muted-foreground">{t("planning.projectDates.explainer")}</p>
              <p className="text-sm font-medium">{projectShift.projectName}</p>
              <p className="text-sm text-muted-foreground">
                {t("planning.projectDates.affected", { count: projectShift.taskCount })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/app/planning/gantt?projectId=${encodeURIComponent(projectShift.projectId)}`}>
                    {t("planning.projectDates.openGantt")}
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setProjectShift((p) => (p ? { ...p, days: -1 } : p))}
                >
                  {t("planning.dateEditor.minus1")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setProjectShift((p) => (p ? { ...p, days: 1 } : p))}
                >
                  {t("planning.dateEditor.plus1day")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setProjectShift((p) => (p ? { ...p, days: 7 } : p))}
                >
                  {t("planning.dateEditor.plusWeek")}
                </Button>
              </div>
              {projectShift.days !== 0 ? (
                <p className="text-sm font-medium">
                  {t("planning.projectDates.shiftPreview", { days: projectShift.days })}
                </p>
              ) : null}
            </>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectShift(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="bg-[#1D376A]"
              disabled={!projectShift || projectShift.days === 0}
              onClick={() => void confirmProjectShift()}
            >
              {t("gantt.applyShift")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dragIndicator ? (
        <DragDateBadge
          label={dragIndicator.label}
          delta={dragIndicator.delta}
          x={dragIndicator.x}
          y={dragIndicator.y}
          t={t}
        />
      ) : null}

      <TaskPlanningDrawer
        selection={taskDrawer}
        open={!!taskDrawer}
        canEdit={data?.canEdit ?? false}
        onClose={() => setTaskDrawer(null)}
        onEditDates={() => {
          if (taskDrawer?.taskDoc) openDateEditor(taskDrawer.projectId, taskDrawer.taskDoc.id);
        }}
        onMarkDone={async () => {
          if (!taskDrawer?.taskDoc || !data?.canEdit) return;
          try {
            setActionError(null);
            await updateTaskStatus(taskDrawer.projectId, taskDrawer.taskDoc.id, "DONE");
            setTaskDrawer(null);
            await reloadAfterMutation();
          } catch (e) {
            setActionError(e instanceof Error ? e.message : t("gantt.updateError"));
          }
        }}
        onNotify={() => setNotifyOpen(true)}
        t={t}
      />

      {dateEditor ? (
        <PlanningDateRangeEditor
          open={!!dateEditor}
          onOpenChange={(o) => !o && setDateEditor(null)}
          projectId={dateEditor.projectId}
          task={dateEditor.task}
          canEdit={data?.canEdit ?? false}
          onSaved={handleDateEditorSaved}
          onNotifyRequest={() => setNotifyOpen(true)}
          t={t}
        />
      ) : null}

      <TaskGanttContextMenu
        menu={taskContextMenu}
        onClose={() => setTaskContextMenu(null)}
        onAction={(action) => void handleTaskContextAction(action)}
        t={t}
      />

      <ScheduleChangeToast
        toast={scheduleToast}
        onDismiss={() => setScheduleToast(null)}
        onUndo={() => setScheduleToast(null)}
        undoDisabled
        onNotify={() => setNotifyOpen(true)}
        t={t}
      />

      <PlanningNotifyDialog
        open={notifyOpen}
        onOpenChange={setNotifyOpen}
        taskTitle={taskDrawer?.task.title ?? dateEditor?.task.title ?? scheduleToast?.taskTitle}
        t={t}
      />
    </div>
  );

  if (chartExpanded && typeof document !== "undefined") {
    return createPortal(shell, document.body);
  }

  return shell;
}

function DragDateBadge({
  label,
  delta,
  x,
  y,
  t,
}: {
  label: string;
  delta: number;
  x: number;
  y: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (typeof document === "undefined") return null;
  const deltaLabel =
    delta === 0
      ? t("gantt.dragNoChange")
      : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} ${t("gantt.daysShort")}`;
  return createPortal(
    <div className={styles.dragDateBadge} style={{ left: x, top: y }} role="status" aria-live="polite">
      <CalendarDays className="size-3.5 shrink-0" aria-hidden />
      <span className={styles.dragDateBadgeMain}>{label}</span>
      <span className={styles.dragDateBadgeDelta}>{deltaLabel}</span>
    </div>,
    document.body
  );
}

function DroppableRow({
  enabled,
  onDropPayloads,
  className,
  children,
}: {
  enabled: boolean;
  onDropPayloads: (payloads: GanttResourceDragPayload[]) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={cn(className, over && styles.rowDropActive)}
      onDragEnter={(e) => {
        if (!isResourceDrag(e)) return;
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragOver={(e) => {
        if (!isResourceDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragOverCapture={(e) => {
        if (!isResourceDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        if (!isResourceDrag(e)) return;
        const payloads = readDropPayloads(e);
        if (payloads.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        onDropPayloads(payloads);
      }}
    >
      {children}
    </div>
  );
}

function GanttProjectRows({
  project,
  timeline,
  fillWidth = false,
  collapsed,
  onToggleCollapse,
  canEdit,
  drag,
  onTaskDragStart,
  onPhaseDragStart,
  onScheduleTask,
  onTaskResizeStart,
  resize,
  onDropResource,
  resourceDragActive,
  onTaskSelect,
  selectedTaskKey,
  onOpenDateEditor,
  onTaskContextMenu,
  onPhaseEditDates,
  t,
}: {
  project: GanttProjectNode;
  timeline: GanttTimeline;
  fillWidth?: boolean;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  canEdit: boolean;
  drag: DragState | null;
  onTaskDragStart: (
    projectId: string,
    taskId: string,
    startYmd: string | undefined,
    endYmd: string | undefined,
    e: React.MouseEvent
  ) => void;
  onPhaseDragStart: (
    projectId: string,
    phaseId: string,
    startYmd: string | undefined,
    endYmd: string | undefined,
    e: React.MouseEvent
  ) => void;
  onScheduleTask: (projectId: string, taskId: string, startYmd: string) => void;
  onTaskResizeStart: (
    projectId: string,
    taskId: string,
    edge: "start" | "end",
    startYmd: string,
    endYmd: string,
    e: React.MouseEvent
  ) => void;
  resize: ResizeState | null;
  onDropResource?: (
    payloads: GanttResourceDragPayload[],
    projectId: string,
    taskIds: string[]
  ) => void;
  resourceDragActive?: boolean;
  onTaskSelect?: (
    projectId: string,
    projectName: string,
    phaseName: string,
    task: GanttTaskNode
  ) => void;
  selectedTaskKey?: string | null;
  onOpenDateEditor?: (projectId: string, taskId: string) => void;
  onTaskContextMenu?: (projectId: string, taskId: string, e: React.MouseEvent) => void;
  onPhaseEditDates?: (projectId: string, phaseId: string, phaseName: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const pKey = `p-${project.id}`;
  const isCollapsed = collapsed.has(pKey);
  const allTaskIds = project.phases.flatMap((ph) => ph.tasks.map((tk) => tk.id));
  const showProjectSubline = !fillWidth;

  return (
    <>
      <DroppableRow
        enabled={!!onDropResource && allTaskIds.length > 0}
        onDropPayloads={(payloads) => onDropResource?.(payloads, project.id, allTaskIds)}
        className={cn(styles.gridRow, styles.gridRowProject)}
      >
        <div className={cn(styles.rowLabel, styles.rowLabelProject)}>
          <button type="button" className="mr-1 shrink-0" onClick={() => onToggleCollapse(pKey)}>
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <Link href={`/app/projects/${project.id}?tab=tasks`} className="truncate hover:underline">
            {project.name}
          </Link>
          {showProjectSubline ? (
            <span className={styles.rowLabelMeta}>{project.progress}%</span>
          ) : null}
        </div>
        <GanttInteractiveTimeline timeline={timeline} canEdit={false} fillWidth={fillWidth} resourceDragActive={resourceDragActive}>
          <GanttBar
            kind="project"
            label={project.name}
            startYmd={project.startYmd}
            endYmd={project.endYmd}
            status="open"
            progress={project.progress}
            timeline={timeline}
            canEdit={false}
            href={`/app/projects/${project.id}`}
            tooltipData={buildGanttBarTooltipData({
              title: project.name,
              startYmd: project.startYmd,
              endYmd: project.endYmd,
              formatRange: formatGanttRange,
              durationTemplate: (count) => t("gantt.tooltip.duration", { count }),
              statusLabel: `${project.progress}% ${t("gantt.tooltip.complete")}`,
              meta: `${project.doneTasks}/${project.totalTasks} ${t("gantt.tooltip.tasks")}`,
            })}
          />
        </GanttInteractiveTimeline>
      </DroppableRow>

      {!isCollapsed
        ? project.phases.map((phase) => {
            const phKey = `ph-${project.id}-${phase.id}`;
            const phCollapsed = collapsed.has(phKey);
            const phaseName =
              phase.name === "__general__" ? t("projects.dashboard.phaseGeneral") : phase.name;
            const phaseDrag =
              drag?.kind === "phase" &&
              drag.projectId === project.id &&
              drag.phaseId === phase.id
                ? drag.offsetPx
                : 0;
            const phaseTaskIds = phase.tasks.map((tk) => tk.id);

            return (
              <div key={phase.id}>
                <DroppableRow
                  enabled={!!onDropResource && phaseTaskIds.length > 0}
                  onDropPayloads={(payloads) =>
                    onDropResource?.(payloads, project.id, phaseTaskIds)
                  }
                  className={cn(styles.gridRow, styles.gridRowPhase)}
                >
                  <div className={cn(styles.rowLabel, styles.rowLabelPhase)}>
                    <button type="button" className="mr-1" onClick={() => onToggleCollapse(phKey)}>
                      {phCollapsed ? (
                        <ChevronRight className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                    <span className="truncate" title={phaseName}>
                      {phaseName}
                    </span>
                    {canEdit && onPhaseEditDates ? (
                      <button
                        type="button"
                        className={styles.rowPhaseEditBtn}
                        title={t("planning.phaseDates.edit")}
                        onClick={() => onPhaseEditDates(project.id, phase.id, phaseName)}
                      >
                        <CalendarDays className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <GanttInteractiveTimeline timeline={timeline} canEdit={canEdit} fillWidth={fillWidth} resourceDragActive={resourceDragActive}>
                    <GanttBar
                      kind="phase"
                      label={phaseName}
                      startYmd={phase.startYmd}
                      endYmd={phase.endYmd}
                      status={phase.isActive ? "active" : phase.open > 0 ? "open" : "done"}
                      timeline={timeline}
                      canEdit={canEdit}
                      dragOffsetPx={phaseDrag}
                      isDragging={phaseDrag !== 0}
                      onDragStart={(e) =>
                        onPhaseDragStart(project.id, phase.id, phase.startYmd, phase.endYmd, e)
                      }
                      tooltipData={buildGanttBarTooltipData({
                        title: phaseName,
                        startYmd: phase.startYmd,
                        endYmd: phase.endYmd,
                        formatRange: formatGanttRange,
                        durationTemplate: (count) => t("gantt.tooltip.duration", { count }),
                        statusLabel:
                          phase.isActive
                            ? t("gantt.legend.active")
                            : phase.open > 0
                              ? t("gantt.legend.open")
                              : t("gantt.legend.done"),
                        meta: `${phase.done}/${phase.total} ${t("gantt.tooltip.tasks")}`,
                      })}
                    />
                  </GanttInteractiveTimeline>
                </DroppableRow>
                {!phCollapsed
                  ? phase.tasks.map((task) => {
                      const taskDrag =
                        drag?.kind === "task" &&
                        drag.projectId === project.id &&
                        drag.taskId === task.id
                          ? drag.offsetPx
                          : 0;
                      const taskResize =
                        resize?.projectId === project.id && resize.taskId === task.id
                          ? resize
                          : null;
                      const isOverdue = task.barStatus === "overdue";
                      const taskKey = `${project.id}:${task.id}`;
                      const isSelected = selectedTaskKey === taskKey;
                      return (
                        <DroppableRow
                          key={task.id}
                          enabled={!!onDropResource}
                          onDropPayloads={(payloads) =>
                            onDropResource?.(payloads, project.id, [task.id])
                          }
                          className={cn(styles.gridRow, styles.gridRowTask)}
                        >
                          <div
                            className={cn(
                              styles.rowLabel,
                              styles.rowLabelTask,
                              task.isUnscheduled && styles.rowLabelUnscheduled,
                              isSelected && styles.rowLabelTaskSelected
                            )}
                            role="button"
                            tabIndex={0}
                            title={task.title}
                            onClick={() =>
                              onTaskSelect?.(project.id, project.name, phaseName, task)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onTaskSelect?.(project.id, project.name, phaseName, task);
                              }
                            }}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              {isOverdue ? (
                                <CalendarDays className="size-3 shrink-0 text-red-500" aria-hidden />
                              ) : null}
                              <span className="truncate">{task.title}</span>
                              {canEdit && onOpenDateEditor && !task.isUnscheduled ? (
                                <button
                                  type="button"
                                  className={styles.rowTaskCalendarBtn}
                                  title={t("planning.gantt.editDates")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDateEditor(project.id, task.id);
                                  }}
                                >
                                  <CalendarDays className="size-3.5" />
                                </button>
                              ) : null}
                            </div>
                            <div className={styles.rowTaskIcons}>
                              {task.assigneeName ? (
                                <span title={task.assigneeName}>
                                  <HardHat className="size-3" />
                                </span>
                              ) : null}
                              {(task.assignedTools?.length ?? 0) > 0 ? (
                                <span title={task.toolSummary ?? ""}>
                                  <Wrench className="size-3" />
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <GanttInteractiveTimeline
                            timeline={timeline}
                            canEdit={canEdit}
                            fillWidth={fillWidth}
                            resourceDragActive={resourceDragActive}
                            onPickDay={
                              task.isUnscheduled && canEdit
                                ? (ymd) => onScheduleTask(project.id, task.id, ymd)
                                : undefined
                            }
                            pickHint={
                              task.isUnscheduled ? t("gantt.clickToSchedule") : undefined
                            }
                          >
                            <GanttBar
                              kind="task"
                              label={task.title}
                              startYmd={task.startYmd}
                              endYmd={task.endYmd}
                              status={task.barStatus}
                              timeline={timeline}
                              canEdit={canEdit && !task.isUnscheduled}
                              canResize={task.canResize}
                              isMilestone={task.isMilestone}
                              dragOffsetPx={taskDrag}
                              isDragging={taskDrag !== 0}
                              resizeEdge={taskResize?.edge ?? null}
                              resizeOffsetPx={taskResize?.offsetPx ?? 0}
                              isResizing={!!taskResize}
                              isSelected={isSelected}
                              onDragStart={(e) =>
                                onTaskDragStart(project.id, task.id, task.startYmd, task.endYmd, e)
                              }
                              onResizeStart={(edge, e) => {
                                if (!task.canResize || !task.startYmd) return;
                                const endYmd = task.endYmd ?? task.startYmd;
                                onTaskResizeStart(
                                  project.id,
                                  task.id,
                                  edge,
                                  task.startYmd,
                                  endYmd,
                                  e
                                );
                              }}
                              onSelect={() =>
                                onTaskSelect?.(project.id, project.name, phaseName, task)
                              }
                              onEditDates={
                                onOpenDateEditor
                                  ? () => onOpenDateEditor(project.id, task.id)
                                  : undefined
                              }
                              onContextMenu={
                                onTaskContextMenu
                                  ? (e) => onTaskContextMenu(project.id, task.id, e)
                                  : undefined
                              }
                              href={
                                canEdit ? undefined : `/app/projects/${project.id}?tab=tasks`
                              }
                              assigneeName={task.assigneeName}
                              assignedTools={task.assignedTools}
                              tooltipData={buildGanttBarTooltipData({
                                title: task.title,
                                startYmd: task.startYmd,
                                endYmd: task.endYmd,
                                formatRange: formatGanttRange,
                                durationTemplate: (count) =>
                                  t("gantt.tooltip.duration", { count }),
                                assignee:
                                  task.assigneeName ?? t("projects.tasks.unassigned"),
                                statusLabel: t(`gantt.legend.${task.barStatus}`),
                                equipmentCount: task.assignedTools?.length ?? 0,
                                equipmentLabel: (count) =>
                                  t("gantt.tooltip.equipment", { count }),
                              })}
                              resizeTooltips={{
                                start: t("planning.gantt.resizeStart"),
                                end: t("planning.gantt.resizeEnd"),
                                move: t("planning.gantt.dragMove"),
                              }}
                            />
                          </GanttInteractiveTimeline>
                        </DroppableRow>
                      );
                    })
                  : null}
              </div>
            );
          })
        : null}
    </>
  );
}
