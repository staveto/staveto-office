"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  FolderGit2,
  Receipt,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ProjectDoc, TaskDoc } from "@/lib/projects";
import type { TimeEntryDoc } from "@/services/attendance/timeTrackingReadService";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import {
  buildProjectActivity,
  type ProjectActivityEvent,
  type ProjectActivityType,
} from "@/lib/projectActivity";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type ProjectActivityTabProps = {
  project: ProjectDoc;
  tasks: TaskDoc[];
  timeEntries: TimeEntryDoc[];
  documents: ProjectDocumentRecord[];
};

const TYPE_ICON: Record<ProjectActivityType, typeof CheckCircle2> = {
  task: CheckCircle2,
  time: Clock,
  document: FileText,
  crew: Users,
  quote: Receipt,
  project: FolderGit2,
};

const TYPE_TONE: Record<ProjectActivityType, string> = {
  task: "bg-emerald-50 text-emerald-600",
  time: "bg-blue-50 text-blue-600",
  document: "bg-violet-50 text-violet-600",
  crew: "bg-amber-50 text-amber-600",
  quote: "bg-[#e06737]/10 text-[#e06737]",
  project: "bg-[#1D376A]/10 text-[#1D376A]",
};

type FilterKey = "all" | ProjectActivityType;

export function ProjectActivityTab({
  project,
  tasks,
  timeEntries,
  documents,
}: ProjectActivityTabProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<FilterKey>("all");

  const events = useMemo(
    () => buildProjectActivity({ project, tasks, timeEntries, documents }),
    [project, tasks, timeEntries, documents]
  );

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.type === filter)),
    [events, filter]
  );

  const filters: FilterKey[] = ["all", "task", "time", "document", "quote"];

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
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
        <div className="flex flex-wrap gap-1.5 pt-2">
          {filters.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filter === key ? "default" : "outline"}
              className={cn("h-7 px-2.5 text-xs", filter === key && "bg-[#1D376A]")}
              onClick={() => setFilter(key)}
            >
              {t(`projects.activity.filter.${key}`)}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("projects.draft.activityPlaceholder")}
          </p>
        ) : (
          <ol className="relative space-y-1">
            {filtered.map((event, index) => (
              <ActivityRow
                key={event.id}
                event={event}
                isLast={index === filtered.length - 1}
                formatDate={formatDate}
                t={t}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityRow({
  event,
  isLast,
  formatDate,
  t,
}: {
  event: ProjectActivityEvent;
  isLast: boolean;
  formatDate: (iso: string) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const Icon = TYPE_ICON[event.type];
  return (
    <li className="relative flex gap-3 pb-4">
      {!isLast ? (
        <span
          className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
          TYPE_TONE[event.type]
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-sm text-foreground">{t(event.titleKey, event.params)}</p>
        {event.detail ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.detail}</p>
        ) : null}
        <time className="mt-0.5 block text-xs text-muted-foreground">
          {formatDate(event.date)}
        </time>
      </div>
    </li>
  );
}
