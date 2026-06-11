"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import type { MissionControlAttentionItem } from "@/lib/missionControlData";
import { cn } from "@/lib/utils";

type MissionControlAttentionProps = {
  items: MissionControlAttentionItem[];
};

export function MissionControlAttention({ items }: MissionControlAttentionProps) {
  const { t } = useI18n();

  if (items.length === 0) return null;

  return (
    <section
      className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 dark:border-amber-500/25 dark:bg-amber-950/40"
      aria-label={t("dashboard.mission.attention.title")}
    >
      <span className="flex shrink-0 items-center gap-1.5 pr-1 text-xs font-semibold text-amber-900 dark:text-amber-200">
        <AlertTriangle className="size-3.5" aria-hidden />
        {t("dashboard.mission.attention.title")}
      </span>
      <ul className="flex flex-wrap gap-1.5" role="list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-foreground",
                "ring-1 ring-amber-200/60 transition-colors hover:bg-amber-100/80",
                "dark:bg-amber-950/60 dark:ring-amber-500/30 dark:hover:bg-amber-900/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              )}
            >
              <span>{t(item.labelKey, item.params)}</span>
              <span className="flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold tabular-nums text-white">
                {item.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
