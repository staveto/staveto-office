/** Local-date helpers for planning views (Mon–Sun week, no external deps). */

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Monday of the week containing `date` (local timezone). */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function weekDaysFromMonday(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toIsoDateLocal(addDays(weekStart, i)));
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function monthDays(date: Date): string[] {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toIsoDateLocal(d));
  }
  return days;
}

export function isDateInRange(iso: string, fromIso: string, toIso: string): boolean {
  return iso >= fromIso && iso <= toIso;
}

/** Inclusive range overlap for absence blocks (ISO date strings). */
export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

export function dateOverlapsDay(
  blockStart: string,
  blockEnd: string,
  dayIso: string
): boolean {
  return rangesOverlap(blockStart, blockEnd, dayIso, dayIso);
}
