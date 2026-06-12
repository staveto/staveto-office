"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { shouldShowWorkerDashboard } from "@/lib/workspaceProduct";
import { ActiveCompanyContextSelector } from "./ActiveCompanyContextSelector";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { ThemeToggle } from "./ThemeToggle";
import { UserProfileMenu } from "./UserProfileMenu";

const PAGE_TITLES: Record<string, string> = {
  "/": "nav.overview",
  "/app": "dashboard.title",
  "/app/quotes": "nav.quotes",
  "/app/projects/new": "projects.new.title",
  "/app/projects": "nav.projects",
  "/app/members": "nav.members",
  "/app/planning": "planning.title",
  "/app/materials": "materials.overview.title",
  "/app/expenses": "expenses.title",
  "/app/expenses/new": "expenses.new",
  "/app/attendance": "attendance.title",
  "/app/operations": "operations.title",
  "/app/equipment": "equipment.title",
  "/app/billing": "nav.billing",
  "/app/settings": "nav.settings",
  "/app/help": "nav.help",
  "/estimates": "nav.estimates",
  "/subscription": "nav.subscription",
};

function getPageTitle(pathname: string): string {
  for (const [path, key] of Object.entries(PAGE_TITLES)) {
    if (pathname === path || (path !== "/" && path !== "/app" && pathname.startsWith(path))) {
      return key;
    }
  }
  return "nav.overview";
}

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen?: boolean;
}

export function Header({ onMenuClick, sidebarOpen = false }: HeaderProps) {
  const pathname = usePathname();
  const { activeWorkspace } = useWorkspace();
  const { t } = useI18n();

  let pageTitleKey = getPageTitle(pathname);
  if (activeWorkspace) {
    if (pathname === "/app") {
      if (isCompanyWorkspaceType(activeWorkspace.type)) {
        pageTitleKey = shouldShowWorkerDashboard(activeWorkspace.role)
          ? "dashboard.titleWorker"
          : "dashboard.title";
      } else {
        pageTitleKey = "dashboard.titlePersonal";
      }
    } else if (
      pathname === "/app/projects" ||
      pathname.startsWith("/app/projects/")
    ) {
      pageTitleKey = isCompanyWorkspaceType(activeWorkspace.type)
        ? "nav.projects"
        : "nav.projectsPersonal";
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-black/5 md:hidden"
          aria-label={sidebarOpen ? t("header.closeMenu") : t("header.openMenu")}
          aria-expanded={sidebarOpen}
        >
          <Menu className="size-5" />
        </button>
        <h1 className="truncate text-base font-medium text-foreground">
          {t(pageTitleKey)}
        </h1>
      </div>

      <div className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <NotificationsDropdown />
        <ActiveCompanyContextSelector />
        <UserProfileMenu />
      </div>
    </header>
  );
}
