"use client";

import { SidebarGroupButton } from "./SidebarGroupButton";
import { SidebarSubItem } from "./SidebarSubItem";
import {
  filterNavItems,
  isItemActive,
  type NavSectionConfig,
} from "@/lib/sidebarNavigation";

type SidebarSectionProps = {
  section: NavSectionConfig;
  sectionLabel: string;
  comingSoonLabel: string;
  t: (key: string) => string;
  pathname: string;
  isExpanded: boolean;
  isSectionActive: boolean;
  collapsed: boolean;
  isPersonalWorkspace: boolean;
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
  isExpanded,
  isSectionActive,
  collapsed,
  isPersonalWorkspace,
  onToggle,
  onNavigate,
  onLogout,
}: SidebarSectionProps) {
  const items = filterNavItems(section.items, { isPersonalWorkspace });
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
        <ul className="mt-0.5 space-y-0.5 pb-1" role="list">
          {items.map((item) => (
            <SidebarSubItem
              key={item.id}
              item={item}
              label={t(item.labelKey)}
              comingSoonLabel={comingSoonLabel}
              isActive={isItemActive(pathname, item)}
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
