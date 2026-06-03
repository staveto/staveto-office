"use client";

import { useI18n } from "@/i18n/I18nContext";
import styles from "./planning.module.css";

export type PlanningTabId = "today" | "week" | "month" | "team";

const TABS: PlanningTabId[] = ["today", "week", "month", "team"];

type PlanningTabsProps = {
  activeTab: PlanningTabId;
  onTabChange: (tab: PlanningTabId) => void;
};

export function PlanningTabs({ activeTab, onTabChange }: PlanningTabsProps) {
  const { t } = useI18n();

  return (
    <div
      role="tablist"
      aria-label={t("planning.tabs.ariaLabel")}
      className={styles.tabList}
    >
      {TABS.map((tab) => {
        const selected = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`planning-tab-${tab}`}
            aria-selected={selected}
            aria-controls={`planning-panel-${tab}`}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tabButton} ${selected ? styles.tabButtonActive : ""}`}
            onClick={() => onTabChange(tab)}
          >
            {t(`planning.tabs.${tab}`)}
          </button>
        );
      })}
    </div>
  );
}
