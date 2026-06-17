"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { useSidebarLayout } from "@/context/SidebarLayoutContext";
import { SIDEBAR_NAV_SECTIONS, filterNavSections } from "@/lib/sidebarNavigation";
import { canManageCompanyOperations, shouldShowWorkerDashboard } from "@/lib/workspaceProduct";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { ExpandedSidebarNav } from "./ExpandedSidebarNav";
import { SidebarRailNav } from "./SidebarRailNav";
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

  const isPersonalWorkspace = activeWorkspace?.type === "personal";
  const canManage = canManageCompanyOperations(activeWorkspace?.role);
  const isFieldWorker =
    !isPersonalWorkspace && shouldShowWorkerDashboard(activeWorkspace?.role);
  const { modules: enabledModules } = useEnabledModules();
  const navFilterOpts = {
    isPersonalWorkspace,
    canManage,
    isFieldWorker,
    enabledModules: isPersonalWorkspace ? null : enabledModules,
  };
  const navSections = filterNavSections(SIDEBAR_NAV_SECTIONS, navFilterOpts);
  const comingSoonLabel = t("sidebar.comingSoon");

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
        "border-r border-white/[0.08] bg-[#132743] text-white",
        !expanded && "overflow-visible"
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

      <div
        className={cn(
          "min-h-0 flex-1",
          expanded ? "overflow-x-hidden overflow-y-auto" : "flex flex-col overflow-visible"
        )}
      >
        {expanded ? (
          <div className="flex h-full min-h-0 flex-col">
            <ExpandedSidebarNav
            pathname={pathname}
            search={search}
            isPersonalWorkspace={isPersonalWorkspace}
            canManage={canManage}
            isFieldWorker={isFieldWorker}
            enabledModules={isPersonalWorkspace ? null : enabledModules}
            comingSoonLabel={comingSoonLabel}
            t={t}
            onNavigate={onNavigate}
            onLogout={handleLogout}
          />
          </div>
        ) : (
          <SidebarRailNav
            sections={navSections}
            pathname={pathname}
            search={search}
            isPersonalWorkspace={isPersonalWorkspace}
            canManage={canManage}
            isFieldWorker={isFieldWorker}
            enabledModules={isPersonalWorkspace ? null : enabledModules}
            comingSoonLabel={comingSoonLabel}
            t={t}
            onNavigate={onNavigate}
            onLogout={handleLogout}
          />
        )}
      </div>

      <SidebarFooter collapsed={!expanded} />
    </aside>
  );
}
