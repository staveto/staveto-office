"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { IconSidebar } from "./sidebar/IconSidebar";
import { MobileSidebarNav } from "./sidebar/MobileSidebarNav";
import { SidebarFooter } from "./sidebar/SidebarFooter";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";

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
          <Link
            href="/app"
            onClick={onClose}
            className="flex items-center gap-2 text-white no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e06737]/60 rounded-md"
            aria-label={t("app.brand")}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e06737] text-xs font-bold">
              S
            </span>
            <span className="text-sm font-semibold tracking-tight">
              STAVETO<span className="text-[#e06737]">.</span>
            </span>
          </Link>
        </div>
        <MobileSidebarNav
          pathname={pathname}
          isPersonalWorkspace={isPersonalWorkspace}
          canManage={canManage}
          comingSoonLabel={comingSoonLabel}
          t={t}
          onNavigate={onClose}
          onLogout={handleLogout}
        />
        <SidebarFooter collapsed={false} showLayoutToggle={false} />
      </aside>
    );
  }

  return <IconSidebar onNavigate={onClose} />;
}
