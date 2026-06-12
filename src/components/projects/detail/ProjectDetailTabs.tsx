"use client";

import { AlertTriangle } from "lucide-react";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

const TABS: ProjectDashboardTab[] = [
  "overview",
  "tasks",
  "workplan",
  "quote",
  "documents",
  "activity",
];

export type TabBadge = {
  count?: number;
  warn?: boolean;
};

type ProjectDetailTabsProps = {
  activeTab: ProjectDashboardTab;
  onTabChange: (tab: ProjectDashboardTab) => void;
  badges?: Partial<Record<ProjectDashboardTab, TabBadge>>;
};

export function ProjectDetailTabs({
  activeTab,
  onTabChange,
  badges,
}: ProjectDetailTabsProps) {
  const { t } = useI18n();

  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-border"
      role="tablist"
      aria-label={t("projects.dashboard.tabs.label")}
    >
      {TABS.map((tab) => {
        const badge = badges?.[tab];
        const isActive = activeTab === tab;
        const showCount = typeof badge?.count === "number" && badge.count > 0;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab)}
            className={cn(
              "group relative inline-flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-[#1D376A] bg-[#1D376A]/5 text-[#1D376A]"
                : "border-transparent text-muted-foreground hover:border-[#1D376A]/30 hover:bg-muted/40 hover:text-[#1D376A]"
            )}
          >
            {t(`projects.dashboard.tab.${tab}`)}
            {badge?.warn ? (
              <AlertTriangle className="size-3.5 text-amber-500" aria-hidden />
            ) : null}
            {showCount ? (
              <span
                className={cn(
                  "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  isActive
                    ? "bg-[#1D376A] text-white"
                    : "bg-muted text-muted-foreground group-hover:bg-[#1D376A]/15 group-hover:text-[#1D376A]"
                )}
              >
                {badge.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
