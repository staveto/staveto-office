"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NavSectionConfig } from "@/lib/sidebarNavigation";
import { sectionHasFlyout } from "@/lib/sidebarNavigation";
import { SidebarFlyout } from "./SidebarFlyout";
import { useEmailInboxBadge } from "@/context/EmailInboxBadgeContext";

type IconSidebarItemProps = {
  section: NavSectionConfig;
  sectionLabel: string;
  pathname: string;
  search: string;
  comingSoonLabel: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  isFieldWorker?: boolean;
  enabledModules?: import("@/lib/enabledModules").EnabledModulesMap | null;
  isSectionActive: boolean;
  isOpen: boolean;
  t: (key: string) => string;
  onOpen: () => void;
  onClose: () => void;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function IconSidebarItem({
  section,
  sectionLabel,
  pathname,
  search,
  comingSoonLabel,
  isPersonalWorkspace,
  canManage,
  isFieldWorker = false,
  enabledModules = null,
  isSectionActive,
  isOpen,
  t,
  onOpen,
  onClose,
  onNavigate,
  onLogout,
}: IconSidebarItemProps) {
  const Icon = section.icon;
  const { unreadCount, visible: inboxBadgeVisible } = useEmailInboxBadge();
  const showJobsInboxBadge =
    inboxBadgeVisible && section.id === "jobs" && unreadCount > 0;
  const flyoutId = `sidebar-flyout-${section.id}`;
  const filterOpts = { isPersonalWorkspace, canManage, isFieldWorker, enabledModules };
  const showFlyout = sectionHasFlyout(section, filterOpts);
  const hasDefaultRoute = !!section.defaultHref && !showFlyout;

  const iconClass = cn(
    "relative flex size-11 items-center justify-center rounded-xl transition-all duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#132743]",
    isSectionActive
      ? "bg-white/12 text-white before:absolute before:left-0 before:top-1/2 before:h-6 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[#e06737]"
      : "text-white/75 hover:bg-white/8 hover:text-white"
  );

  const handleMouseEnter = () => {
    if (showFlyout) onOpen();
  };
  const handleMouseLeave = () => {
    if (showFlyout) onClose();
  };
  const handleFocus = () => {
    if (showFlyout) onOpen();
  };
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      onClose();
    }
  };

  const handleMenuClick = () => {
    if (isOpen) onClose();
    else onOpen();
  };

  return (
    <div
      className="group/nav-item relative flex justify-center px-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {hasDefaultRoute ? (
        <Link
          href={section.defaultHref!}
          onClick={() => onNavigate?.()}
          className={iconClass}
          aria-label={sectionLabel}
          aria-current={isSectionActive ? "page" : undefined}
        >
          <Icon className="size-5" aria-hidden />
          {showJobsInboxBadge ? (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-[#e06737] ring-2 ring-[#132743]" aria-hidden />
          ) : null}
        </Link>
      ) : (
        <button
          type="button"
          className={iconClass}
          aria-label={sectionLabel}
          aria-haspopup="true"
          aria-expanded={isOpen}
          aria-controls={flyoutId}
          onClick={handleMenuClick}
        >
          <Icon className="size-5" aria-hidden />
          {showJobsInboxBadge ? (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-[#e06737] ring-2 ring-[#132743]" aria-hidden />
          ) : null}
        </button>
      )}

      {showFlyout ? (
        <SidebarFlyout
        id={flyoutId}
        section={section}
        sectionLabel={sectionLabel}
        pathname={pathname}
        search={search}
        comingSoonLabel={comingSoonLabel}
        isPersonalWorkspace={isPersonalWorkspace}
        canManage={canManage}
        isFieldWorker={isFieldWorker}
        enabledModules={enabledModules}
        visible={isOpen}
        t={t}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
      ) : null}
    </div>
  );
}
