"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { SidebarGroupButton } from "./SidebarGroupButton";
import { SidebarSubItem } from "./SidebarSubItem";
import {
  filterNavItems,
  isItemActive,
  type NavSectionConfig,
} from "@/lib/sidebarNavigation";
import {
  getEmailInboxBadgeForItem,
  useEmailInboxBadge,
} from "@/context/EmailInboxBadgeContext";

type SidebarSectionProps = {
  section: NavSectionConfig;
  sectionLabel: string;
  comingSoonLabel: string;
  t: (key: string) => string;
  pathname: string;
  search: string;
  isExpanded: boolean;
  isSectionActive: boolean;
  collapsed: boolean;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  isFieldWorker?: boolean;
  enabledModules?: import("@/lib/enabledModules").EnabledModulesMap | null;
  flatSingleLink?: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function SidebarSection({
  section,
  sectionLabel,
  comingSoonLabel,
  t,
  pathname,
  search,
  isExpanded,
  isSectionActive,
  collapsed,
  isPersonalWorkspace,
  canManage,
  isFieldWorker = false,
  enabledModules = null,
  flatSingleLink = false,
  onToggle,
  onNavigate,
  onLogout,
}: SidebarSectionProps) {
  const { unreadCount, visible: inboxBadgeVisible } = useEmailInboxBadge();
  const filterOpts = { isPersonalWorkspace, canManage, isFieldWorker, enabledModules };
  const items = filterNavItems(section.items, filterOpts);
  const Icon = section.icon;

  if (flatSingleLink) {
    const primary = items.find((item) => item.href && !item.comingSoon && !item.action);
    if (!primary?.href) return null;
    const active = isItemActive(pathname, primary, search);
    return (
      <div className="pb-0.5">
        <Link
          href={primary.href}
          onClick={() => onNavigate?.()}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/50",
            active
              ? "bg-white/12 text-white border-l-2 border-[#e06737] pl-[calc(0.75rem-2px)]"
              : "text-white/85 hover:bg-white/8 hover:text-white border-l-2 border-transparent"
          )}
          aria-current={active ? "page" : undefined}
        >
          <Icon className={cn("size-5 shrink-0", active ? "text-[#e06737]" : "text-white/60")} aria-hidden />
          <span className="truncate">{t(primary.labelKey)}</span>
        </Link>
      </div>
    );
  }

  const showSubitems = !collapsed && isExpanded && items.length > 0;

  return (
    <div className="border-b border-white/8 last:border-b-0 pb-1 mb-1">
      <SidebarGroupButton
        label={sectionLabel}
        icon={section.icon}
        isExpanded={isExpanded}
        isSectionActive={isSectionActive}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {showSubitems ? (
        <ul className="mt-0.5 space-y-0.5 pb-1 pl-1" role="list">
          {items.map((item) => (
            <SidebarSubItem
              key={item.id}
              item={item}
              label={t(item.labelKey)}
              comingSoonLabel={comingSoonLabel}
              isActive={isItemActive(pathname, item, search)}
              badgeCount={getEmailInboxBadgeForItem(item.id, unreadCount, inboxBadgeVisible)}
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
