import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Wallet,
  Settings,
  CalendarDays,
  Wrench,
  FileText,
  Package,
  KeyRound,
  BookOpen,
} from "lucide-react";
import type { EnabledModulesMap, ModuleKey } from "@/lib/enabledModules";
import { isModuleEnabled } from "@/lib/enabledModules";

export type NavItemConfig = {
  id: string;
  labelKey: string;
  href?: string;
  comingSoon?: boolean;
  personalOnly?: boolean;
  companyOnly?: boolean;
  managementOnly?: boolean;
  /** Hidden for field workers (worker / client / viewer). */
  hideForFieldWorker?: boolean;
  /** Shown only for field workers. */
  fieldWorkerOnly?: boolean;
  /** When set, item is hidden in company workspace if module is disabled. */
  moduleKey?: ModuleKey;
  /** Optional icon shown beside the label in flyout / expanded subnav. */
  icon?: LucideIcon;
  action?: "locale" | "logout";
};

export type NavSectionConfig = {
  id: string;
  labelKey: string;
  /** When in personal workspace (e.g. overview section). */
  personalLabelKey?: string;
  /** Overview section label when user is a field worker. */
  fieldWorkerLabelKey?: string;
  icon: LucideIcon;
  defaultHref?: string;
  managementOnly?: boolean;
  /** Hide entire section in company workspace when module disabled. */
  moduleKey?: ModuleKey;
  items: NavItemConfig[];
};

