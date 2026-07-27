"use client";

import { useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";
import { ProjectDocumentPreviewDialog } from "@/components/projects/detail/ProjectDocumentPreviewDialog";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  activity: ProjectOverviewViewModel["activity"];
  onNavigate: (tab: ProjectDashboardTab) => void;
};

export function ProjectActivityPreview({ activity, onNavigate }: Props) {
  const { t } = useI18n();
  const [previewDoc, setPreviewDoc] = useState<ProjectDocumentRecord | null>(null);

  return (
    <section className={cn(po.cardCalm, "p-4 sm:p-5")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={po.title}>{t("projects.overview.recentActivity")}</h2>
        <button
          type="button"
          className={po.linkAction}
          onClick={() => onNavigate("activity")}
        >
          {t("projects.overview.viewAll")}
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      {activity.length === 0 ? (
        <p className={cn(po.body, "py-4 text-center")}>{t("projects.draft.activityPlaceholder")}</p>
      ) : (
        <ul className="space-y-2">
          {activity.map((row) => {
            const clickable = Boolean(row.previewDocument || row.taskId);
            const open = () => {
              if (row.previewDocument) {
                setPreviewDoc(row.previewDocument);
                return;
              }
              if (row.taskId) onNavigate("tasks");
            };

            const body = (
              <>
                <span className="min-w-0 flex-1">
                  {row.actor ? <span className={po.bodyStrong}>{row.actor}</span> : null}
                  <span className={cn(po.body, row.actor ? "block" : undefined)}>
                    {t(row.textKey, row.textParams)}
                  </span>
                  {row.detail ? (
                    <span className={cn(po.muted, "block truncate")}>{row.detail}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <time className={cn(po.muted, "tabular-nums")}>{row.timeLabel}</time>
                  {clickable ? (
                    <ChevronRight className="size-3.5 text-[var(--po-text-muted)]" aria-hidden />
                  ) : null}
                </span>
              </>
            );

            if (!clickable) {
              return (
                <li
                  key={row.id}
                  className={cn(
                    po.cardMuted,
                    "flex items-start justify-between gap-3 px-3 py-2 text-sm"
                  )}
                >
                  {body}
                </li>
              );
            }

            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={open}
                  className={cn(
                    po.cardMuted,
                    "flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm",
                    "transition-colors hover:border-[var(--po-primary)]/35 hover:bg-[var(--po-primary)]/[0.04]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--po-primary)]/30"
                  )}
                  aria-label={
                    row.previewDocument
                      ? t("projects.activity.openPhoto")
                      : t("projects.activity.openTask")
                  }
                >
                  {body}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ProjectDocumentPreviewDialog
        doc={previewDoc}
        open={previewDoc != null}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
      />
    </section>
  );
}
