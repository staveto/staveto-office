import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Wallet,
  Settings,
} from "lucide-react";

export type NavItemConfig = {
  id: string;
  labelKey: string;
  href?: string;
  comingSoon?: boolean;
  personalOnly?: boolean;
  companyOnly?: boolean;
  managementOnly?: boolean;
  action?: "locale" | "logout";
};

export type NavSectionConfig = {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  defaultHref?: string;
  managementOnly?: boolean;
  items: NavItemConfig[];
};

/** Live features — flat, no “coming soon” noise in main nav. */
export const SIDEBAR_NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: "overview",
    labelKey: "sidebar.primary.overview",
    icon: LayoutDashboard,
    defaultHref: "/app",
    items: [{ id: "overview", labelKey: "sidebar.primary.overview", href: "/app" }],
  },
  {
    id: "jobs",
    labelKey: "sidebar.primary.jobs",
    icon: FolderKanban,
    defaultHref: "/app/projects",
    items: [{ id: "jobs", labelKey: "sidebar.primary.jobs", href: "/app/projects" }],
  },
  {
    id: "quotes",
    labelKey: "sidebar.primary.quotes",
    icon: Wallet,
    defaultHref: "/app/quotes",
    managementOnly: true,
    items: [
      {
        id: "quotes",
        labelKey: "sidebar.primary.quotes",
        href: "/app/quotes",
        managementOnly: true,
      },
    ],
  },
  {
    id: "team",
    labelKey: "sidebar.primary.team",
    icon: Users,
    defaultHref: "/app/members",
    managementOnly: true,
    items: [
      {
        id: "team",
        labelKey: "sidebar.primary.team",
        href: "/app/members",
        managementOnly: true,
      },
    ],
  },
  {
    id: "settings",
    labelKey: "sidebar.primary.settings",
    icon: Settings,
    defaultHref: "/app/settings",
    items: [
      { id: "settings", labelKey: "sidebar.primary.settings", href: "/app/settings" },
      {
        id: "more-billing",
        labelKey: "sidebar.item.more.billing",
        href: "/app/billing",
        companyOnly: true,
        managementOnly: true,
      },
      {
        id: "more-subscription",
        labelKey: "sidebar.item.more.subscription",
        href: "/subscription",
        personalOnly: true,
      },
      { id: "more-help", labelKey: "sidebar.item.more.help", href: "/app/help" },
      { id: "more-logout", labelKey: "nav.logout", action: "logout" },
    ],
  },
];

/** Quiet “Demnächst” items — shown muted at the bottom, no loud badges. */
export const SIDEBAR_LATER_ITEMS: NavItemConfig[] = [
  { id: "later-customers", labelKey: "sidebar.primary.customers", comingSoon: true },
  { id: "later-documents", labelKey: "sidebar.primary.documents", comingSoon: true },
  { id: "later-expenses", labelKey: "sidebar.primary.expenses", comingSoon: true },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === "/app";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveSectionId(
  pathname: string,
  sections: NavSectionConfig[] = SIDEBAR_NAV_SECTIONS
): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.href && !item.comingSoon && isNavItemActive(pathname, item.href)) {
        return section.id;
      }
    }
  }
  return null;
}

export function isItemActive(pathname: string, item: NavItemConfig): boolean {
  if (!item.href || item.comingSoon) return false;
  return isNavItemActive(pathname, item.href);
}

export function filterNavItems(
  items: NavItemConfig[],
  options: { isPersonalWorkspace: boolean; canManage?: boolean }
): NavItemConfig[] {
  const isCompany = !options.isPersonalWorkspace;
  const canManage = options.canManage ?? true;
  return items.filter((item) => {
    if (item.action === "locale") return false;
    if (item.personalOnly && !options.isPersonalWorkspace) return false;
    if (item.companyOnly && !isCompany) return false;
    if (item.managementOnly && !canManage) return false;
    return true;
  });
}

export function filterNavSections(
  sections: NavSectionConfig[],
  options: { isPersonalWorkspace: boolean; canManage?: boolean }
): NavSectionConfig[] {
  const canManage = options.canManage ?? true;
  return sections
    .filter((section) => !section.managementOnly || canManage)
    .map((section) => ({
      ...section,
      items: filterNavItems(section.items, options),
    }))
    .filter((section) => section.items.length > 0);
}

/** Single primary link sections skip the flyout in collapsed sidebar. */
export function sectionHasFlyout(
  section: NavSectionConfig,
  options: { isPersonalWorkspace: boolean; canManage?: boolean }
): boolean {
  const items = filterNavItems(section.items, options);
  const linkItems = items.filter((item) => item.href && !item.comingSoon && !item.action);
  return linkItems.length > 1 || items.some((item) => item.action);
}
