"use client";

import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import type { ProjectHealthStatus } from "@/lib/projectHealth";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type Props = {
  status: ProjectHealthStatus;
  className?: string;
  size?: "sm" | "md";
};

const CONFIG: Record<
  ProjectHealthStatus,
  { icon: typeof CheckCircle2; labelKey: string; className: string }
> = {
  ON_TRACK: {
    icon: CheckCircle2,
    labelKey: "projects.health.onTrack",
    className:
      "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100",
  },
  ATTENTION: {
    icon: AlertTriangle,
    labelKey: "projects.health.attention",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  },
  BLOCKED: {
    icon: OctagonAlert,
    labelKey: "projects.health.blocked",
    className: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200",
  },
};

export function ProjectHealthBadge({ status, className, size = "md" }: Props) {
  const { t } = useI18n();
  const config = CONFIG[status];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        config.className,
        className
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      {t(config.labelKey)}
    </span>
  );
}