/** Main navigation — sections with sub-items (live routes + muted coming-soon). */
export const SIDEBAR_NAV_SECTIONS: NavSectionConfig[] = [
  {
    id: "overview",
    labelKey: "sidebar.section.overview",
    personalLabelKey: "sidebar.section.personalOverview",
    fieldWorkerLabelKey: "sidebar.section.workerOverview",
    icon: LayoutDashboard,
    defaultHref: "/app",
    items: [
      { id: "overview-dashboard", labelKey: "sidebar.item.overview.dashboard", href: "/app" },
      { id: "overview-activity", labelKey: "sidebar.item.overview.activity", comingSoon: true, hideForFieldWorker: true },
      { id: "overview-reports", labelKey: "sidebar.item.overview.reports", comingSoon: true, moduleKey: "reports", hideForFieldWorker: true },
    ],
  },
  {
    id: "jobs",
    labelKey: "sidebar.section.jobs",
    icon: FolderKanban,
    defaultHref: "/app/projects",
    moduleKey: "jobs",
    items: [
      { id: "jobs-all", labelKey: "sidebar.item.jobs.all", href: "/app/projects", hideForFieldWorker: true },
      {
        id: "jobs-my-assigned",
        labelKey: "sidebar.item.jobs.myAssigned",
        href: "/app/projects?filter=assigned",
        fieldWorkerOnly: true,
      },
      {
        id: "jobs-concepts",
        labelKey: "sidebar.item.jobs.concepts",
        href: "/app/projects?filter=concepts",
        hideForFieldWorker: true,
      },
      {
        id: "jobs-active",
        labelKey: "sidebar.item.jobs.active",
        href: "/app/projects?filter=active",
        hideForFieldWorker: true,
      },
      { id: "jobs-new", labelKey: "sidebar.item.jobs.new", href: "/app/projects/new", managementOnly: true },
      {
        id: "jobs-inbox",
        labelKey: "sidebar.item.jobs.inbox",
        href: "/app/inbox",
        managementOnly: true,
      },
      { id: "jobs-tasks", labelKey: "sidebar.item.jobs.tasks", comingSoon: true },
      { id: "jobs-issues", labelKey: "sidebar.item.jobs.issues", comingSoon: true, moduleKey: "issues", hideForFieldWorker: true },
    ],
  },
  {
    id: "planning",
    labelKey: "sidebar.section.planning",
    icon: CalendarDays,
    defaultHref: "/app/planning",
    managementOnly: true,
    moduleKey: "planning",
    items: [
      {
        id: "planning-overview",
        labelKey: "sidebar.item.planning.overview",
        href: "/app/planning",
        managementOnly: true,
      },
      {
        id: "planning-gantt",
        labelKey: "sidebar.item.planning.gantt",
        href: "/app/planning/gantt",
        managementOnly: true,
      },
      {
        id: "planning-team",
        labelKey: "sidebar.item.planning.team",
        comingSoon: true,
        managementOnly: true,
      },
      {
        id: "planning-unplanned",
        labelKey: "sidebar.item.planning.unplanned",
        comingSoon: true,
        managementOnly: true,
      },
      {
        id: "planning-operations",
        labelKey: "sidebar.item.planning.operations",
        href: "/app/operations",
        managementOnly: true,
      },
      {
        id: "planning-reports",
        labelKey: "sidebar.item.planning.reports",
        comingSoon: true,
        managementOnly: true,
      },
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
        moduleKey: "quotes",
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
        href: "/app/expenses",
        managementOnly: true,
        moduleKey: "expenses",
      },
      {
        id: "finance-exports",
        labelKey: "sidebar.item.finance.exports",
        comingSoon: true,
        managementOnly: true,
        moduleKey: "reports",
      },
    ],
  },
  {
    id: "documents",
    labelKey: "sidebar.section.documents",
    icon: FileText,
    defaultHref: "/app/documents",
    items: [
      {
        id: "documents-all",
        labelKey: "sidebar.item.documents.all",
        href: "/app/documents",
      },
      {
        id: "documents-photos",
        labelKey: "sidebar.item.documents.photos",
        href: "/app/documents/photos",
      },
      {
        id: "documents-contracts",
        labelKey: "sidebar.item.documents.contracts",
        comingSoon: true,
        hideForFieldWorker: true,
      },
    ],
  },
  {
    id: "materials",
    labelKey: "sidebar.section.materials",
    icon: Package,
    defaultHref: "/app/materials",
    managementOnly: true,
    moduleKey: "jobs",
    items: [
      {
        id: "materials-overview",
        labelKey: "sidebar.item.materials.overview",
        href: "/app/materials",
        icon: Package,
        managementOnly: true,
        moduleKey: "jobs",
      },
      {
        id: "materials-catalog",
        labelKey: "sidebar.item.materials.catalog",
        href: "/app/materials/catalog",
        icon: BookOpen,
        managementOnly: true,
        moduleKey: "jobs",
      },
      {
        id: "materials-rental",
        labelKey: "sidebar.item.materials.rental",
        href: "/app/materials/rental",
        icon: KeyRound,
        comingSoon: true,
        managementOnly: true,
        moduleKey: "jobs",
      },
    ],
  },
  {
    id: "equipment",
    labelKey: "sidebar.section.equipment",
    icon: Wrench,
    defaultHref: "/app/equipment",
    moduleKey: "equipment",
    items: [
      {
        id: "equipment-list",
        labelKey: "sidebar.item.equipment.list",
        href: "/app/equipment",
        companyOnly: true,
        moduleKey: "equipment",
      },
    ],
  },
  {
    id: "team",
    labelKey: "sidebar.section.team",
    icon: Users,
    defaultHref: "/app/members",
    managementOnly: true,
    moduleKey: "team",
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
        href: "/app/attendance",
        managementOnly: true,
      },
      {
        id: "team-live",
        labelKey: "sidebar.item.team.live",
        href: "/app/operations",
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
      {
        id: "settings-main",
        labelKey: "sidebar.item.more.settings",
        href: "/app/settings",
        hideForFieldWorker: true,
      },
      {
        id: "settings-profile",
        labelKey: "sidebar.item.more.myProfile",
        href: "/app/settings",
        fieldWorkerOnly: true,
      },
      {
        id: "more-billing",
        labelKey: "sidebar.item.more.billing",
        href: "/app/billing",
        companyOnly: true,
        managementOnly: true,
        moduleKey: "billing",
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

/** Quiet “Demnächst” items — customers & contracts not yet in main modules. */
export const SIDEBAR_LATER_ITEMS: NavItemConfig[] = [
  { id: "later-customers", labelKey: "sidebar.item.more.customers", comingSoon: true },
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
  options: {
    isPersonalWorkspace: boolean;
    canManage?: boolean;
    isFieldWorker?: boolean;
    enabledModules?: EnabledModulesMap | null;
  }
): NavItemConfig[] {
  const isCompany = !options.isPersonalWorkspace;
  const canManage = options.canManage ?? true;
  const isFieldWorker = options.isFieldWorker ?? false;
  const modules = options.enabledModules;
  return items.filter((item) => {
    if (item.action === "locale") return false;
    if (item.personalOnly && !options.isPersonalWorkspace) return false;
    if (item.companyOnly && !isCompany) return false;
    if (item.managementOnly && !canManage) return false;
    if (item.hideForFieldWorker && isFieldWorker) return false;
    if (item.fieldWorkerOnly && !isFieldWorker) return false;
    if (isCompany && modules && item.moduleKey && !isModuleEnabled(modules, item.moduleKey)) {
      return false;
    }
    return true;
  });
}

export function filterNavSections(
  sections: NavSectionConfig[],
  options: {
    isPersonalWorkspace: boolean;
    canManage?: boolean;
    isFieldWorker?: boolean;
    enabledModules?: EnabledModulesMap | null;
  }
): NavSectionConfig[] {
  const canManage = options.canManage ?? true;
  const isCompany = !options.isPersonalWorkspace;
  const modules = options.enabledModules;
  return sections
    .filter((section) => !section.managementOnly || canManage)
    .filter(
      (section) =>
        !isCompany ||
        !modules ||
        !section.moduleKey ||
        isModuleEnabled(modules, section.moduleKey)
    )
    .map((section) => ({
      ...section,
      items: filterNavItems(section.items, options),
    }))
    .filter((section) => section.items.length > 0);
}

/** Single primary link sections skip the flyout in collapsed sidebar. */
export function sectionHasFlyout(
  section: NavSectionConfig,
  options: {
    isPersonalWorkspace: boolean;
    canManage?: boolean;
    enabledModules?: EnabledModulesMap | null;
  }
): boolean {
  const items = filterNavItems(section.items, options).filter((item) => !item.action);
  return items.length > 1;
}

/** Expanded sidebar: show nested items when section has sub-links or coming-soon rows. */
export function sectionShowsSubnav(
  section: NavSectionConfig,
  options: {
    isPersonalWorkspace: boolean;
    canManage?: boolean;
    enabledModules?: EnabledModulesMap | null;
  }
): boolean {
  return filterNavItems(section.items, options).length > 1;
}

export function getNavSectionLabelKey(
  section: NavSectionConfig,
  isPersonalWorkspace: boolean,
  isFieldWorker = false
): string {
  if (isFieldWorker && section.fieldWorkerLabelKey) {
    return section.fieldWorkerLabelKey;
  }
  if (isPersonalWorkspace && section.personalLabelKey) {
    return section.personalLabelKey;
  }
  return section.labelKey;
}
