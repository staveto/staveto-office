"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import styles from "./planning.module.css";
import { cn } from "@/lib/utils";

type PlanningSummaryCardProps = {
  title: string;
  value: number | null;
  loading?: boolean;
  comingSoon?: boolean;
  icon?: LucideIcon;
};

export function PlanningSummaryCard({
  title,
  value,
  loading = false,
  comingSoon = false,
  icon: Icon,
}: PlanningSummaryCardProps) {
  const { t } = useI18n();
  const display = loading ? null : value === null || comingSoon ? "—" : value;

  return (
    <div className={styles.summaryCard}>
      <div className="flex items-start justify-between gap-2">
        <p className={styles.summaryCardTitle}>{title}</p>
        {Icon ? (
          <Icon className="size-3.5 shrink-0 text-[#1D376A]/50" aria-hidden />
        ) : null}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        {loading ? (
          <Loader2
            className="size-5 animate-spin text-muted-foreground"
            aria-label={t("i18n.aria.loading")}
          />
        ) : (
          <span
            className={cn(
              styles.summaryCardValue,
              display === "—" && "text-muted-foreground text-xl"
            )}
          >
            {display}
          </span>
        )}
        {comingSoon && !loading ? (
          <span className={styles.summaryCardMeta}>{t("sidebar.comingSoon")}</span>
        ) : null}
      </div>
    </div>
  );
}
