"use client";

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ListPlus,
  Maximize2,
  Minimize2,
  Sparkles,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GanttViewMode } from "@/lib/ganttTimeline";
import styles from "./gantt.module.css";

export type GanttFilterState = {
  projectId: string;
  workerId: string;
  status: string;
  phaseId: string;
  unassignedOnly: boolean;
  overdueOnly: boolean;
};

type Props = {
  viewMode: GanttViewMode;
  onViewModeChange: (mode: GanttViewMode) => void;
  filters: GanttFilterState;
  onFiltersChange: (patch: Partial<GanttFilterState>) => void;
  projectOptions: { id: string; name: string }[];
  workerOptions: { id: string; name: string }[];
  phaseOptions: { id: string; name: string }[];
  selectedProjectId: string;
  canEdit: boolean;
  onToday: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAutoSchedule: () => void;
  onPrev: () => void;
  onNext: () => void;
  chartExpanded?: boolean;
  onToggleChartExpanded?: () => void;
  resourcesOpen?: boolean;
  onToggleResources?: () => void;
  t: (key: string) => string;
};

export function GanttToolbar({
  viewMode,
  onViewModeChange,
  filters,
  onFiltersChange,
  projectOptions,
  workerOptions,
  phaseOptions,
  selectedProjectId,
  canEdit,
  onToday,
  onZoomIn,
  onZoomOut,
  onAutoSchedule,
  onPrev,
  onNext,
  chartExpanded = false,
  onToggleChartExpanded,
  resourcesOpen = false,
  onToggleResources,
  t,
}: Props) {
  return (
    <div className="space-y-3">
      <div className={styles.toolbar}>
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={onPrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onNext}>
            <ChevronRight className="size-4" />
          </Button>
          {(["week", "month", "quarter"] as GanttViewMode[]).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={viewMode === mode ? "default" : "outline"}
              className={viewMode === mode ? "bg-[#1D376A] hover:bg-[#162d58]" : ""}
              onClick={() => onViewModeChange(mode)}
            >
              {t(`gantt.view.${mode}`)}
            </Button>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={onToday}>
            <Calendar className="mr-1 size-3.5" />
            {t("gantt.today")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onZoomOut}>
            <ZoomOut className="size-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onZoomIn}>
            <ZoomIn className="size-4" />
          </Button>
          {onToggleResources ? (
            <Button
              type="button"
              size="sm"
              variant={resourcesOpen ? "default" : "outline"}
              className={resourcesOpen ? "bg-[#1D376A] hover:bg-[#162d58]" : ""}
              onClick={onToggleResources}
              title={t("gantt.resources.toggle")}
              aria-pressed={resourcesOpen}
            >
              <Users className="size-4" />
              <span className="ml-1.5 hidden lg:inline">{t("gantt.resources.toggle")}</span>
            </Button>
          ) : null}
          {onToggleChartExpanded ? (
            <Button
              type="button"
              size="sm"
              variant={chartExpanded ? "default" : "outline"}
              className={chartExpanded ? "bg-[#1D376A] hover:bg-[#162d58]" : ""}
              onClick={onToggleChartExpanded}
              title={chartExpanded ? t("gantt.exitExpand") : t("gantt.expandChart")}
              aria-pressed={chartExpanded}
            >
              {chartExpanded ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
              {!chartExpanded ? (
                <span className="ml-1.5 hidden xl:inline">{t("gantt.expandChart")}</span>
              ) : null}
            </Button>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-1">
            {selectedProjectId !== "all" ? (
              <>
                <Link
                  href={`/app/projects/${selectedProjectId}?tab=tasks`}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
                >
                  <ListPlus className="size-3.5" />
                  {t("gantt.addTask")}
                </Link>
                <Link
                  href={`/app/projects/${selectedProjectId}?tab=tasks`}
                  className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
                >
                  {t("gantt.bulkPlan")}
                </Link>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onAutoSchedule}
              title={t("gantt.autoScheduleHint")}
            >
              <Sparkles className="mr-1 size-3.5" />
              {t("gantt.autoSchedule")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className={styles.filtersRow}>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("gantt.filter.project")}</span>
          <Select
            value={filters.projectId}
            onValueChange={(v) => onFiltersChange({ projectId: v ?? "all" })}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue>
                {(value: string | null) =>
                  !value || value === "all"
                    ? t("gantt.filter.allProjects")
                    : projectOptions.find((p) => p.id === value)?.name ??
                      t("gantt.filter.allProjects")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gantt.filter.allProjects")}</SelectItem>
              {projectOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("gantt.filter.worker")}</span>
          <Select
            value={filters.workerId}
            onValueChange={(v) => onFiltersChange({ workerId: v ?? "all" })}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue>
                {(value: string | null) =>
                  !value || value === "all"
                    ? t("gantt.filter.allWorkers")
                    : workerOptions.find((w) => w.id === value)?.name ??
                      t("gantt.filter.allWorkers")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gantt.filter.allWorkers")}</SelectItem>
              {workerOptions.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {phaseOptions.length > 0 ? (
          <label className={styles.filterGroup}>
            <span className={styles.filterLabel}>{t("gantt.filter.phase")}</span>
            <Select
              value={filters.phaseId}
              onValueChange={(v) => onFiltersChange({ phaseId: v ?? "all" })}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue>
                  {(value: string | null) =>
                    !value || value === "all"
                      ? t("gantt.filter.allPhases")
                      : phaseOptions.find((ph) => ph.id === value)?.name ??
                        t("gantt.filter.allPhases")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("gantt.filter.allPhases")}</SelectItem>
                {phaseOptions.map((ph) => (
                  <SelectItem key={ph.id} value={ph.id}>
                    {ph.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>{t("gantt.filter.statusLabel")}</span>
          <Select
            value={filters.status}
            onValueChange={(v) => onFiltersChange({ status: v ?? "all" })}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue>
                {(value: string | null) => {
                  switch (value) {
                    case "open":
                      return t("projects.tasks.statusOpen");
                    case "done":
                      return t("projects.tasks.statusDone");
                    case "blocked":
                      return t("gantt.legend.blocked");
                    default:
                      return t("gantt.filter.allStatus");
                  }
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gantt.filter.allStatus")}</SelectItem>
              <SelectItem value="open">{t("projects.tasks.statusOpen")}</SelectItem>
              <SelectItem value="done">{t("projects.tasks.statusDone")}</SelectItem>
              <SelectItem value="blocked">{t("gantt.legend.blocked")}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <Button
          type="button"
          size="sm"
          variant={filters.unassignedOnly ? "default" : "outline"}
          className={filters.unassignedOnly ? "bg-[#1D376A]" : ""}
          onClick={() => onFiltersChange({ unassignedOnly: !filters.unassignedOnly })}
        >
          {t("gantt.filter.unassigned")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filters.overdueOnly ? "default" : "outline"}
          className={filters.overdueOnly ? "bg-[#e06737] hover:bg-[#c9582f]" : ""}
          onClick={() => onFiltersChange({ overdueOnly: !filters.overdueOnly })}
        >
          {t("gantt.filter.overdue")}
        </Button>
      </div>
    </div>
  );
}
