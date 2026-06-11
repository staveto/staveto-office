import type { TaskDoc } from "./projects";
import { getTaskPlanDate, taskMissingAssignee } from "./taskPlanningDisplay";

export type BoardColumnId = "unassigned" | "today" | "tomorrow" | "thisWeek" | "done";

export const BOARD_COLUMN_ORDER: BoardColumnId[] = [
  "unassigned",
  "today",
  "tomorrow",
  "thisWeek",
  "done",
];

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeekSunday(d: Date): Date {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getBoardColumn(task: TaskDoc, now = new Date()): BoardColumnId {
  if (task.status === "DONE") return "done";
  if (taskMissingAssignee(task)) return "unassigned";

  const planDate = getTaskPlanDate(task);
  if (!planDate) return "thisWeek";

  const today = toLocalDateString(now);
  const tomorrow = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  if (planDate === today) return "today";
  if (planDate === tomorrow) return "tomorrow";

  const planTime = new Date(planDate + "T12:00:00").getTime();
  const weekStart = startOfWeekMonday(now).getTime();
  const weekEnd = endOfWeekSunday(now).getTime();
  if (planTime >= weekStart && planTime <= weekEnd) return "thisWeek";

  return "thisWeek";
}

export function groupTasksByBoardColumn(
  tasks: TaskDoc[],
  now = new Date()
): Record<BoardColumnId, TaskDoc[]> {
  const groups: Record<BoardColumnId, TaskDoc[]> = {
    unassigned: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    done: [],
  };

  for (const task of tasks) {
    groups[getBoardColumn(task, now)].push(task);
  }

  for (const col of BOARD_COLUMN_ORDER) {
    groups[col].sort((a, b) => {
      const da = getTaskPlanDate(a) ?? "";
      const db = getTaskPlanDate(b) ?? "";
      if (da !== db) return da.localeCompare(db);
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }

  return groups;
}

export function formatTaskPlanSchedule(
  task: TaskDoc,
  t: (key: string) => string,
  locale: string
): string {
  const planDate = getTaskPlanDate(task);
  if (!planDate) return "—";

  const hasTime =
    task.plannedStart?.includes("T") &&
    task.plannedEnd?.includes("T");

  if (hasTime) {
    try {
      const start = new Date(task.plannedStart!);
      const end = new Date(task.plannedEnd!);
      const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
      const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
      return `${dateFmt.format(start)} ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
    } catch {
      /* fall through */
    }
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).format(new Date(planDate + "T12:00:00"));
  } catch {
    return planDate;
  }
}
