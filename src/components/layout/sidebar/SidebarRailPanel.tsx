"use client";

import { cn } from "@/lib/utils";
import {
  filterNavItems,
  isItemActive,
  type NavSectionConfig,
} from "@/lib/sidebarNavigation";
import { SidebarSubItem } from "./SidebarSubItem";
import {
  getEmailInboxBadgeForItem,
  useEmailInboxBadge,
} from "@/context/EmailInboxBadgeContext";
import styles from "./sidebarRail.module.css";

type SidebarRailPanelProps = {
  section: NavSectionConfig | null;
  sectionLabel: string;
  visible: boolean;
  pathname: string;
  search: string;
  comingSoonLabel: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  isFieldWorker?: boolean;
  enabledModules?: import("@/lib/enabledModules").EnabledModulesMap | null;
  t: (key: string) => string;
  onNavigate?: () => void;
  onLogout?: () => void;
  panelId: string;
};

export function SidebarRailPanel({
  section,
  sectionLabel,
  visible,
  pathname,
  search,
  comingSoonLabel,
  isPersonalWorkspace,
  canManage,
  isFieldWorker = false,
  enabledModules = null,
  t,
  onNavigate,
  onLogout,
  panelId,
}: SidebarRailPanelProps) {
  const { unreadCount, visible: inboxBadgeVisible } = useEmailInboxBadge();

  if (!section) {
    return (
      <div
        id={panelId}
        className={cn(styles.detailPanel, visible && styles.detailPanelOpen)}
        aria-hidden
      />
    );
  }

  const items = filterNavItems(section.items, {
    isPersonalWorkspace,
    canManage,
    isFieldWorker,
    enabledModules,
  });

  return (
    <div
      id={panelId}
      role="region"
      aria-label={sectionLabel}
      aria-hidden={!visible}
      className={cn(styles.detailPanel, visible && styles.detailPanelOpen)}
    >
      <div className={styles.detailPanelInner}>
        <div className={styles.detailHead}>
          <h2 className={styles.detailTitle}>{sectionLabel}</h2>
        </div>
        <div className={styles.detailList}>
          <ul role="list">
            {items.map((item) => (
              <SidebarSubItem
                key={item.id}
                item={item}
                label={t(item.labelKey)}
                comingSoonLabel={comingSoonLabel}
                isActive={isItemActive(pathname, item, search)}
                variant="rail"
                badgeCount={getEmailInboxBadgeForItem(item.id, unreadCount, inboxBadgeVisible)}
                onNavigate={onNavigate}
                onLogout={onLogout}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
