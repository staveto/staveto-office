"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { getCompanyRoleLabelKey } from "@/lib/companyRoles";
import {
  addDays,
  isDateInRange,
  startOfWeekMonday,
  weekDaysFromMonday,
} from "@/lib/planningDates";
import {
  PLANNING_TASK_DRAG_MIME,
  decodeTaskDragPayload,
  displayInitials,
  encodeTaskDragPayload,
} from "@/lib/planningTaskDnD";
import { updateTaskDueDate } from "@/lib/projects";
import type { PlanningDashboardData, PlanningTaskItem } from "@/services/planning";
import { planningProjectColor } from "@/services/planning";
import { PlanningEmptyState } from "./PlanningEmptyState";
import { PlanningWeekLegend } from "./PlanningWeekLegend";
import styles from "./planning.module.css";

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type PlanningWeekCalendarProps = {
  data: PlanningDashboardData;
  tasks: PlanningTaskItem[];
  onTasksChange: (tasks: PlanningTaskItem[]) => void;
};

function clampToWeek(iso: string, weekStart: string, weekEnd: string): string {
  if (iso < weekStart) return weekStart;
  if (iso > weekEnd) return weekEnd;
  return iso;
}

function spanColumns(
  startIso: string,
  endIso: string,
  weekDays: string[]
): { start: number; end: number } | null {
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  if (endIso < weekStart || startIso > weekEnd) return null;

  const visibleStart = clampToWeek(startIso, weekStart, weekEnd);
  const visibleEnd = clampToWeek(endIso, weekStart, weekEnd);
  const startIdx = weekDays.indexOf(visibleStart);
  const endIdx = weekDays.indexOf(visibleEnd);
  if (startIdx < 0 || endIdx < 0) return null;
  return { start: startIdx + 1, end: endIdx + 2 };
}

function rangesOverlapWeek(
  aStart: string,
  aEnd: string,
  weekStart: string,
  weekEnd: string
): boolean {
  return aStart <= weekEnd && aEnd >= weekStart;
}

