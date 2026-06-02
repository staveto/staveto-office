"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_NAV_SECTIONS,
  SIDEBAR_LATER_ITEMS,
  filterNavSections,
  filterNavItems,
  isItemActive,
} from "@/lib/sidebarNavigation";
import { SidebarSubItem } from "./SidebarSubItem";

type MobileSidebarNavProps = {
  pathname: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  comingSoonLabel: string;
  t: (key: string) => string;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function MobileSidebarNav({
  pathname,
  isPersonalWorkspace,
  canManage,
  comingSoonLabel,
  t,
  onNavigate,
  onLogout,
}: MobileSidebarNavProps) {
  const filterOpts = { isPersonalWorkspace, canManage };
  const sections = filterNavSections(SIDEBAR_NAV_SECTIONS, filterOpts);

  return (
    <nav className="flex flex-col flex-1 overflow-y-auto px-3 py-3" aria-label={t("sidebar.ariaLabel")}>
      <ul className="space-y-0.5" role="list">
        {sections.flatMap((section) => {
          const items = filterNavItems(section.items, filterOpts);
          const primary = items.find((item) => item.href && !item.comingSoon && !item.action);

          if (primary?.href && items.filter((i) => i.href && !i.comingSoon).length === 1) {
            const active = isItemActive(pathname, primary);
            return (
              <li key={section.id}>
                <Link
                  href={primary.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center rounded-xl px-3 py-3 text-[15px] font-medium transition-colors min-h-[48px]",
                    active
                      ? "bg-white/12 text-white border-l-2 border-[#e06737]"
                      : "text-white/85 hover:bg-white/8"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {t(primary.labelKey)}
                </Link>
              </li>
            );
          }

          return items.map((item) => (
            <SidebarSubItem
              key={item.id}
              item={item}
              label={t(item.labelKey)}
              comingSoonLabel={comingSoonLabel}
              isActive={isItemActive(pathname, item)}
              variant="inline"
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          ));
        })}
      </ul>

      <div className="mt-4 pt-4 border-t border-white/10">
        <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
          {t("sidebar.laterSection")}
        </p>
        <ul className="space-y-0.5" role="list">
          {SIDEBAR_LATER_ITEMS.map((item) => (
            <SidebarSubItem
              key={item.id}
              item={item}
              label={t(item.labelKey)}
              comingSoonLabel={comingSoonLabel}
              isActive={false}
              variant="inline"
              quietComingSoon
            />
          ))}
        </ul>
      </div>
    </nav>
  );
}
