import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  FileText,
  Grid3X3,
  Plug,
  ScrollText,
  Shield,
  User,
  Users,
} from "lucide-react";

export type SettingsNavItem = {
  id: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /** Owner/admin only */
  adminOnly?: boolean;
  /** Management roles (owner/admin/manager/accountant) */
  managementOnly?: boolean;
  comingSoon?: boolean;
};

export const SETTINGS_BACK_HREF = "/app";

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "profile", labelKey: "settings.nav.profile", href: "/app/settings", icon: User },
  {
    id: "company",
    labelKey: "settings.nav.company",
    href: "/app/settings/company",
    icon: Building2,
    managementOnly: true,
  },
  {
    id: "quote-settings",
    labelKey: "settings.nav.quoteSettings",
    href: "/app/settings/quotes",
    icon: FileText,
    adminOnly: true,
  },
  {
    id: "team",
    labelKey: "settings.nav.team",
    href: "/app/members",
    icon: Users,
    managementOnly: true,
  },
  {
    id: "billing",
    labelKey: "settings.nav.billing",
    href: "/app/billing",
    icon: CreditCard,
    adminOnly: true,
  },
  {
    id: "app-center",
    labelKey: "settings.nav.appCenter",
    href: "/app/settings/app-center",
    icon: Grid3X3,
    adminOnly: true,
  },
  {
    id: "security",
    labelKey: "settings.nav.security",
    href: "/app/settings/security",
    icon: Shield,
    adminOnly: true,
    comingSoon: true,
  },
  {
    id: "integrations",
    labelKey: "settings.nav.integrations",
    href: "/app/settings/app-center?category=communication",
    icon: Plug,
    adminOnly: true,
  },
  {
    id: "audit",
    labelKey: "settings.nav.auditLogs",
    href: "/app/settings/audit-logs",
    icon: ScrollText,
    adminOnly: true,
    comingSoon: true,
  },
];

const SETTINGS_PATH_PREFIXES = [
  "/app/settings",
  "/app/billing",
  "/app/members",
] as const;

/** True when the app shell should show the settings sidebar instead of the main sidebar. */
export function isSettingsAreaPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SETTINGS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isSettingsNavItemActive(pathname: string, href: string): boolean {
  if (href.includes("?")) {
    return pathname === href.split("?")[0];
  }
  if (href === "/app/settings") {
    return pathname === "/app/settings";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function filterSettingsNavItems(
  items: SettingsNavItem[],
  opts: {
    isCompany: boolean;
    isAdmin: boolean;
    canManage: boolean;
  }
): SettingsNavItem[] {
  return items.filter((item) => {
    if (item.adminOnly && !opts.isAdmin) return false;
    if (item.managementOnly && !opts.canManage && !opts.isAdmin) return false;
    if (item.id === "company" && !opts.isCompany) return false;
    if (item.id === "quote-settings" && !opts.isCompany) return false;
    if (item.id === "team" && !opts.isCompany) return false;
    if (item.id === "billing" && !opts.isCompany) return false;
    if (item.id === "app-center" && !opts.isCompany) return false;
    if (item.id === "integrations" && !opts.isCompany) return false;
    return true;
  });
}

export { ArrowLeft as SettingsBackIcon };
