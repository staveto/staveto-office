/** Compute next due date from base date + interval (mirrors mobile). */
export function computeNextDueAt(
  baseDate: Date,
  intervalUnit: "weeks" | "months",
  intervalValue: number
): Date {
  const next = new Date(baseDate);
  if (intervalUnit === "weeks") {
    next.setDate(next.getDate() + intervalValue * 7);
  } else {
    next.setMonth(next.getMonth() + intervalValue);
  }
  next.setHours(9, 0, 0, 0);
  return next;
}
