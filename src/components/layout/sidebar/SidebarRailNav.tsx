"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActiveSectionId,
  getNavSectionLabelKey,
  isItemActive,
  type NavSectionConfig,
} from "@/lib/sidebarNavigation";
import { useEmailInboxBadge } from "@/context/EmailInboxBadgeContext";
import { SidebarRailIcon } from "./SidebarRailIcon";
import { SidebarRailPanel } from "./SidebarRailPanel";
import styles from "./sidebarRail.module.css";

const CLOSE_DELAY_MS = 140;

type SidebarRailNavProps = {
  sections: NavSectionConfig[];
  pathname: string;
  search: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  isFieldWorker?: boolean;
  enabledModules?: import("@/lib/enabledModules").EnabledModulesMap | null;
  comingSoonLabel: string;
  t: (key: string) => string;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function SidebarRailNav({
  sections,
  pathname,
  search,
  isPersonalWorkspace,
  canManage,
  isFieldWorker = false,
  enabledModules = null,
  comingSoonLabel,
  t,
  onNavigate,
  onLogout,
}: SidebarRailNavProps) {
  const activeSectionId = getActiveSectionId(pathname, sections, search);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { unreadCount, visible: inboxBadgeVisible } = useEmailInboxBadge();

  const openSection = hoveredId
    ? sections.find((s) => s.id === hoveredId) ?? null
    : null;

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setHoveredId(null), CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const handleHover = useCallback(
    (sectionId: string) => {
      clearCloseTimer();
      setHoveredId(sectionId);
    },
    [clearCloseTimer]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHoveredId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const panelLabel = openSection
    ? t(getNavSectionLabelKey(openSection, isPersonalWorkspace, isFieldWorker))
    : "";

  return (
    <div
      className={styles.railShell}
      onMouseLeave={scheduleClose}
      onMouseEnter={clearCloseTimer}
    >
      <nav className={styles.iconRail} aria-label={t("sidebar.ariaLabel")}>
        {sections.map((section) => {
          const isSectionActive =
            activeSectionId === section.id ||
            section.items.some((item) => isItemActive(pathname, item, search));
          const isHovered = hoveredId === section.id;
          const showJobsBadge =
            inboxBadgeVisible && section.id === "jobs" && unreadCount > 0;

          return (
            <SidebarRailIcon
              key={section.id}
              section={section}
              sectionLabel={t(
                getNavSectionLabelKey(section, isPersonalWorkspace, isFieldWorker)
              )}
              isActive={isSectionActive}
              isHovered={isHovered}
              showBadge={showJobsBadge}
              isPersonalWorkspace={isPersonalWorkspace}
              canManage={canManage}
              isFieldWorker={isFieldWorker}
              enabledModules={enabledModules}
              onHover={() => handleHover(section.id)}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>

      <SidebarRailPanel
        panelId="sidebar-rail-detail"
        section={openSection}
        sectionLabel={panelLabel}
        visible={!!openSection}
        pathname={pathname}
        search={search}
        comingSoonLabel={comingSoonLabel}
        isPersonalWorkspace={isPersonalWorkspace}
        canManage={canManage}
        isFieldWorker={isFieldWorker}
        enabledModules={enabledModules}
        t={t}
        onNavigate={() => {
          setHoveredId(null);
          onNavigate?.();
        }}
        onLogout={onLogout}
      />
    </div>
  );
}
