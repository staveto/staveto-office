"use client";

import { ArrowRight } from "lucide-react";
import type { ProjectOverviewViewModel } from "@/lib/projectOverviewViewModel";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { po } from "./poStyles";

type Props = {
  activity: ProjectOverviewViewModel["activity"];
  onNavigate: (tab: ProjectDashboardTab) => void;
};

export function ProjectActivityPreview({ activity, onNavigate }: Props) {
  const { t } = useI18n();

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
          {activity.map((row) => (
            <li
              key={row.id}
              className={cn(
                po.cardMuted,
                "flex items-start justify-between gap-3 px-3 py-2 text-sm"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={po.bodyStrong}>{row.actor}</span>
                <span className={cn(po.body, " block")}>
                  {t(row.textKey, row.textParams)}
                </span>
                {row.detail ? (
                  <span className={cn(po.muted, "block truncate")}>{row.detail}</span>
                ) : null}
              </span>
              <time className={cn(po.muted, "shrink-0 tabular-nums")}>{row.timeLabel}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
