"use client";

import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Compact chip vs slightly longer warning. */
  compact?: boolean;
};

/**
 * Warning badge for legend-only quantities — never look plan-confirmed.
 */
export function LegendOnlyBadge({ className, compact = false }: Props) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300",
        className
      )}
      title={t("takeoff.quantity.legendOnlyBadge")}
      data-testid="legend-only-badge"
    >
      <AlertTriangle className="size-3 shrink-0" aria-hidden />
      {compact
        ? t("takeoff.quantity.legendOnlyBadgeShort")
        : t("takeoff.quantity.legendOnlyBadge")}
    </span>
  );
}
