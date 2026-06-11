"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/i18n/I18nContext";
import type { AgendaDayGroup } from "@/lib/missionControlData";
import { formatAgendaDayLabel } from "@/lib/missionControlData";
import { parseIsoDateLocal } from "@/lib/planningDates";
import {
  missionGlassCardClassName,
  missionMutedClassName,
  missionSectionTitleClassName,
} from "./missionControlStyles";
import { cn } from "@/lib/utils";

type MissionControlCalendarProps = {
  monthDays: string[];
  daysWithEvents: string[];
  todayIso: string;
  agendaGroups: AgendaDayGroup[];
};

export function MissionControlCalendar({
  monthDays,
  daysWithEvents,
  todayIso,
  agendaGroups,
}: MissionControlCalendarProps) {
  const { t } = useI18n();
  const eventSet = useMemo(() => new Set(daysWithEvents), [daysWithEvents]);

  const firstDayIso = monthDays[0];
  const padStart = firstDayIso ? parseIsoDateLocal(firstDayIso).getDay() : 0;
  const mondayOffset = padStart === 0 ? 6 : padStart - 1;

  const weekdayLabels = [
    t("dashboard.mission.calendar.mon"),
    t("dashboard.mission.calendar.tue"),
    t("dashboard.mission.calendar.wed"),
    t("dashboard.mission.calendar.thu"),
    t("dashboard.mission.calendar.fri"),
    t("dashboard.mission.calendar.sat"),
    t("dashboard.mission.calendar.sun"),
  ];

  const agendaWithItems = agendaGroups.filter((g) => g.items.length > 0);

  return (
    <section className={cn(missionGlassCardClassName, "overflow-hidden")}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          {t("dashboard.mission.calendar.agendaTitle")}
        </h3>
        <Link href="/app/planning" className="text-xs font-medium text-primary hover:underline">
          {t("dashboard.mission.calendar.openPlanning")}
        </Link>
      </div>

      <div className="grid md:grid-cols-[11rem_1fr]">
        <div className="border-b border-border p-4 md:border-b-0 md:border-r">
          <p className={cn(missionSectionTitleClassName, "mb-2")}>
            {t("dashboard.mission.calendar.miniTitle")}
          </p>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-medium text-muted-foreground">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-0.5 grid grid-cols-7 gap-0.5">
            {Array.from({ length: mondayOffset }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {monthDays.map((iso) => {
              const dayNum = parseIsoDateLocal(iso).getDate();
              const isToday = iso === todayIso;
              const hasEvent = eventSet.has(iso);
              return (
                <span
                  key={iso}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                    !isToday && hasEvent && "bg-primary/10 font-medium text-primary"
                  )}
                >
                  {dayNum}
                </span>
              );
            })}
          </div>
        </div>

        <div className="p-4">
          {agendaWithItems.length === 0 ? (
            <p className={cn(missionMutedClassName, "text-sm")}>
              {t("dashboard.mission.calendar.agendaEmpty")}
            </p>
          ) : (
            <div className="space-y-4">
              {agendaWithItems.map((group) => {
                const dayLabelKey = formatAgendaDayLabel(group.dateIso, todayIso);
                const dayTitle =
                  dayLabelKey === "today"
                    ? t("dashboard.mission.calendar.today")
                    : dayLabelKey === "tomorrow"
                      ? t("dashboard.mission.calendar.tomorrow")
                      : dayLabelKey;

                return (
                  <div key={group.dateIso}>
                    <h4 className={cn(missionSectionTitleClassName, "mb-1.5")}>{dayTitle}</h4>
                    <ul className="space-y-1" role="list">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            className={cn(
                              "flex gap-2.5 rounded-lg px-1 py-1.5 text-sm transition-colors hover:bg-muted/40",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            )}
                          >
                            <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-primary">
                              {item.time}
                            </span>
                            <span className="min-w-0 truncate text-foreground">{item.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
