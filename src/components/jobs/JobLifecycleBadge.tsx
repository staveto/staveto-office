"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getLifecycleBadgeKey } from "@/lib/projectLifecycle";
import type { ProjectDoc } from "@/lib/projects";
import { useI18n } from "@/i18n/I18nContext";

type JobLifecycleBadgeProps = {
  project: Pick<ProjectDoc, "phase" | "lifecycleStatus" | "salesStatus">;
  className?: string;
};

export function JobLifecycleBadge({ project, className }: JobLifecycleBadgeProps) {
  const { t } = useI18n();
  const key = getLifecycleBadgeKey(project);
  const label = t(`projects.lifecycle.${key}`);

  const variantClass =
    key === "concept" || key === "waitingCustomer"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100"
      : key === "readyQuote" || key === "quoteSent"
        ? "border-[#1D376A]/25 bg-[#1D376A]/8 text-[#1D376A]"
        : key === "activeJob" || key === "planned"
          ? "border-emerald-600/25 bg-emerald-600/10 text-emerald-900 dark:text-emerald-100"
          : key === "rejected" || key === "archived"
            ? "bg-muted text-muted-foreground"
            : "border-[#e06737]/30 bg-[#e06737]/10 text-[#e06737]";

  return (
    <Badge variant="outline" className={cn("font-normal", variantClass, className)}>
      {label}
    </Badge>
  );
}
