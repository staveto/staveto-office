"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { useSidebarLayout } from "@/context/SidebarLayoutContext";
import {
  SIDEBAR_NAV_SECTIONS,
  filterNavSections,
  getActiveSectionId,
  isItemActive,
} from "@/lib/sidebarNavigation";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import { IconSidebarItem } from "./IconSidebarItem";
import { ExpandedSidebarNav } from "./ExpandedSidebarNav";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarExpandButton } from "./SidebarExpandButton";

type IconSidebarProps = {
  onNavigate?: () => void;
};

export function IconSidebar({ onNavigate }: IconSidebarProps) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { t } = useI18n();
  const { expanded } = useSidebarLayout();

  const activeSectionId = getActiveSectionId(pathname);
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
        <Link
          href="/app"
          onClick={onNavigate}
          className={cn(
            "flex min-w-0 items-center text-white no-underline transition-transform duration-200 hover:scale-[1.02]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#132743]",
            expanded ? "flex-1 gap-2 rounded-md" : "size-9 justify-center rounded-lg bg-[#e06737] text-xs font-bold"
          )}
          aria-label={t("app.brand")}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg bg-[#e06737] font-bold text-white",
              expanded ? "size-8 text-xs" : "size-full text-xs"
            )}
          >
            S
          </span>
          {expanded ? (
            <span className="truncate text-sm font-semibold tracking-tight">
              STAVETO<span className="text-[#e06737]">.</span>
            </span>
          ) : null}
        </Link>
        <SidebarExpandButton collapsed={!expanded} variant="icon" />
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {expanded ? (
          <div className="flex h-full min-h-0 flex-col">
            <ExpandedSidebarNav
            pathname={pathname}
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
                isItemActive(pathname, item)
              );
              const isOpen = openSectionId === section.id;

              return (
                <IconSidebarItem
                  key={section.id}
                  section={section}
                  sectionLabel={t(section.labelKey)}
                  pathname={pathname}
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
