"use client";

import { Badge } from "@/components/ui/badge";
import type { ProjectDoc } from "@/lib/projects";
import { getSourceDisplayKey } from "@/lib/projectDashboard";
import { useI18n } from "@/i18n/I18nContext";

type JobSourceBadgeProps = {
  source?: string;
  project?: Pick<ProjectDoc, "source">;
};

export function JobSourceBadge({ source, project }: JobSourceBadgeProps) {
  const { t } = useI18n();

  const key = project
    ? getSourceDisplayKey(project as ProjectDoc)
    : source && (source.toLowerCase() === "ai" || source.includes("ai"))
      ? "ai"
      : "manual";

  return (
    <Badge variant="secondary" className="font-normal text-xs opacity-75">
      {t(`projects.source.${key}`)}
    </Badge>
  );
}
