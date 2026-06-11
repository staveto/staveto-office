"use client";

import { Button } from "@/components/ui/button";
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

type ProjectDetailTabsProps = {
  activeTab: ProjectDashboardTab;
  onTabChange: (tab: ProjectDashboardTab) => void;
};

export function ProjectDetailTabs({ activeTab, onTabChange }: ProjectDetailTabsProps) {
  const { t } = useI18n();

  return (
    <div
      className="flex flex-wrap gap-1 border-b border-border pb-0"
      role="tablist"
      aria-label={t("projects.dashboard.tabs.label")}
    >
      {TABS.map((tab) => (
        <Button
          key={tab}
          type="button"
          variant="ghost"
          size="sm"
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => onTabChange(tab)}
          className={cn(
            "rounded-b-none border-b-2 border-transparent px-4",
            activeTab === tab && "border-[#1D376A] bg-[#1D376A]/5 text-[#1D376A] font-medium"
          )}
        >
          {t(`projects.dashboard.tab.${tab}`)}
        </Button>
      ))}
    </div>
  );
}
