"use client";

import { Building2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import {
  getProjectOwnershipScope,
  getOwnershipBadgeLabelKey,
  type ProjectOwnershipPick,
} from "@/lib/projectOwnership";

type ProjectOwnershipBadgeProps = {
  project: ProjectOwnershipPick;
  className?: string;
  showIcon?: boolean;
};

export function ProjectOwnershipBadge({
  project,
  className,
  showIcon = true,
}: ProjectOwnershipBadgeProps) {
  const { t } = useI18n();
  const scope = getProjectOwnershipScope(project);
  const labelKey = getOwnershipBadgeLabelKey(scope);
  const Icon = scope === "company" ? Building2 : User;

  const variantClass =
    scope === "company"
      ? "border-[#1D376A]/25 bg-[#1D376A]/8 text-[#1D376A]"
      : "border-slate-400/30 bg-slate-500/8 text-slate-700 dark:text-slate-200";

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal text-xs", variantClass, className)}
    >
      {showIcon ? <Icon className="size-3 shrink-0" aria-hidden /> : null}
      {t(labelKey)}
    </Badge>
  );
}
