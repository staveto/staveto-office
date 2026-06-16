"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, ChevronRight, Lightbulb, Loader2 } from "lucide-react";
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
  getViewRange,
  resolveGanttDayWidth,
  type GanttProjectNode,
  type GanttTimeline,
  type GanttViewMode,
} from "@/lib/ganttTimeline";
import { distributeDatesAcrossTasks } from "@/lib/projectPlanningDates";
import { addDays, parseIsoDateLocal, toIsoDateLocal } from "@/lib/planningDates";
import {
  assignTaskScheduleDate,
  fetchGanttPlanningData,
  moveTaskScheduleByDays,
  resizeTaskSchedule,
  scheduleTaskOnTimeline,
  shiftPhaseSchedule,
  type GanttPlanningData,
  type TaskDoc,
} from "@/services/planning/ganttPlanningService";
import { GanttToolbar, type GanttFilterState } from "./GanttToolbar";
import { GanttTimelineHeader } from "./GanttTimelineHeader";
import { GanttInteractiveTimeline } from "./GanttInteractiveTimeline";
import { GanttBar } from "./GanttBar";
import { GanttLegend } from "./GanttLegend";
import { GanttUnscheduledPanel } from "./GanttUnscheduledPanel";
import {
  GanttResourcePanel,
  GANTT_RESOURCE_MIME,
  type GanttEmployeeResource,
  type GanttResourceDragPayload,
} from "./GanttResourcePanel";
import { PersonalPlanningPlaceholder } from "./PersonalPlanningPlaceholder";
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

type DragKind = "task" | "phase";

type DragState = {
  kind: DragKind;
  projectId: string;
  taskId?: string;
  phaseId?: string;
  startX: number;
  offsetPx: number;
};

