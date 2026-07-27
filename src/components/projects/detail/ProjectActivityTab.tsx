"use client";

import { useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
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
import { ProjectDocumentPreviewDialog } from "./ProjectDocumentPreviewDialog";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

type ProjectActivityTabProps = {
  project: ProjectDoc;
  tasks: TaskDoc[];
  timeEntries: TimeEntryDoc[];
  documents: ProjectDocumentRecord[];
  onOpenTask?: (taskId: string) => void;
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

function isPhotoEvent(event: ProjectActivityEvent): boolean {
  const doc = event.document;
  if (!doc) return false;
  return doc.kind === "work_photo" || (doc.mimeType?.startsWith("image/") ?? false);
}

function isClickableEvent(event: ProjectActivityEvent): boolean {
  return Boolean(event.document || event.taskId);
}

export function ProjectActivityTab({
  project,
  tasks,
  timeEntries,
  documents,
  onOpenTask,
}: ProjectActivityTabProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [previewDoc, setPreviewDoc] = useState<ProjectDocumentRecord | null>(null);

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

  const handleActivate = (event: ProjectActivityEvent) => {
    if (event.document) {
      setPreviewDoc(event.document);
      return;
    }
    if (event.taskId && onOpenTask) {
      onOpenTask(event.taskId);
    }
  };

  return (
    <>
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
                  onActivate={() => handleActivate(event)}
                />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <ProjectDocumentPreviewDialog
        doc={previewDoc}
        open={previewDoc != null}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
      />
    </>
  );
}

function ActivityRow({
  event,
  isLast,
  formatDate,
  t,
  onActivate,
}: {
  event: ProjectActivityEvent;
  isLast: boolean;
  formatDate: (iso: string) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onActivate: () => void;
}) {
  const clickable = isClickableEvent(event);
  const photo = isPhotoEvent(event);
  const Icon = photo ? Camera : TYPE_ICON[event.type];

  const content = (
    <>
      {!isLast ? (
        <span
          className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
          photo ? "bg-[#e06737]/10 text-[#e06737]" : TYPE_TONE[event.type]
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-left">
        <p className={cn("text-sm text-foreground", clickable && "font-medium")}>
          {t(event.titleKey, event.params)}
        </p>
        {event.detail ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.detail}</p>
        ) : null}
        <time className="mt-0.5 block text-xs text-muted-foreground">
          {formatDate(event.date)}
        </time>
      </div>
      {clickable ? (
        <ChevronRight
          className="mt-2 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[#1D376A]"
          aria-hidden
        />
      ) : null}
    </>
  );

  if (!clickable) {
    return <li className="relative flex gap-3 pb-4">{content}</li>;
  }

  return (
    <li className="relative">
      <button
        type="button"
        onClick={onActivate}
        className={cn(
          "group relative flex w-full gap-3 rounded-lg pb-4 pr-1 text-left",
          "transition-colors hover:bg-[#1D376A]/[0.04] focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-[#1D376A]/30"
        )}
        aria-label={
          photo
            ? t("projects.activity.openPhoto")
            : event.document
              ? t("projects.activity.openDocument")
              : t("projects.activity.openTask")
        }
      >
        {content}
      </button>
    </li>
  );
}
