import type { CompanyType } from "@/lib/onboardingTypes";
import type { Organization } from "@/lib/organizations";
import type { OrganizationProfile } from "@/lib/organizationProfile";
import { hasOrganizationProfileData } from "@/lib/organizationProfile";
import type { DashboardStats } from "@/lib/dashboardStats";
import type { EnabledModulesMap } from "@/lib/enabledModules";
import { isModuleEnabled } from "@/lib/enabledModules";

export type DashboardActivityItem = {
  id: string;
  kind: "job_created" | "job_updated" | "quote_created" | "quote_updated";
  title: string;
  timestamp: string;
  href: string;
};

export type SetupChecklistItemId =
  | "first_job"
  | "first_member"
  | "first_offer"
  | "first_document"
  | "company_profile";

export type SetupChecklistItem = {
  id: SetupChecklistItemId;
  href: string;
  completed: boolean;
  moduleKey?: keyof EnabledModulesMap;
};

export type CompanyTypeAction = {
  id: string;
  href: string;
  icon: "wrench" | "building" | "clipboard" | "zap" | "hammer" | "search" | "user";
};

function parseTrialEnd(raw: unknown): Date | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate();
  }
  return null;
}

export function isOrgTrialing(org: Organization | null | undefined): boolean {
  if (!org) return false;
  if (org.status === "trialing") return true;
  const trialEnd = parseTrialEnd(org.trialEndsAt);
  return trialEnd ? trialEnd.getTime() > Date.now() : false;
}

export function isSetupDashboardMode(
  org: Organization | null | undefined,
  stats: DashboardStats
): boolean {
  return isOrgTrialing(org) && stats.activeJobsCount === 0;
}

export function isProfileComplete(profile: OrganizationProfile | null | undefined): boolean {
  if (!profile || !hasOrganizationProfileData(profile)) return false;
  const hasIdentity = Boolean(profile.legalName?.trim());
  const hasContact = Boolean(
    profile.addressText?.trim() ||
      profile.phone?.trim() ||
      profile.email?.trim() ||
      profile.city?.trim()
  );
  return hasIdentity && hasContact;
}

export function buildSetupChecklist(
  stats: DashboardStats,
  profile: OrganizationProfile | null | undefined,
  modules: EnabledModulesMap,
  companyType: CompanyType = "other"
): SetupChecklistItem[] {
  const totalJobs = stats.projectsCount ?? 0;
  const teamCount = stats.teamCount ?? 1;
  const totalQuotes = stats.quotesCount ?? 0;

  const firstJob: SetupChecklistItem = {
    id: "first_job",
    href: "/app/projects/new",
    completed: totalJobs > 0,
  };

  const firstMember: SetupChecklistItem = {
    id: "first_member",
    href: "/app/members",
    completed: teamCount > 1,
    moduleKey: "team",
  };

  const firstOffer: SetupChecklistItem = {
    id: "first_offer",
    href: "/app/quotes/new",
    completed: totalQuotes > 0,
    moduleKey: "quotes",
  };

  const firstDocument: SetupChecklistItem = {
    id: "first_document",
    href: "/app/projects",
    completed: false,
    moduleKey: "documents",
  };

  const companyProfile: SetupChecklistItem = {
    id: "company_profile",
    href: "/app/settings",
    completed: isProfileComplete(profile),
  };

  const items: SetupChecklistItem[] = [firstJob];

  if (isModuleEnabled(modules, "team")) {
    items.push(firstMember);
  }

  if (companyType === "construction") {
    if (isModuleEnabled(modules, "documents")) {
      items.push(firstDocument);
    }
    if (isModuleEnabled(modules, "quotes")) {
      items.push(firstOffer);
    }
  } else {
    if (isModuleEnabled(modules, "quotes")) {
      items.push(firstOffer);
    }
    if (isModuleEnabled(modules, "documents")) {
      items.push(firstDocument);
    }
  }

  items.push(companyProfile);

  return items;
}

export function getFirstIncompleteSetupItem(
  items: SetupChecklistItem[]
): SetupChecklistItem | null {
  return items.find((item) => !item.completed) ?? null;
}

export function isEmptyCompanyMode(stats: DashboardStats): boolean {
  const projects = stats.projectsCount ?? 0;
  const offers = stats.quotesCount ?? 0;
  return projects === 0 && offers === 0 && buildActivityFeed(stats).length === 0;
}

export function getSetupItemLabelKey(
  itemId: SetupChecklistItemId,
  companyType: CompanyType
): string {
  const personalized: CompanyType[] = ["hvac", "construction", "electrical"];
  if (personalized.includes(companyType)) {
    return `dashboard.command.setup.item.${itemId}.title.${companyType}`;
  }
  return `dashboard.command.setup.item.${itemId}.title.default`;
}

export function getSetupItemHintKey(
  itemId: SetupChecklistItemId,
  companyType: CompanyType
): string {
  const personalized: CompanyType[] = ["hvac", "construction", "electrical"];
  if (personalized.includes(companyType)) {
    return `dashboard.command.setup.item.${itemId}.hint.${companyType}`;
  }
  return `dashboard.command.setup.item.${itemId}.hint.default`;
}

export function getSetupActivityTipKey(
  item: SetupChecklistItem | null
): string {
  if (!item) return "dashboard.command.setup.activityTip.done";
  return `dashboard.command.setup.activityTip.${item.id}`;
}

