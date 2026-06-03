"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { useSidebarLayout } from "@/context/SidebarLayoutContext";
import {
  SIDEBAR_NAV_SECTIONS,
  filterNavSections,
  getActiveSectionId,
  getNavSectionLabelKey,
  isItemActive,
} from "@/lib/sidebarNavigation";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import { IconSidebarItem } from "./IconSidebarItem";
import { ExpandedSidebarNav } from "./ExpandedSidebarNav";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarExpandButton } from "./SidebarExpandButton";
import { SidebarBrand } from "./SidebarBrand";

type IconSidebarProps = {
  onNavigate?: () => void;
};

export function IconSidebar({ onNavigate }: IconSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const { logout } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { t } = useI18n();
  const { expanded } = useSidebarLayout();

  const activeSectionId = getActiveSectionId(pathname, SIDEBAR_NAV_SECTIONS, search);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);

  const isPersonalWorkspace = activeWorkspace?.type === "personal";
  const canManage = canManageCompanyOperations(activeWorkspace?.role);
  const navSections = filterNavSections(SIDEBAR_NAV_SECTIONS, {
    isPersonalWorkspace,
    canManage,
  });
  const comingSoonLabel = t("sidebar.comingSoon");

  const handleOpen = useCallback(
    (sectionId: string) => {
      if (!expanded) setOpenSectionId(sectionId);
    },
    [expanded]
  );

  const handleClose = useCallback(() => {
    setOpenSectionId(null);
  }, []);

  useEffect(() => {
    if (expanded) setOpenSectionId(null);
  }, [expanded]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSectionId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleLogout = async () => {
    await logout();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full w-full min-w-0 flex-col",
        "border-r border-white/[0.08] bg-[#132743] text-white"
      )}
      role="navigation"
      aria-label={t("sidebar.ariaLabel")}
      data-expanded={expanded ? "true" : "false"}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-white/10",
          expanded ? "gap-2 px-3" : "justify-between px-2"
        )}
      >
        <SidebarBrand expanded={expanded} onNavigate={onNavigate} />
        <SidebarExpandButton collapsed={!expanded} variant="icon" />
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {expanded ? (
          <div className="flex h-full min-h-0 flex-col">
            <ExpandedSidebarNav
            pathname={pathname}
            search={search}
            isPersonalWorkspace={isPersonalWorkspace}
            canManage={canManage}
            comingSoonLabel={comingSoonLabel}
            t={t}
            onNavigate={onNavigate}
            onLogout={handleLogout}
          />
          </div>
        ) : (
          <div className="flex flex-col gap-1 overflow-visible py-3">
            {navSections.map((section) => {
              const isSectionActive = section.items.some((item) =>
                isItemActive(pathname, item, search)
              );
              const isOpen = openSectionId === section.id;

              return (
                <IconSidebarItem
                  key={section.id}
                  section={section}
                  sectionLabel={t(getNavSectionLabelKey(section, isPersonalWorkspace))}
                  pathname={pathname}
                  search={search}
                  comingSoonLabel={comingSoonLabel}
                  isPersonalWorkspace={isPersonalWorkspace}
                  canManage={canManage}
                  isSectionActive={isSectionActive || activeSectionId === section.id}
                  isOpen={isOpen}
                  t={t}
                  onOpen={() => handleOpen(section.id)}
                  onClose={handleClose}
                  onNavigate={onNavigate}
                  onLogout={handleLogout}
                />
              );
            })}
          </div>
        )}
      </div>

      <SidebarFooter collapsed={!expanded} />
    </aside>
  );
}
