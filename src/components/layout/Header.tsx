"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, ChevronDown, User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";
import { isCompanyWorkspaceType } from "@/types/workspace";

const PAGE_TITLES: Record<string, string> = {
  "/": "nav.overview",
  "/app": "dashboard.title",
  "/app/quotes": "nav.quotes",
  "/app/projects/new": "projects.new.title",
  "/app/projects": "nav.projects",
  "/app/members": "nav.members",
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
  const { user, logout } = useAuth();
  const { activeWorkspace, workspaces, setActiveWorkspace } = useWorkspace();
  const { t } = useI18n();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  let pageTitleKey = getPageTitle(pathname);
  if (activeWorkspace) {
    if (pathname === "/app") {
      pageTitleKey = isCompanyWorkspaceType(activeWorkspace.type)
        ? "dashboard.title"
        : "dashboard.titlePersonal";
    } else if (
      pathname === "/app/projects" ||
      pathname.startsWith("/app/projects/")
    ) {
      pageTitleKey = isCompanyWorkspaceType(activeWorkspace.type)
        ? "nav.projects"
        : "nav.projectsPersonal";
    }
  }
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        workspaceRef.current &&
        !workspaceRef.current.contains(e.target as Node)
      ) {
        setWorkspaceOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-[#f0f4f8] px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex size-9 items-center justify-center rounded-lg text-foreground hover:bg-black/5 md:hidden"
          aria-label={sidebarOpen ? t("header.closeMenu") : t("header.openMenu")}
          aria-expanded={sidebarOpen}
        >
          <Menu className="size-5" />
        </button>
        <h1 className="text-base font-medium text-foreground">
          {t(pageTitleKey)}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Workspace switcher */}
        <div className="relative" ref={workspaceRef}>
          <button
            type="button"
            onClick={() => setWorkspaceOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            aria-haspopup="listbox"
            aria-expanded={workspaceOpen}
            aria-label={t("header.switchWorkspace")}
          >
            <span>
              {activeWorkspace?.name === "Personal" || activeWorkspace?.id === "personal"
                ? t("workspace.personalShort")
                : (activeWorkspace?.name ?? t("workspace.personalShort"))}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
          {workspaceOpen && (
            <ul
              role="listbox"
              className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-background py-1 shadow-lg"
            >
              {workspaces.map((ws) => (
                <li key={ws.id} role="option">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveWorkspace(ws);
                      setWorkspaceOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm",
                      activeWorkspace?.id === ws.id
                        ? "bg-primary/10 font-medium text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    {ws.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex size-9 items-center justify-center rounded-full bg-[#1D376A] text-sm font-medium text-white"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-label={t("header.userMenu")}
          >
            {initials}
          </button>
          {userMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg"
            >
              <Link
                href="/app/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                role="menuitem"
              >
                <User className="size-4" />
                {t("header.profile")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                role="menuitem"
              >
                <LogOut className="size-4" />
                {t("nav.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
