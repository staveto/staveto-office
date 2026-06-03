"use client";

import { cn } from "@/lib/utils";
import {
  filterNavItems,
  isItemActive,
  type NavSectionConfig,
} from "@/lib/sidebarNavigation";
import { SidebarSubItem } from "./SidebarSubItem";

type SidebarFlyoutProps = {
  section: NavSectionConfig;
  sectionLabel: string;
  pathname: string;
  search: string;
  comingSoonLabel: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  visible: boolean;
  t: (key: string) => string;
  onNavigate?: () => void;
  onLogout?: () => void;
  id: string;
};

export function SidebarFlyout({
  section,
  sectionLabel,
  pathname,
  search,
  comingSoonLabel,
  isPersonalWorkspace,
  canManage,
  visible,
  t,
  onNavigate,
  onLogout,
  id,
}: SidebarFlyoutProps) {
  const items = filterNavItems(section.items, { isPersonalWorkspace, canManage });

  return (
    <div
      id={id}
      role="region"
      aria-label={sectionLabel}
      className={cn(
        "pointer-events-none absolute left-full top-0 z-50 flex pl-2",
        "transition-all duration-200 ease-out",
        visible
          ? "pointer-events-auto translate-x-0 opacity-100"
          : "-translate-x-1 opacity-0"
      )}
    >
      <div
        className={cn(
          "min-w-[13.5rem] rounded-xl border border-white/10 bg-white py-2 shadow-xl shadow-black/20",
          "ring-1 ring-black/5"
        )}
      >
        <p className="px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-[#1D376A]/70">
          {sectionLabel}
        </p>
        <ul className="space-y-0.5 px-1.5" role="list">
          {items.map((item) => (
            <SidebarSubItem
              key={item.id}
              item={item}
              label={t(item.labelKey)}
              comingSoonLabel={comingSoonLabel}
              isActive={isItemActive(pathname, item, search)}
              variant="flyout"
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