export function getSetupCompletedMessageKey(itemId: SetupChecklistItemId): string {
  return `dashboard.command.setup.completed.${itemId}`;
}

export function getSetupEstimatedTimeKey(itemId: SetupChecklistItemId): string {
  return `dashboard.command.setup.estimate.${itemId}`;
}

export function getSetupProgress(items: SetupChecklistItem[]): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = items.length;
  const completed = items.filter((i) => i.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent };
}

export function buildActivityFeed(
  stats: DashboardStats,
  limit = 8
): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [];

  for (const job of stats.recentJobs) {
    const ts = job.updatedAt ?? job.createdAt;
    if (!ts) continue;
    const isNew =
      job.createdAt &&
      job.updatedAt &&
      Math.abs(new Date(job.createdAt).getTime() - new Date(job.updatedAt).getTime()) < 60_000;
    items.push({
      id: `job-${job.id}-${ts}`,
      kind: isNew ? "job_created" : "job_updated",
      title: job.name,
      timestamp: ts,
      href: `/app/projects/${job.id}`,
    });
  }

  for (const quote of stats.quotesRecent) {
    const ts = quote.updatedAt ?? quote.createdAt;
    if (!ts) continue;
    const isNew =
      quote.createdAt &&
      quote.updatedAt &&
      Math.abs(new Date(quote.createdAt).getTime() - new Date(quote.updatedAt).getTime()) <
        60_000;
    items.push({
      id: `quote-${quote.id}-${ts}`,
      kind: isNew ? "quote_created" : "quote_updated",
      title: quote.title,
      timestamp: ts,
      href: `/app/quotes/${quote.id}`,
    });
  }

  return items
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export function hasMeaningfulInsights(
  stats: DashboardStats,
  modules: EnabledModulesMap
): boolean {
  if (stats.activeJobsCount > 0) return true;
  if (stats.draftJobsCount > 0) return true;
  if (isModuleEnabled(modules, "quotes") && (stats.quotesAwaitingCount > 0 || (stats.quotesCount ?? 0) > 0)) {
    return true;
  }
  if (isModuleEnabled(modules, "team") && (stats.teamCount ?? 0) > 1) return true;
  if (stats.delayedJobsCount > 0) return true;
  return false;
}

const COMPANY_TYPE_ACTIONS: Record<CompanyType, CompanyTypeAction[]> = {
  hvac: [
    { id: "service_visit", href: "/app/projects/new", icon: "wrench" },
    { id: "installation", href: "/app/projects/new", icon: "building" },
    { id: "maintenance", href: "/app/projects/new", icon: "clipboard" },
    { id: "customer_request", href: "/app/projects/new", icon: "user" },
  ],
  construction: [
    { id: "new_construction", href: "/app/projects/new", icon: "building" },
    { id: "renovation", href: "/app/projects/new", icon: "hammer" },
    { id: "site_inspection", href: "/app/projects/new", icon: "search" },
    { id: "client_request", href: "/app/projects/new", icon: "user" },
  ],
  electrical: [
    { id: "installation", href: "/app/projects/new", icon: "zap" },
    { id: "inspection", href: "/app/projects/new", icon: "search" },
    { id: "service_job", href: "/app/projects/new", icon: "wrench" },
    { id: "fault_repair", href: "/app/projects/new", icon: "hammer" },
  ],
  plumbing: [
    { id: "service_visit", href: "/app/projects/new", icon: "wrench" },
    { id: "installation", href: "/app/projects/new", icon: "building" },
    { id: "maintenance", href: "/app/projects/new", icon: "clipboard" },
    { id: "emergency", href: "/app/projects/new", icon: "zap" },
  ],
  painting: [
    { id: "interior", href: "/app/projects/new", icon: "building" },
    { id: "exterior", href: "/app/projects/new", icon: "building" },
    { id: "touch_up", href: "/app/projects/new", icon: "clipboard" },
    { id: "client_request", href: "/app/projects/new", icon: "user" },
  ],
  roofing: [
    { id: "new_roof", href: "/app/projects/new", icon: "building" },
    { id: "repair", href: "/app/projects/new", icon: "hammer" },
    { id: "inspection", href: "/app/projects/new", icon: "search" },
    { id: "client_request", href: "/app/projects/new", icon: "user" },
  ],
  other: [
    { id: "new_job", href: "/app/projects/new", icon: "clipboard" },
    { id: "client_request", href: "/app/projects/new", icon: "user" },
    { id: "inspection", href: "/app/projects/new", icon: "search" },
    { id: "follow_up", href: "/app/projects/new", icon: "wrench" },
  ],
};

export function resolveCompanyType(raw?: string | null): CompanyType {
  const normalized = raw?.trim().toLowerCase();
  const allowed: CompanyType[] = [
    "hvac",
    "electrical",
    "plumbing",
    "construction",
    "painting",
    "roofing",
    "other",
  ];
  if (normalized && allowed.includes(normalized as CompanyType)) {
    return normalized as CompanyType;
  }
  return "other";
}

export function getCompanyTypeActions(companyType: CompanyType): CompanyTypeAction[] {
  return COMPANY_TYPE_ACTIONS[companyType] ?? COMPANY_TYPE_ACTIONS.other;
}

export function getGreetingKey(hour: number): "morning" | "day" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "day";
  return "evening";
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
