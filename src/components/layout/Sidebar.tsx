"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { IconSidebar } from "./sidebar/IconSidebar";
import { MobileSidebarNav } from "./sidebar/MobileSidebarNav";
import { SidebarFooter } from "./sidebar/SidebarFooter";
import { SidebarBrand } from "./sidebar/SidebarBrand";
import { ActiveCompanyContextSelector } from "./ActiveCompanyContextSelector";
import { UserProfileMenu } from "./UserProfileMenu";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import { useEnabledModules } from "@/context/EnabledModulesContext";

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ onClose, isMobile = false }: SidebarProps) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { t } = useI18n();

  const isPersonalWorkspace = activeWorkspace?.type === "personal";
  const canManage = canManageCompanyOperations(activeWorkspace?.role);
  const { modules: enabledModules } = useEnabledModules();
  const comingSoonLabel = t("sidebar.comingSoon");

  const handleLogout = async () => {
    await logout();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  if (isMobile) {
    return (
      <aside
        className={cn(
          "flex h-full w-72 max-w-[85vw] flex-col bg-[#132743] text-white",
          "shadow-2xl"
        )}
        role="navigation"
        aria-label={t("sidebar.ariaLabel")}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4">
          <SidebarBrand expanded onNavigate={onClose} />
        </div>
        <ActiveCompanyContextSelector variant="drawer" />
        <MobileSidebarNav
          pathname={pathname}
          isPersonalWorkspace={isPersonalWorkspace}
          canManage={canManage}
          enabledModules={isPersonalWorkspace ? null : enabledModules}
          comingSoonLabel={comingSoonLabel}
          t={t}
          onNavigate={onClose}
          onLogout={handleLogout}
        />
        <UserProfileMenu variant="drawer" onNavigate={onClose} />
        <SidebarFooter collapsed={false} showLayoutToggle={false} />
      </aside>
    );
  }

  return <IconSidebar onNavigate={onClose} />;
}
