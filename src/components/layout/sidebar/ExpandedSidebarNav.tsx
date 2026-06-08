"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SIDEBAR_NAV_SECTIONS,
  SIDEBAR_LATER_ITEMS,
  filterNavSections,
  filterNavItems,
  getActiveSectionId,
  getNavSectionLabelKey,
  isItemActive,
  sectionShowsSubnav,
} from "@/lib/sidebarNavigation";
import { SidebarSection } from "./SidebarSection";
import { SidebarSubItem } from "./SidebarSubItem";

type ExpandedSidebarNavProps = {
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

export function ExpandedSidebarNav({
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
}: ExpandedSidebarNavProps) {
  const filterOpts = { isPersonalWorkspace, canManage, isFieldWorker, enabledModules };
  const sections = filterNavSections(SIDEBAR_NAV_SECTIONS, filterOpts);
  const activeSectionId = getActiveSectionId(pathname, SIDEBAR_NAV_SECTIONS, search);

  const defaultExpanded = useMemo(() => {
    const ids = new Set<string>();
    for (const section of sections) {
      if (sectionShowsSubnav(section, filterOpts)) ids.add(section.id);
    }
    if (activeSectionId) ids.add(activeSectionId);
    return ids;
  }, [sections, activeSectionId, isPersonalWorkspace, canManage, enabledModules]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(defaultExpanded);

  useEffect(() => {
    if (activeSectionId) {
      setExpandedIds((prev) => new Set([...prev, activeSectionId]));
    }
  }, [activeSectionId]);

  const toggleSection = (sectionId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <nav className="flex flex-col px-2 py-3 min-h-0" aria-label={t("sidebar.ariaLabel")}>
      <div className="space-y-1">
        {sections.map((section) => {
          const items = filterNavItems(section.items, filterOpts);
          const isSectionActive =
            activeSectionId === section.id ||
            items.some((item) => isItemActive(pathname, item, search));

          if (!sectionShowsSubnav(section, filterOpts)) {
            const primary = items.find((item) => item.href && !item.comingSoon && !item.action);
            if (!primary?.href) return null;
            return (
              <SidebarSection
                key={section.id}
                section={section}
                sectionLabel={t(getNavSectionLabelKey(section, isPersonalWorkspace, isFieldWorker))}
                comingSoonLabel={comingSoonLabel}
                t={t}
                pathname={pathname}
                search={search}
                isExpanded={false}
                isSectionActive={isSectionActive}
                collapsed={false}
                isPersonalWorkspace={isPersonalWorkspace}
                canManage={canManage}
                isFieldWorker={isFieldWorker}
                enabledModules={enabledModules}
                flatSingleLink
                onToggle={() => undefined}
                onNavigate={onNavigate}
                onLogout={onLogout}
              />
            );
          }

          return (
            <SidebarSection
              key={section.id}
              section={section}
              sectionLabel={t(getNavSectionLabelKey(section, isPersonalWorkspace, isFieldWorker))}
              comingSoonLabel={comingSoonLabel}
              t={t}
              pathname={pathname}
              search={search}
              isExpanded={expandedIds.has(section.id)}
              isSectionActive={isSectionActive}
              collapsed={false}
              isPersonalWorkspace={isPersonalWorkspace}
              canManage={canManage}
              isFieldWorker={isFieldWorker}
              enabledModules={enabledModules}
              onToggle={() => toggleSection(section.id)}
              onNavigate={onNavigate}
              onLogout={onLogout}
            />
          );
        })}
      </div>

      {!isFieldWorker ? (
      <div className="mt-auto pt-4 border-t border-white/10">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
          {t("sidebar.laterSection")}
        </p>
        <ul className="space-y-0.5" role="list">
          {filterNavItems(SIDEBAR_LATER_ITEMS, filterOpts).map((item) => (
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
      ) : null}
    </nav>
  );
}
