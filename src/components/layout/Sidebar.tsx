"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Users,
  CreditCard,
  Settings,
  HelpCircle,
  Globe,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useI18n } from "@/i18n/I18nContext";

const WORK_ITEMS = [
  { href: "/app", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/app/projects", labelKey: "nav.projects", icon: FolderKanban },
  { href: "/estimates", labelKey: "nav.estimates", icon: FileText },
];

const TEAM_ITEMS = [
  { href: "/app/members", labelKey: "nav.members", icon: Users },
  { href: "/app/billing", labelKey: "nav.billing", icon: CreditCard },
];

const SYSTEM_ITEMS = [
  { href: "/app/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/app/help", labelKey: "nav.help", icon: HelpCircle },
];

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

function NavSection({
  title,
  items,
  pathname,
  onClose,
  collapsed,
  t,
}: {
  title: string;
  items: { href: string; labelKey: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string;
  onClose?: () => void;
  collapsed: boolean;
  t: (k: string) => string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      {!collapsed && (
        <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wider text-white/60">
          {title}
        </p>
      )}
      <ul className="space-y-0.5" role="list">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/app" && pathname.startsWith(item.href + "/"));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#e06737] text-white"
                    : "text-white/90 hover:bg-white/10"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {!collapsed && <span>{t(item.labelKey)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Sidebar({ collapsed = false, onClose, isMobile = false }: SidebarProps) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { activeWorkspace, memberRole } = useWorkspace();
  const { t, locale, setLocale } = useI18n();

  const showTeamSection =
    activeWorkspace?.type === "team" && memberRole === "admin";

  const systemItems = [
    ...SYSTEM_ITEMS.slice(0, 1),
    ...(activeWorkspace?.type === "personal" ? [{ href: "/subscription", labelKey: "nav.subscription", icon: CreditCard }] : []),
    ...SYSTEM_ITEMS.slice(1),
  ];

  const handleLogout = async () => {
    await logout();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  return (
    <aside
      className={cn(
        "flex flex-col bg-[#1D376A] text-white transition-all duration-200",
        collapsed ? "w-16" : "w-56",
        isMobile ? "fixed inset-y-0 left-0 z-50 w-56" : "sticky top-0 h-screen"
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-white/15 px-4">
        <Link
          href="/app"
          onClick={onClose}
          className="flex items-center gap-2 text-white no-underline"
          aria-label="Staveto"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded bg-[#e06737] text-xs font-bold text-white">
            S
          </span>
          {!collapsed && (
            <span className="font-semibold">
              STAVETO<span className="text-[#e06737]">.</span>
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        <NavSection
          title={t("sidebar.work")}
          items={WORK_ITEMS}
          pathname={pathname}
          onClose={onClose}
          collapsed={collapsed}
          t={t}
        />
        {showTeamSection && (
          <NavSection
            title={t("sidebar.team")}
            items={TEAM_ITEMS}
            pathname={pathname}
            onClose={onClose}
            collapsed={collapsed}
            t={t}
          />
        )}
        <NavSection
          title={t("sidebar.system")}
          items={systemItems}
          pathname={pathname}
          onClose={onClose}
          collapsed={collapsed}
          t={t}
        />
      </nav>

      {/* Footer */}
      <div className="border-t border-white/15 p-2 space-y-1">
        <div className="flex gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setLocale(locale === "sk" ? "en" : "sk")}
            className="flex items-center gap-2 text-sm text-white/80 hover:text-white"
            aria-label={locale === "sk" ? "Switch to English" : "Prepnúť na slovenčinu"}
          >
            <Globe className="size-4" aria-hidden />
            {!collapsed && (locale === "sk" ? "EN" : "SK")}
          </button>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
          aria-label={t("nav.logout")}
        >
          <LogOut className="size-4" aria-hidden />
          {!collapsed && t("nav.logout")}
        </button>
      </div>
    </aside>
  );
}
