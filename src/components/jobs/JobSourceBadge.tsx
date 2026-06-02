"use client";

import { Badge } from "@/components/ui/badge";
import { getSourceBadgeKey } from "@/lib/projectLifecycle";
import type { JobSource } from "@/lib/projectLifecycle";
import { useI18n } from "@/i18n/I18nContext";

type JobSourceBadgeProps = {
  source?: JobSource;
};

export function JobSourceBadge({ source }: JobSourceBadgeProps) {
  const { t } = useI18n();
  const key = getSourceBadgeKey(source);
  if (!key) return null;

  return (
    <Badge variant="secondary" className="font-normal text-xs">
      {t(`projects.source.${key}`)}
    </Badge>
  );
}
