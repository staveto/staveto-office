"use client";

import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

type CompanyMetricCardProps = {
  title: string;
  value: string | number | null;
  icon: LucideIcon;
  loading?: boolean;
  comingSoon?: boolean;
  comingSoonLabel?: string;
};

export function CompanyMetricCard({
  title,
  value,
  icon: Icon,
  loading = false,
  comingSoon = false,
  comingSoonLabel,
}: CompanyMetricCardProps) {
  const { t } = useI18n();
  const soonLabel = comingSoonLabel ?? t("dashboard.comingSoon");
  const displayValue =
    loading ? null : comingSoon || value === null ? "—" : value;

  return (
    <div className="flex min-w-[9.5rem] flex-1 flex-col rounded-lg border border-border/80 bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground leading-tight">{title}</p>
        <Icon className="size-3.5 shrink-0 text-[#1D376A]/60" aria-hidden />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        {loading ? (
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-label={t("i18n.aria.loading")}
          />
        ) : (
          <span
            className={cn(
              "text-xl font-semibold tabular-nums tracking-tight",
              displayValue === "—" && "text-muted-foreground"
            )}
          >
            {displayValue}
          </span>
        )}
        {comingSoon && !loading ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {soonLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
