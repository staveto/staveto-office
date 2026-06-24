"use client";

import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type CompanyDashboardBootSkeletonProps = {
  className?: string;
};

export function CompanyDashboardBootSkeleton({
  className,
}: CompanyDashboardBootSkeletonProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn("mx-auto w-full max-w-[1440px] space-y-5 pb-10", className)}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">
          {t("dashboard.boot.message")}
        </p>
      </div>

      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-56 max-w-full rounded-lg bg-muted" />
        <div className="h-4 w-72 max-w-full rounded bg-muted/70" />
      </div>

      <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <div className="h-52 rounded-xl bg-muted/50 animate-pulse" />
          <div className="h-36 rounded-xl bg-muted/40 animate-pulse" />
        </div>
        <div className="lg:col-span-4">
          <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
