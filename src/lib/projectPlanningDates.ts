import type { TaskDoc } from "@/lib/projects";
import type { ProjectPhaseRecord } from "@/services/projects/taskPlanningTypes";
import { getTaskPlanDate } from "@/lib/taskPlanningDisplay";

export type DateDistributionMode = "evenly" | "sequential" | "same";

export type PhasePlanOptions = {
  startDate: string;
  endDate?: string;
  durationDays?: number;
  workingDaysOnly: boolean;
  mode: DateDistributionMode;
};

export type ProjectBulkPlanOptions = {
  projectStartDate: string;
  defaultPhaseDurationDays: number;
  workingDaysOnly: boolean;
  gapBetweenPhasesDays: number;
};

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

export function addCalendarDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + days);
  return formatYmd(d);
}

export function addWorkingDays(ymd: string, workingDays: number): string {
  const d = parseYmd(ymd);
  if (!d || workingDays <= 0) return ymd;
  let remaining = workingDays;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) remaining -= 1;
  }
  return formatYmd(d);
}

export function enumerateDates(
  startYmd: string,
  endYmd: string,
  workingDaysOnly: boolean
): string[] {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end || start > end) return startYmd ? [startYmd] : [];

  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (!workingDaysOnly || isWorkingDay(cur)) out.push(formatYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out.length > 0 ? out : [startYmd];
}

export function resolvePhaseEndDate(
  startDate: string,
  endDate?: string,
  durationDays?: number,
  workingDaysOnly?: boolean
): string {
  if (endDate && parseYmd(endDate)) return endDate;
  const days = Math.max(1, durationDays ?? 1);
  if (workingDaysOnly) return addWorkingDays(startDate, days - 1);
  return addCalendarDays(startDate, days - 1);
}

export function distributeDatesAcrossTasks(
  taskIds: string[],
  startDate: string,
  endDate: string,
  mode: DateDistributionMode,
  workingDaysOnly: boolean
): Map<string, string> {
  const result = new Map<string, string>();
  if (taskIds.length === 0) return result;

  if (mode === "same") {
    for (const id of taskIds) result.set(id, startDate);
    return result;
  }

  const slots = enumerateDates(startDate, endDate, workingDaysOnly);
  if (slots.length === 0) {
    for (const id of taskIds) result.set(id, startDate);
    return result;
  }

  if (mode === "sequential") {
    let idx = 0;
    for (const id of taskIds) {
      result.set(id, slots[Math.min(idx, slots.length - 1)]);
      idx += 1;
    }
    return result;
  }

  // evenly
  if (taskIds.length === 1) {
    result.set(taskIds[0], slots[0]);
    return result;
  }
  for (let i = 0; i < taskIds.length; i++) {
    const ratio = taskIds.length === 1 ? 0 : i / (taskIds.length - 1);
    const slotIdx = Math.round(ratio * (slots.length - 1));
    result.set(taskIds[i], slots[slotIdx]);
  }
  return result;
}

export function getPhaseDateRangeFromTasks(
  tasks: TaskDoc[]
): { start?: string; end?: string } | null {
  const dates = tasks
    .map(getTaskPlanDate)
    .filter((d): d is string => !!d)
    .sort();
  if (dates.length === 0) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function shiftTaskDate(
  ymd: string,
  days: number,
  workingDaysOnly: boolean
): string {
  if (!workingDaysOnly) return addCalendarDays(ymd, days);
  if (days >= 0) return addWorkingDays(ymd, days);
  const d = parseYmd(ymd);
  if (!d) return ymd;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isWorkingDay(d)) remaining -= 1;
  }
  return formatYmd(d);
}

export function shiftTaskDates(
  dates: Map<string, string>,
  days: number,
  workingDaysOnly: boolean
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, ymd] of dates) {
    out.set(id, shiftTaskDate(ymd, days, workingDaysOnly));
  }
  return out;
}

export function planPhaseTasks(
  phaseTasks: TaskDoc[],
  options: PhasePlanOptions
): Map<string, string> {
  const open = phaseTasks.filter(
    (t) => t.isActive !== false && (t.status ?? "OPEN").toUpperCase() !== "DONE"
  );
  const ids = open.map((t) => t.id);
  const end = resolvePhaseEndDate(
    options.startDate,
    options.endDate,
    options.durationDays,
    options.workingDaysOnly
  );
  return distributeDatesAcrossTasks(
    ids,
    options.startDate,
    end,
    options.mode,
    options.workingDaysOnly
  );
}

export function planProjectPhases(
  phases: ProjectPhaseRecord[],
  tasks: TaskDoc[],
  options: ProjectBulkPlanOptions
): Map<string, string> {
  const result = new Map<string, string>();
  const ordered = phases.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  let cursor = options.projectStartDate;
  for (let i = 0; i < ordered.length; i++) {
    const phase = ordered[i];
    const phaseTasks = tasks.filter(
      (t) =>
        t.isActive !== false &&
        t.phaseId?.trim() === phase.id &&
        (t.status ?? "OPEN").toUpperCase() !== "DONE"
    );
    if (phaseTasks.length === 0) {
      if (i < ordered.length - 1 && options.gapBetweenPhasesDays > 0) {
        cursor = options.workingDaysOnly
          ? addWorkingDays(
              addCalendarDays(cursor, options.defaultPhaseDurationDays - 1),
              options.gapBetweenPhasesDays
            )
          : addCalendarDays(
              cursor,
              options.defaultPhaseDurationDays - 1 + options.gapBetweenPhasesDays
            );
      } else {
        cursor = options.workingDaysOnly
          ? addWorkingDays(cursor, options.defaultPhaseDurationDays)
          : addCalendarDays(cursor, options.defaultPhaseDurationDays);
      }
      continue;
    }

    const start = cursor;
    const end = options.workingDaysOnly
      ? addWorkingDays(start, Math.max(0, options.defaultPhaseDurationDays - 1))
      : addCalendarDays(start, Math.max(0, options.defaultPhaseDurationDays - 1));

    const mapped = distributeDatesAcrossTasks(
      phaseTasks.map((t) => t.id),
      start,
      end,
      "sequential",
      options.workingDaysOnly
    );
    for (const [id, date] of mapped) result.set(id, date);

    cursor = options.workingDaysOnly
      ? addWorkingDays(end, Math.max(1, options.gapBetweenPhasesDays))
      : addCalendarDays(end, Math.max(1, options.gapBetweenPhasesDays));
  }

  return result;
}

export function countPhaseCrew(tasks: TaskDoc[]): number {
  const ids = new Set<string>();
  for (const t of tasks) {
    const uid = t.assigneeId?.trim();
    if (uid) ids.add(uid);
  }
  return ids.size;
}

export function formatDateRangeLabel(
  range: { start?: string; end?: string } | null,
  locale: string
): string {
  if (!range?.start) return "—";
  const fmt = (ymd: string) => {
    const d = parseYmd(ymd);
    if (!d) return ymd;
    return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  };
  if (!range.end || range.start === range.end) return fmt(range.start);
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}
