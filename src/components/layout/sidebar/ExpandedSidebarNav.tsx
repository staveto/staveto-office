"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_NAV_SECTIONS,
  SIDEBAR_LATER_ITEMS,
  filterNavSections,
  isItemActive,
  filterNavItems,
} from "@/lib/sidebarNavigation";
import { SidebarSubItem } from "./SidebarSubItem";

type ExpandedSidebarNavProps = {
  pathname: string;
  isPersonalWorkspace: boolean;
  canManage: boolean;
  comingSoonLabel: string;
  t: (key: string) => string;
  onNavigate?: () => void;
  onLogout?: () => void;
};

export function ExpandedSidebarNav({
  pathname,
  isPersonalWorkspace,
  canManage,
  comingSoonLabel,
  t,
  onNavigate,
  onLogout,
}: ExpandedSidebarNavProps) {
  const filterOpts = { isPersonalWorkspace, canManage };
  const sections = filterNavSections(SIDEBAR_NAV_SECTIONS, filterOpts);

  return (
    <nav className="flex flex-col px-2 py-3 min-h-0" aria-label={t("sidebar.ariaLabel")}>
      <ul className="space-y-0.5" role="list">
        {sections.flatMap((section) => {
          const items = filterNavItems(section.items, filterOpts);
          const Icon = section.icon;
          const primary = items.find((item) => item.href && !item.comingSoon && !item.action);

          if (primary?.href && items.filter((i) => i.href && !i.comingSoon).length === 1) {
            const active = isItemActive(pathname, primary);
            return (
              <li key={section.id}>
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

      <div className="mt-auto pt-4 border-t border-white/10">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
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