export function GanttPlanningPage() {
  const { t } = useI18n();
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
  const [phaseShift, setPhaseShift] = useState<{
    projectId: string;
    phaseId: string;
    phaseName: string;
    days: number;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [chartAreaWidth, setChartAreaWidth] = useState(0);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  const [equipment, setEquipment] = useState<WorkspaceEquipmentItem[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartFrameRef = useRef<HTMLDivElement>(null);

  const GANTT_LABEL_WIDTH_WIDE = 340;

  const [filters, setFilters] = useState<GanttFilterState>({
    projectId: "all",
    workerId: "all",
    status: "all",
    phaseId: "all",
    unassignedOnly: false,
    overdueOnly: false,
  });

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

  const range = useMemo(() => getViewRange(anchor, viewMode), [anchor, viewMode]);

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
  }, [loading, chartExpanded]);

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    let list = data.projects;
    if (filters.projectId !== "all") {
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
          filters.projectId === p.id
      );
  }, [data, filters]);

  const unscheduledFiltered = useMemo(() => {
    if (!data) return [];
    let list = data.unscheduled;
    if (filters.projectId !== "all") list = list.filter((t) => t.projectId === filters.projectId);
    if (filters.workerId !== "all") list = list.filter((t) => t.assigneeId === filters.workerId);
    return list;
  }, [data, filters]);

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
    if (!data || !resourcesOpen || !user?.id) return;
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
  }, [data, resourcesOpen, user?.id]);

  const handleDropResource = useCallback(
    async (payload: GanttResourceDragPayload, projectId: string, taskIds: string[]) => {
      if (!data?.canEdit || taskIds.length === 0) return;
      try {
        setActionError(null);
        if (payload.kind === "employee") {
          await Promise.all(
            taskIds.map((tid) =>
              updateTaskAssignee(projectId, tid, payload.id, payload.name)
            )
          );
        } else {
          await Promise.all(
            taskIds.map((tid) => {
              const taskDoc = data.tasksByProject[projectId]?.find((t) => t.id === tid);
              const existing = taskDoc?.assignedTools ?? [];
              if (existing.some((tl) => tl.id === payload.id)) return Promise.resolve();
              const merged: TaskToolSnapshot[] = [
                ...existing,
                {
                  id: payload.id,
                  name: payload.name,
                  type: payload.type ?? null,
                  qrCode: null,
                },
              ];
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

  const phaseOptions = useMemo(() => {
    if (!data || filters.projectId === "all") return [];
    const project = data.projects.find((p) => p.id === filters.projectId);
    if (!project) return [];
    return project.phases.map((ph) => ({
      id: ph.id,
      name: ph.isGeneral ? t("projects.dashboard.phaseGeneral") : ph.name,
    }));
  }, [data, filters.projectId, t]);

  useEffect(() => {
    if (!drag || !data?.canEdit) return;

    const onMove = (e: MouseEvent) => {
      setDrag((d) => (d ? { ...d, offsetPx: e.clientX - d.startX } : null));
    };

    const onUp = async () => {
      if (!drag) return;
      const deltaDays = Math.round(drag.offsetPx / timeline.dayWidthPx);
      setDrag(null);
      if (deltaDays === 0) return;

      try {
        setActionError(null);
        if (drag.kind === "task" && drag.taskId) {
          const doc = findTaskDoc(drag.projectId, drag.taskId);
          if (!doc) return;
          await moveTaskScheduleByDays(drag.projectId, doc, deltaDays, true);
          await reloadAfterMutation();
        } else if (drag.kind === "phase" && drag.phaseId) {
          const phase = data.projects
            .find((p) => p.id === drag.projectId)
            ?.phases.find((ph) => ph.id === drag.phaseId);
          setPhaseShift({
            projectId: drag.projectId,
            phaseId: drag.phaseId,
            phaseName: phase?.name === "__general__" ? t("projects.dashboard.phaseGeneral") : phase?.name ?? "",
            days: deltaDays,
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
  }, [drag, data, timeline.dayWidthPx, t, reloadAfterMutation]);

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

  const scrollToToday = () => {
    const idx = timeline.days.findIndex((d) => d.isToday);
    if (idx < 0 || !scrollRef.current) return;
    scrollRef.current.scrollLeft = Math.max(0, idx * timeline.dayWidthPx - 120);
  };

  useEffect(() => {
    if (loading || !data) return;
    const timer = window.setTimeout(() => scrollToToday(), 80);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll once after data load
  }, [loading, data?.projects.length, timeline.dayWidthPx]);

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

  useEffect(() => {
    if (!chartExpanded) return;
    const timer = window.setTimeout(() => scrollToToday(), 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scroll when entering expand
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
        chartExpanded
          ? styles.ganttExpanded
          : "mx-auto max-w-[96rem] space-y-4 pb-8",
        chartExpanded && styles.ganttShellWide
      )}
    >
      <header className={cn(chartExpanded && "shrink-0", !chartExpanded && "space-y-1")}>
        <h1 className={cn("font-bold text-[#1D376A]", chartExpanded ? "text-lg" : "text-2xl")}>
          {t("gantt.title")}
        </h1>
        {!chartExpanded ? (
          <p className="text-sm text-muted-foreground">{t("gantt.subtitle")}</p>
        ) : null}
      </header>

      <div className={cn(chartExpanded && "shrink-0")}>
      <GanttToolbar
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
        selectedProjectId={filters.projectId}
        canEdit={data?.canEdit ?? false}
        onToday={scrollToToday}
        onZoomIn={() => setZoom((z) => Math.min(2, z + 0.15))}
        onZoomOut={() => setZoom((z) => Math.max(0.6, z - 0.15))}
        onAutoSchedule={() => void handleAutoSchedule()}
        onPrev={() => setAnchor((d) => addDays(d, viewMode === "week" ? -7 : viewMode === "month" ? -30 : -90))}
        onNext={() => setAnchor((d) => addDays(d, viewMode === "week" ? 7 : viewMode === "month" ? 30 : 90))}
        chartExpanded={chartExpanded}
        onToggleChartExpanded={toggleChartExpanded}
        resourcesOpen={resourcesOpen}
        onToggleResources={() => setResourcesOpen((v) => !v)}
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
          <Loader2 className="size-8 animate-spin text-[#1D376A]" />
        </div>
      ) : (
        <div className={cn(styles.ganttBody, chartExpanded && styles.ganttBodyExpanded)}>
        <div
          ref={chartFrameRef}
          className={cn(
            "rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden min-w-0",
            styles.ganttChartFlex,
            chartExpanded && styles.ganttChartFrame
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
                <p className="p-8 text-center text-sm text-muted-foreground">
                  {(data?.projects.length ?? 0) === 0
                    ? t("gantt.emptyNoProjects")
                    : t("gantt.empty")}
                </p>
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
                    onTaskDragStart={(projectId, taskId, e) => {
                      if (!data?.canEdit) return;
                      e.preventDefault();
                      setDrag({ kind: "task", projectId, taskId, startX: e.clientX, offsetPx: 0 });
                    }}
                    onPhaseDragStart={(projectId, phaseId, e) => {
                      if (!data?.canEdit) return;
                      e.preventDefault();
                      setDrag({ kind: "phase", projectId, phaseId, startX: e.clientX, offsetPx: 0 });
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
                    onResize={async (projectId, taskId, edge, newDate) => {
                      const doc = findTaskDoc(projectId, taskId);
                      if (!doc) return;
                      try {
                        await resizeTaskSchedule(projectId, doc, edge, newDate);
                        await reloadAfterMutation();
                      } catch (e) {
                        setActionError(
                          e instanceof Error ? e.message : t("gantt.resizeNotAllowed")
                        );
                      }
                    }}
                    onDropResource={
                      data?.canEdit ? handleDropResource : undefined
                    }
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
            onClose={() => setResourcesOpen(false)}
            t={t}
          />
        ) : null}
        </div>
      )}

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

      <Dialog open={!!phaseShift} onOpenChange={(o) => !o && setPhaseShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gantt.phaseShiftTitle")}</DialogTitle>
          </DialogHeader>
          {phaseShift ? (
            <p className="text-sm text-muted-foreground">
              {t("gantt.phaseShiftBody", {
                phase: phaseShift.phaseName,
                days: Math.abs(phaseShift.days),
                direction: phaseShift.days > 0 ? t("gantt.forward") : t("gantt.backward"),
              })}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhaseShift(null)}>
              {t("common.cancel")}
            </Button>
            <Button className="bg-[#1D376A]" onClick={() => void confirmPhaseShift()}>
              {t("gantt.applyShift")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (chartExpanded && typeof document !== "undefined") {
    return createPortal(shell, document.body);
  }

  return shell;
}

function DroppableRow({
  enabled,
  onDropPayload,
  className,
  children,
}: {
  enabled: boolean;
  onDropPayload: (payload: GanttResourceDragPayload) => void;
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
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(GANTT_RESOURCE_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(GANTT_RESOURCE_MIME);
        setOver(false);
        if (!raw) return;
        e.preventDefault();
        try {
          onDropPayload(JSON.parse(raw) as GanttResourceDragPayload);
        } catch {
          /* ignore malformed payload */
        }
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
  onResize,
  onDropResource,
  t,
}: {
  project: GanttProjectNode;
  timeline: GanttTimeline;
  fillWidth?: boolean;
  collapsed: Set<string>;
  onToggleCollapse: (key: string) => void;
  canEdit: boolean;
  drag: DragState | null;
  onTaskDragStart: (projectId: string, taskId: string, e: React.MouseEvent) => void;
  onPhaseDragStart: (projectId: string, phaseId: string, e: React.MouseEvent) => void;
  onScheduleTask: (projectId: string, taskId: string, startYmd: string) => void;
  onResize: (
    projectId: string,
    taskId: string,
    edge: "start" | "end",
    newDate: string
  ) => void;
  onDropResource?: (
    payload: GanttResourceDragPayload,
    projectId: string,
    taskIds: string[]
  ) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const pKey = `p-${project.id}`;
  const isCollapsed = collapsed.has(pKey);
  const allTaskIds = project.phases.flatMap((ph) => ph.tasks.map((tk) => tk.id));

  return (
    <>
      <DroppableRow
        enabled={!!onDropResource && allTaskIds.length > 0}
        onDropPayload={(payload) =>
          onDropResource?.(payload, project.id, allTaskIds)
        }
        className={styles.gridRow}
      >
        <div className={cn(styles.rowLabel, styles.rowLabelProject)}>
          <button type="button" className="mr-1 shrink-0" onClick={() => onToggleCollapse(pKey)}>
            {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <Link href={`/app/projects/${project.id}?tab=tasks`} className="truncate hover:underline">
            {project.name}
          </Link>
        </div>
        <GanttInteractiveTimeline timeline={timeline} canEdit={false} fillWidth={fillWidth}>
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
            tooltipData={{
              title: project.name,
              dateRange: formatGanttRange(project.startYmd, project.endYmd),
              statusLabel: `${project.progress}% ${t("gantt.tooltip.complete")}`,
              meta: `${project.doneTasks}/${project.totalTasks} ${t("gantt.tooltip.tasks")}`,
            }}
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
                  onDropPayload={(payload) =>
                    onDropResource?.(payload, project.id, phaseTaskIds)
                  }
                  className={styles.gridRow}
                >
                  <div className={cn(styles.rowLabel, styles.rowLabelPhase)}>
                    <button type="button" className="mr-1" onClick={() => onToggleCollapse(phKey)}>
                      {phCollapsed ? (
                        <ChevronRight className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                    <span className="truncate">{phaseName}</span>
                  </div>
                  <GanttInteractiveTimeline timeline={timeline} canEdit={canEdit} fillWidth={fillWidth}>
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
                      onDragStart={(e) => onPhaseDragStart(project.id, phase.id, e)}
                      tooltipData={{
                        title: phaseName,
                        dateRange: formatGanttRange(phase.startYmd, phase.endYmd),
                        meta: `${phase.done}/${phase.total} ${t("gantt.tooltip.tasks")}`,
                      }}
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
                      return (
                        <DroppableRow
                          key={task.id}
                          enabled={!!onDropResource}
                          onDropPayload={(payload) =>
                            onDropResource?.(payload, project.id, [task.id])
                          }
                          className={styles.gridRow}
                        >
                          <div className={cn(styles.rowLabel, styles.rowLabelTask, task.isUnscheduled && styles.rowLabelUnscheduled)}>
                            <div className="min-w-0">
                              <span className="block truncate">{task.title}</span>
                              {task.assigneeName || task.toolSummary ? (
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {[task.assigneeName, task.toolSummary].filter(Boolean).join(" · ")}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <GanttInteractiveTimeline
                            timeline={timeline}
                            canEdit={canEdit}
                            fillWidth={fillWidth}
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
                              dragOffsetPx={taskDrag}
                              isDragging={taskDrag !== 0}
                              onDragStart={(e) => onTaskDragStart(project.id, task.id, e)}
                              onResizeStart={(edge, e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!task.canResize || !task.startYmd || !task.endYmd) return;
                                const startX = e.clientX;
                                const onUp = async (ev: MouseEvent) => {
                                  window.removeEventListener("mouseup", onUp);
                                  const delta = Math.round(
                                    (ev.clientX - startX) / timeline.dayWidthPx
                                  );
                                  if (delta === 0) return;
                                  const base =
                                    edge === "start" ? task.startYmd! : task.endYmd!;
                                  const d = addDays(parseIsoDateLocal(base), delta);
                                  await onResize(project.id, task.id, edge, toIsoDateLocal(d));
                                };
                                window.addEventListener("mouseup", onUp);
                              }}
                              href={`/app/projects/${project.id}?tab=tasks`}
                              assigneeName={task.assigneeName}
                              tooltipData={{
                                title: task.title,
                                dateRange: formatGanttRange(task.startYmd, task.endYmd),
                                assignee:
                                  task.assigneeName ?? t("projects.tasks.unassigned"),
                                statusLabel: t(`gantt.legend.${task.barStatus}`),
                                meta: task.toolSummary,
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
