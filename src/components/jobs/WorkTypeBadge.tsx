"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nContext";
import { getProjectWorkType, workTypeLabelKey, type WorkType } from "@/lib/workTypes";

type WorkTypeBadgeProps = {
  project: { projectType?: string; workType?: string };
  workType?: WorkType;
};

export function WorkTypeBadge({ project, workType: explicit }: WorkTypeBadgeProps) {
  const { t } = useI18n();
  const type = explicit ?? getProjectWorkType(project);
  if (!type) return null;

  return (
    <Badge variant="outline" className="border-[#1D376A]/25 text-[#1D376A]">
      {t(workTypeLabelKey(type))}
    </Badge>
  );
}
