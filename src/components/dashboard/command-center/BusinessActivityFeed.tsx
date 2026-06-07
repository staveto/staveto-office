"use client";

import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  buildActivityFeed,
  formatRelativeTime,
  type DashboardActivityItem,
} from "@/lib/dashboardCommandCenter";
import type { DashboardStats } from "@/lib/dashboardStats";

type BusinessActivityFeedProps = {
  stats: DashboardStats;
  loading: boolean;
  emptyTipKey?: string | null;
};

function ActivityRow({ item, label }: { item: DashboardActivityItem; label: string }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center justify-between gap-4 rounded-xl px-4 py-3",
        "transition-colors hover:bg-muted/40"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{item.title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={item.timestamp}>{formatRelativeTime(item.timestamp)}</time>
        <ArrowRight
          className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function ActivityTip({ message }: { message: string }) {
  const { t } = useI18n();

  return (
    <div className="flex gap-3 px-5 py-6">
      <Lightbulb className="size-5 shrink-0 text-[#e06737]/80" aria-hidden />
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("dashboard.command.setup.activityTip.label")}
        </p>
        <p className="text-sm leading-relaxed text-foreground">{message}</p>
      </div>
    </div>
  );
}

export function BusinessActivityFeed({
  stats,
  loading,
  emptyTipKey,
}: BusinessActivityFeedProps) {
  const { t } = useI18n();
  const items = buildActivityFeed(stats);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {t("dashboard.command.activity.title")}
      </h2>
      <div className="rounded-2xl bg-muted/20 ring-1 ring-border/40">
        {loading ? (
          <div className="space-y-1 p-2 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="mx-2 h-12 rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : items.length === 0 ? (
          emptyTipKey ? (
            <ActivityTip message={t(emptyTipKey)} />
          ) : null
        ) : (
          <ul className="divide-y divide-border/40 p-1" role="list">
            {items.map((item) => (
              <li key={item.id}>
                <ActivityRow
                  item={item}
                  label={t(`dashboard.command.activity.${item.kind}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