export function PlanningWeekCalendar({
  data,
  tasks,
  onTasksChange,
}: PlanningWeekCalendarProps) {
  const { t, locale } = useI18n();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const { weekDays, weekStartIso, weekEndIso, weekLabel } = useMemo(() => {
    const anchor = addDays(startOfWeekMonday(new Date()), weekOffset * 7);
    const days = weekDaysFromMonday(anchor);
    const start = days[0];
    const end = days[6];
    const fmt = (iso: string) =>
      new Date(iso + "T12:00:00").toLocaleDateString(
        locale === "sk" ? "sk-SK" : "en-GB",
        { day: "numeric", month: "short" }
      );
    return {
      weekDays: days,
      weekStartIso: start,
      weekEndIso: end,
      weekLabel: `${fmt(start)} – ${fmt(end)}`,
    };
  }, [weekOffset, locale]);

  const weekTasks = useMemo(
    () => tasks.filter((task) => isDateInRange(task.dueDate, weekStartIso, weekEndIso)),
    [tasks, weekStartIso, weekEndIso]
  );

  const memberByUid = useMemo(() => {
    const map = new Map<string, { name: string; roleKey: string }>();
    for (const m of data.members) {
      map.set(m.uid, {
        name: m.displayName,
        roleKey: getCompanyRoleLabelKey(m.effectiveRole),
      });
    }
    return map;
  }, [data.members]);

  const resolveAssignee = useCallback(
    (task: PlanningTaskItem) => {
      if (task.assigneeId && memberByUid.has(task.assigneeId)) {
        const m = memberByUid.get(task.assigneeId)!;
        return { name: m.name, roleKey: m.roleKey };
      }
      if (task.assigneeName) {
        return { name: task.assigneeName, roleKey: "planning.calendar.assignee" };
      }
      return { name: t("planning.calendar.unassigned"), roleKey: "planning.calendar.noRole" };
    },
    [memberByUid, t]
  );

  const handleDropOnDay = useCallback(
    async (dayIso: string, raw: string) => {
      setDragOverDay(null);
      setDraggingTaskId(null);
      const payload = decodeTaskDragPayload(raw);
      if (!payload) return;

      const task = tasks.find(
        (item) => item.id === payload.taskId && item.projectId === payload.projectId
      );
      if (!task || task.dueDate === dayIso) return;

      const previous = tasks;
      const next = tasks.map((item) =>
        item.id === task.id && item.projectId === task.projectId
          ? { ...item, dueDate: dayIso }
          : item
      );
      onTasksChange(next);
      setSavingTaskId(task.id);
      setMoveError(null);

      try {
        await updateTaskDueDate(task.projectId, task.id, dayIso);
      } catch {
        onTasksChange(previous);
        setMoveError(t("planning.calendar.moveError"));
      } finally {
        setSavingTaskId(null);
      }
    },
    [tasks, onTasksChange, t]
  );

  const absenceSpans = useMemo(() => {
    if (data.absencesStatus !== "available") return [];
    const visible = data.absencesLoaded.filter((a) =>
      rangesOverlapWeek(a.start, a.end, weekStartIso, weekEndIso)
    );
    return visible
      .map((absence) => {
        const span = spanColumns(absence.start, absence.end, weekDays);
        if (!span) return null;
        const member = memberByUid.get(absence.userId);
        return {
          ...absence,
          span,
          label: member?.name ?? absence.userId.slice(0, 8),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [data.absencesLoaded, data.absencesStatus, weekDays, weekStartIso, weekEndIso, memberByUid]);

  return (
    <div
      id="planning-panel-week"
      role="tabpanel"
      aria-labelledby="planning-tab-week"
      className="space-y-3"
    >
      <div className={styles.weekCalendarToolbar}>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setWeekOffset((o) => o - 1)}
            aria-label={t("planning.calendar.prevWeek")}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label={t("planning.calendar.nextWeek")}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {weekOffset !== 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setWeekOffset(0)}
            >
              {t("planning.calendar.todayWeek")}
            </Button>
          ) : null}
        </div>
        <p className={styles.weekCalendarTitle}>{weekLabel}</p>
      </div>

      <PlanningWeekLegend
        absencesStatus={data.absencesStatus}
        timeEntriesStatus={data.timeEntriesStatus}
      />

      {moveError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {moveError}
        </p>
      ) : null}

      <div className={styles.weekCalendarBoard}>
        <div className={styles.weekCalendarHeaderRow}>
          {weekDays.map((iso, i) => {
            const isToday = iso === data.todayIso;
            const d = new Date(iso + "T12:00:00");
            return (
              <div
                key={iso}
                className={`${styles.weekCalendarDayHeader} ${
                  isToday ? styles.weekCalendarDayHeaderToday : ""
                }`}
              >
                <span className={styles.weekCalendarWeekday}>
                  {t(`planning.weekday.${WEEKDAY_KEYS[i]}`)}
                </span>
                <span className={styles.weekCalendarDayNum}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>

        {absenceSpans.length > 0 ? (
          <div className={styles.weekCalendarSpanRow} aria-label={t("planning.calendar.absences")}>
            {absenceSpans.map((absence) => (
              <div
                key={absence.id}
                className={styles.weekCalendarSpanAbsence}
                style={{
                  gridColumn: `${absence.span.start} / ${absence.span.end}`,
                }}
                title={absence.label}
              >
                <span className={styles.weekCalendarSpanTag}>{t("planning.week.absence")}</span>
                <span className={styles.weekCalendarSpanTitle}>{absence.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className={styles.weekCalendarBody}>
          {weekDays.map((iso) => {
            const isToday = iso === data.todayIso;
            const dayTasks = weekTasks.filter((task) => task.dueDate === iso);
            const isDropTarget = dragOverDay === iso;

            return (
              <div
                key={iso}
                className={`${styles.weekCalendarColumn} ${
                  isToday ? styles.weekCalendarColumnToday : ""
                } ${isDropTarget ? styles.weekCalendarColumnDrop : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverDay(iso);
                }}
                onDragLeave={() => {
                  setDragOverDay((current) => (current === iso ? null : current));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw =
                    e.dataTransfer.getData(PLANNING_TASK_DRAG_MIME) ||
                    e.dataTransfer.getData("text/plain");
                  void handleDropOnDay(iso, raw);
                }}
              >
                {dayTasks.length === 0 ? (
                  <div className={styles.weekCalendarColumnEmpty} aria-hidden />
                ) : null}
                {dayTasks.map((task) => {
                  const assignee = resolveAssignee(task);
                  const color = planningProjectColor(task.projectId);
                  const isDragging = draggingTaskId === task.id;
                  const isSaving = savingTaskId === task.id;

                  return (
                    <article
                      key={`${task.projectId}-${task.id}`}
                      draggable={!isSaving}
                      onDragStart={(e) => {
                        setDraggingTaskId(task.id);
                        setMoveError(null);
                        const payload = encodeTaskDragPayload({
                          taskId: task.id,
                          projectId: task.projectId,
                        });
                        e.dataTransfer.setData(PLANNING_TASK_DRAG_MIME, payload);
                        e.dataTransfer.setData("text/plain", payload);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingTaskId(null);
                        setDragOverDay(null);
                      }}
                      className={`${styles.weekCalendarCard} ${
                        isDragging ? styles.weekCalendarCardDragging : ""
                      }`}
                      aria-grabbed={isDragging}
                    >
                      <div className={styles.weekCalendarCardTop}>
                        <span
                          className={styles.weekCalendarTag}
                          style={{ backgroundColor: `${color}18`, color }}
                        >
                          {task.projectName}
                        </span>
                        <GripVertical
                          className="size-3.5 shrink-0 text-muted-foreground/50"
                          aria-hidden
                        />
                      </div>
                      <p className={styles.weekCalendarCardTitle}>{task.title}</p>
                      <div className={styles.weekCalendarCardFooter}>
                        <span className={styles.weekCalendarRole}>
                          {assignee.roleKey.startsWith("planning.")
                            ? t(assignee.roleKey)
                            : t(assignee.roleKey)}
                          {assignee.name !== t("planning.calendar.unassigned")
                            ? `: ${assignee.name}`
                            : ""}
                        </span>
                        <span
                          className={styles.weekCalendarAvatar}
                          style={{ backgroundColor: color }}
                          title={assignee.name}
                        >
                          {isSaving ? (
                            <Loader2 className="size-3 animate-spin text-white" aria-hidden />
                          ) : (
                            displayInitials(assignee.name)
                          )}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {weekTasks.length === 0 ? (
        <PlanningEmptyState
          title={t("planning.calendar.noTasksWeekTitle")}
          description={t("planning.calendar.noTasksWeekDesc")}
        />
      ) : null}
    </div>
  );
}
