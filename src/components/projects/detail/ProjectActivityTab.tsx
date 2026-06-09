"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectDoc } from "@/lib/projects";
import { getManagerStatusKey } from "@/lib/projectDashboard";
import { useI18n } from "@/i18n/I18nContext";

type ActivityEntry = {
  id: string;
  date: string;
  labelKey: string;
  detail?: string;
};

function buildActivity(project: ProjectDoc): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  if (project.createdAt) {
    entries.push({
      id: "created",
      date: project.createdAt,
      labelKey: "projects.dashboard.activity.created",
    });
  }

  const qs = project.quoteStatus ?? "none";
  if (qs !== "none") {
    entries.push({
      id: `quote-${qs}`,
      date: project.updatedAt ?? project.createdAt ?? "",
      labelKey: `projects.dashboard.activity.quote.${qs}`,
    });
  }

  const statusKey = getManagerStatusKey(project);
  if (project.lifecycleStatus && project.lifecycleStatus !== "new_request") {
    entries.push({
      id: `lifecycle-${project.lifecycleStatus}`,
      date: project.updatedAt ?? "",
      labelKey: "projects.dashboard.activity.statusChanged",
      detail: statusKey,
    });
  }

  if (project.convertedAt) {
    entries.push({
      id: "converted",
      date: project.convertedAt,
      labelKey: "projects.dashboard.activity.converted",
    });
  }

  if (project.internalNote?.trim()) {
    entries.push({
      id: "note",
      date: project.updatedAt ?? project.createdAt ?? "",
      labelKey: "projects.dashboard.activity.note",
      detail: project.internalNote.trim().slice(0, 120),
    });
  }

  return entries
    .filter((e) => e.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

type ProjectActivityTabProps = {
  project: ProjectDoc;
};

export function ProjectActivityTab({ project }: ProjectActivityTabProps) {
  const { t } = useI18n();
  const activity = buildActivity(project);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-[#1D376A]">
          {t("projects.dashboard.tab.activity")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("projects.draft.activityPlaceholder")}
          </p>
        ) : (
          <ul className="space-y-4">
            {activity.map((entry) => (
              <li key={entry.id} className="flex gap-4 text-sm">
                <time className="text-xs text-muted-foreground shrink-0 w-32">
                  {formatDate(entry.date)}
                </time>
                <div>
                  <p className="font-medium">{t(entry.labelKey)}</p>
                  {entry.detail ? (
                    <p className="text-muted-foreground text-xs mt-0.5">{entry.detail}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
