"use client";

import type { ProjectDoc } from "@/lib/projects";
import type { ProjectDashboardTab } from "@/lib/projectDashboard";
import { getOrderedProjectDashboardTabs } from "@/lib/projectDefaultTab";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";

export type TabBadge = {
  count?: number;
  warn?: boolean;
};

type ProjectDetailTabsProps = {
  project: Pick<ProjectDoc, "phase" | "lifecycleStatus" | "quoteStatus">;
  activeTab: ProjectDashboardTab;
  onTabChange: (tab: ProjectDashboardTab) => void;
  badges?: Partial<Record<ProjectDashboardTab, TabBadge>>;
};

export function ProjectDetailTabs({
  project,
  activeTab,
  onTabChange,
  badges,
}: ProjectDetailTabsProps) {
  const { t } = useI18n();
  const { modules } = useEnabledModules();
  const visibleTabs = getOrderedProjectDashboardTabs(project, modules);

  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-[var(--po-card-border)]/50"
      role="tablist"
      aria-label={t("projects.dashboard.tabs.label")}
    >
      {visibleTabs.map((tab) => {
        const badge = badges?.[tab];
        const isActive = activeTab === tab;
        const showCount = typeof badge?.count === "number" && badge.count > 0;
        const isOverdueBadge = tab === "tasks" && showCount;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab)}
            className={cn(
              "relative inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-[var(--po-primary)] font-medium text-[var(--po-text-primary)]"
                : "border-transparent text-[var(--po-text-muted)] hover:text-[var(--po-text-primary)]"
            )}
          >
            {t(`projects.dashboard.tab.${tab}`)}
            {showCount ? (
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isOverdueBadge
                    ? "font-semibold text-red-600 dark:text-red-400"
                    : "text-[var(--po-text-muted)]"
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
