"use client";

import { Clock } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import { formatOverviewMinutes } from "@/lib/projectOverviewViewModel";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  time: ProjectOverviewViewModel["time"];
};

export function ProjectTimeCard({ time }: Props) {
  const { t } = useI18n();

  return (
    <section className={cn(po.card, "p-4")}>
      <h2 className={cn(po.title, "mb-3 flex items-center gap-2")}>
        <Clock className="size-4" aria-hidden />
        {t("projects.time.title")}
      </h2>

      <div className={cn(po.cardMuted, "mb-3 px-3 py-2.5")}>
        <p className={po.label}>{t("projects.time.total")}</p>
        <p className="text-2xl font-bold tabular-nums text-[var(--po-text-primary)]">
          {formatOverviewMinutes(time.totalMinutes)}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <TimePill label={t("projects.time.range.today")} value={formatOverviewMinutes(time.todayMinutes)} />
        <TimePill label={t("projects.time.range.week")} value={formatOverviewMinutes(time.weekMinutes)} />
        <TimePill label={t("projects.time.range.month")} value={formatOverviewMinutes(time.monthMinutes)} />
      </div>

      {time.byPerson.length === 0 ? (
        <p className={cn(po.muted, "text-center py-2")}>{t("projects.time.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {time.byPerson.map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-2 text-sm">
              <span className={cn("truncate", po.bodyStrong)}>{row.name}</span>
              <span className="shrink-0 tabular-nums text-[var(--po-text-secondary)]">
                {formatOverviewMinutes(row.minutes)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TimePill({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(po.cardMuted, "px-2 py-1.5")}>
      <p className="text-[10px] uppercase tracking-wide text-[var(--po-text-muted)]">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-[var(--po-text-primary)]">{value}</p>
    </div>
  );
}
