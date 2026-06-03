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
  /** When in personal workspace (e.g. overview section). */
  personalLabelKey?: string;
  icon: LucideIcon;
  defaultHref?: string;
  managementOnly?: boolean;
  items: NavItemConfig[];
};

/** Main navigation — sections with sub-items (live routes + muted coming-soon). */
export const SIDEBAR_NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: "overview",
    labelKey: "sidebar.section.overview",
    personalLabelKey: "sidebar.section.personalOverview",
    icon: LayoutDashboard,
    defaultHref: "/app",
    items: [
      { id: "overview-dashboard", labelKey: "sidebar.item.overview.dashboard", href: "/app" },
      { id: "overview-activity", labelKey: "sidebar.item.overview.activity", comingSoon: true },
      { id: "overview-reports", labelKey: "sidebar.item.overview.reports", comingSoon: true },
    ],
  },
  {
    id: "jobs",
    labelKey: "sidebar.section.jobs",
    icon: FolderKanban,
    defaultHref: "/app/projects",
    items: [
      { id: "jobs-all", labelKey: "sidebar.item.jobs.all", href: "/app/projects" },
      {
        id: "jobs-concepts",
        labelKey: "sidebar.item.jobs.concepts",
        href: "/app/projects?filter=concepts",
      },
      {
        id: "jobs-active",
        labelKey: "sidebar.item.jobs.active",
        href: "/app/projects?filter=active",
      },
      { id: "jobs-new", labelKey: "sidebar.item.jobs.new", href: "/app/projects/new" },
      { id: "jobs-tasks", labelKey: "sidebar.item.jobs.tasks", comingSoon: true },
      { id: "jobs-issues", labelKey: "sidebar.item.jobs.issues", comingSoon: true },
      { id: "jobs-planning", labelKey: "sidebar.item.jobs.planning", href: "/app/planning" },
    ],
  },
  {
    id: "quotes",
    labelKey: "sidebar.section.finance",
    icon: Wallet,
    defaultHref: "/app/quotes",
    managementOnly: true,
    items: [
      {
        id: "finance-quotes",
        labelKey: "sidebar.item.finance.quotes",
        href: "/app/quotes",
        managementOnly: true,
      },
      {
        id: "finance-invoices",
        labelKey: "sidebar.item.finance.invoices",
        comingSoon: true,
        managementOnly: true,
      },
      {
        id: "finance-expenses",
        labelKey: "sidebar.item.finance.expenses",
        comingSoon: true,
        managementOnly: true,
      },
      {
        id: "finance-exports",
        labelKey: "sidebar.item.finance.exports",
        comingSoon: true,
        managementOnly: true,
      },
    ],
  },
  {
    id: "team",
    labelKey: "sidebar.section.team",
    icon: Users,
    defaultHref: "/app/members",
    managementOnly: true,
    items: [
      {
        id: "team-members",
        labelKey: "sidebar.item.team.members",
        href: "/app/members",
        managementOnly: true,
      },
      {
        id: "team-attendance",
        labelKey: "sidebar.item.team.attendance",
        comingSoon: true,
        managementOnly: true,
      },
      {
        id: "team-leave",
        labelKey: "sidebar.item.team.leave",
        comingSoon: true,
        managementOnly: true,
      },
      {
        id: "team-roles",
        labelKey: "sidebar.item.team.roles",
        comingSoon: true,
        managementOnly: true,
      },
    ],
  },
  {
    id: "settings",
    labelKey: "sidebar.section.more",
    icon: Settings,
    defaultHref: "/app/settings",
    items: [
      { id: "settings-main", labelKey: "sidebar.item.more.settings", href: "/app/settings" },
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

/** Quiet “Demnächst” items — documents & customers not yet in main modules. */
export const SIDEBAR_LATER_ITEMS: NavItemConfig[] = [
  { id: "later-customers", labelKey: "sidebar.item.more.customers", comingSoon: true },
  { id: "later-documents-all", labelKey: "sidebar.item.documents.all", comingSoon: true },
  { id: "later-documents-photos", labelKey: "sidebar.item.documents.photos", comingSoon: true },
  { id: "later-documents-contracts", labelKey: "sidebar.item.documents.contracts", comingSoon: true },
];

function parseHref(href: string): { path: string; query: URLSearchParams } {
  const [path, queryString] = href.split("?");
  return { path, query: new URLSearchParams(queryString ?? "") };
}

export function isNavItemActive(pathname: string, href: string, search = ""): boolean {
  const { path: hrefPath, query: hrefQuery } = parseHref(href);
  const currentQuery = new URLSearchParams(search.replace(/^\?/, ""));

  if (hrefPath === "/app") {
    return pathname === "/app" && [...hrefQuery.keys()].length === 0;
  }

  const pathMatch = pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
  if (!pathMatch) return false;

  if ([...hrefQuery.keys()].length > 0) {
    for (const [key, value] of hrefQuery.entries()) {
      if (currentQuery.get(key) !== value) return false;
    }
    return true;
  }

  if (hrefPath === "/app/projects" && pathname === "/app/projects") {
    return !currentQuery.has("filter");
  }

  return pathname === hrefPath;
}

export function getActiveSectionId(
  pathname: string,
  sections: NavSectionConfig[] = SIDEBAR_NAV_SECTIONS,
  search = ""
): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.href && !item.comingSoon && isNavItemActive(pathname, item.href, search)) {
        return section.id;
      }
    }
  }
  return null;
}

export function isItemActive(pathname: string, item: NavItemConfig, search = ""): boolean {
  if (!item.href || item.comingSoon) return false;
  return isNavItemActive(pathname, item.href, search);
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

/** Expanded sidebar: show nested items when section has sub-links or coming-soon rows. */
export function sectionShowsSubnav(
  section: NavSectionConfig,
  options: { isPersonalWorkspace: boolean; canManage?: boolean }
): boolean {
  return filterNavItems(section.items, options).length > 1;
}

export function getNavSectionLabelKey(
  section: NavSectionConfig,
  isPersonalWorkspace: boolean
): string {
  if (isPersonalWorkspace && section.personalLabelKey) {
    return section.personalLabelKey;
  }
  return section.labelKey;
}
