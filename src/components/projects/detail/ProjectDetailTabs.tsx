"use client";

import { AlertTriangle } from "lucide-react";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { getVisibleProjectDashboardTabs } from "@/lib/projectDashboard";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

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
  const { modules } = useEnabledModules();
  const visibleTabs = getVisibleProjectDashboardTabs(modules);

  return (
    <div
      className="flex gap-0.5 overflow-x-auto border-b border-[var(--po-card-border)]"
      role="tablist"
      aria-label={t("projects.dashboard.tabs.label")}
    >
      {visibleTabs.map((tab) => {
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
              "group relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors sm:min-h-10",
              isActive
                ? "border-[var(--po-primary)] bg-[var(--po-card-muted)] text-[var(--po-text-primary)]"
                : "border-transparent text-[var(--po-text-muted)] hover:border-[var(--po-card-border)] hover:bg-[var(--po-card-muted)]/60 hover:text-[var(--po-text-primary)]"
            )}
          >
            {t(`projects.dashboard.tab.${tab}`)}
            {badge?.warn ? (
              <AlertTriangle className="size-3.5 text-amber-500 dark:text-amber-400" aria-hidden />
            ) : null}
            {showCount ? (
              <span
                className={cn(
                  "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  isActive
                    ? "bg-[var(--po-primary)] text-white"
                    : "bg-[var(--po-card-muted)] text-[var(--po-text-secondary)] group-hover:bg-[var(--po-primary)]/15"
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
