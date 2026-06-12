"use client";

import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  entryCalendarDayInRange,
  type TimeEntryDoc,
} from "@/services/attendance/timeTrackingReadService";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  entries: TimeEntryDoc[];
};

type RangeKey = "today" | "week" | "month" | "all";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function rangeBounds(range: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  if (range === "all") return { from: "1970-01-01", to: "9999-12-31" };
  if (range === "today") return { from: to, to };
  if (range === "week") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day);
    return { from: ymd(monday), to };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: ymd(first), to };
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function ProjectTimeInvestmentPanel({ entries }: Props) {
  const { t } = useI18n();
  const [range, setRange] = useState<RangeKey>("month");

  const data = useMemo(() => {
    const { from, to } = rangeBounds(range);
    const inRange = entries.filter((e) => entryCalendarDayInRange(e, from, to));
    const total = inRange.reduce((s, e) => s + Math.max(0, e.durationMinutes || 0), 0);

    const byPerson = new Map<string, number>();
    const byTask = new Map<string, number>();
    for (const e of inRange) {
      const person = e.userNameSnapshot?.trim() || e.userId || "—";
      byPerson.set(person, (byPerson.get(person) ?? 0) + Math.max(0, e.durationMinutes || 0));
      if (e.taskTitleSnapshot?.trim()) {
        byTask.set(
          e.taskTitleSnapshot.trim(),
          (byTask.get(e.taskTitleSnapshot.trim()) ?? 0) + Math.max(0, e.durationMinutes || 0)
        );
      }
    }

    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { total, byPerson: sortDesc(byPerson), byTask: sortDesc(byTask) };
  }, [entries, range]);

  const ranges: RangeKey[] = ["today", "week", "month", "all"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-[#1D376A]">
          <Clock className="size-4" />
          {t("projects.time.title")}
        </CardTitle>
        <div className="flex gap-0.5 rounded-lg bg-muted/60 p-0.5">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                range === r
                  ? "bg-white text-[#1D376A] shadow-sm"
                  : "text-muted-foreground hover:text-[#1D376A]"
              )}
            >
              {t(`projects.time.range.${r}`)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-[#1D376A]/[0.04] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("projects.time.total")}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-[#1D376A]">
            {formatMinutes(data.total)}
          </p>
        </div>

        {data.total === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {t("projects.time.empty")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <TimeBreakdown
              title={t("projects.time.byPerson")}
              rows={data.byPerson}
              total={data.total}
              format={formatMinutes}
            />
            {data.byTask.length > 0 ? (
              <TimeBreakdown
                title={t("projects.time.byTask")}
                rows={data.byTask}
                total={data.total}
                format={formatMinutes}
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimeBreakdown({
  title,
  rows,
  total,
  format,
}: {
  title: string;
  rows: [string, number][];
  total: number;
  format: (m: number) => string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-2">
        {rows.map(([label, minutes]) => {
          const pct = total > 0 ? Math.round((minutes / total) * 100) : 0;
          return (
            <li key={label} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{label}</span>
                <span className="shrink-0 font-medium tabular-nums text-[#1D376A]">
                  {format(minutes)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#1D376A]/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
