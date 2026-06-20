/**
 * Read-only dashboard aggregates. Safe, minimal queries only.
 */
import { listProjectsForWorkspace, type ProjectDoc } from "./projects";
import type { Workspace } from "./workspace-types";
import { toLegacyWorkspace } from "./workspace-types";
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  isDraftJob,
  isActiveJob,
  isWaitingForCustomer,
  normalizeLifecycleStatus,
} from "./projectLifecycle";
import { listQuotesForWorkspaceEnsured } from "@/services/quotes";
import type { QuoteDoc, QuoteStatus } from "./quotes";
import { listOrgMembers } from "./organizations";
import { dedupeInflight } from "./inflightCache";

export type DashboardJobPreview = {
  id: string;
  name: string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardQuotePreview = {
  id: string;
  title: string;
  status: QuoteStatus;
  clientName?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardStats = {
  projectsCount: number | null;
  estimatesCount: number | null;
  recentJobs: DashboardJobPreview[];
  activeJobsCount: number;
  draftJobsCount: number;
  waitingCustomerCount: number;
  activeJobs: DashboardJobPreview[];
  draftJobs: DashboardJobPreview[];
  quotesCount: number | null;
  quotesAwaitingCount: number;
  quotesAwaiting: DashboardQuotePreview[];
  teamCount: number | null;
  delayedJobsCount: number;
  delayedJobs: DashboardJobPreview[];
  /** Recent quotes with timestamps for activity feed. */
  quotesRecent: DashboardQuotePreview[];
};

const RECENT_JOBS_LIMIT = 5;
const QUOTES_ACTION_LIMIT = 5;

const QUOTES_NEEDING_ACTION: ReadonlySet<QuoteStatus> = new Set(["draft", "sent"]);

function jobLocation(project: {
  addressText?: string;
  city?: string;
}): string | undefined {
  const parts = [project.addressText?.trim(), project.city?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function toJobPreview(project: ProjectDoc): DashboardJobPreview {
  return {
    id: project.id,
    name: project.name,
    location: jobLocation(project),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function sortJobsByRecency(
  a: { updatedAt?: string; createdAt?: string },
  b: { updatedAt?: string; createdAt?: string }
): number {
  const aTime = a.updatedAt ?? a.createdAt ?? "";
  const bTime = b.updatedAt ?? b.createdAt ?? "";
  return bTime.localeCompare(aTime);
}

function toQuotePreview(quote: QuoteDoc): DashboardQuotePreview {
  return {
    id: quote.id,
    title: quote.title,
    status: quote.status,
    clientName: quote.clientName,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  };
}

type ProjectStats = Pick<
  DashboardStats,
  | "projectsCount"
  | "recentJobs"
  | "activeJobsCount"
  | "draftJobsCount"
  | "waitingCustomerCount"
  | "activeJobs"
  | "draftJobs"
  | "delayedJobsCount"
  | "delayedJobs"
>;

type QuoteStats = Pick<
  DashboardStats,
  "quotesCount" | "quotesAwaitingCount" | "quotesAwaiting" | "quotesRecent"
>;

async function loadProjectStats(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<ProjectStats> {
  try {
    const projects = await listProjectsForWorkspace(workspace, uid);
    const active = projects.filter((p) => !p.archivedAt);
    const sorted = [...active].sort(sortJobsByRecency);
    const drafts = active.filter((p) => isDraftJob(p));
    const deliveryActive = active.filter((p) => isActiveJob(p));
    const waiting = drafts.filter((p) => isWaitingForCustomer(p));
    const paused = active.filter((p) => normalizeLifecycleStatus(p) === "paused");

    return {
      projectsCount: active.length,
      recentJobs: sorted.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview),
      draftJobsCount: drafts.length,
      activeJobsCount: deliveryActive.length,
      waitingCustomerCount: waiting.length,
      draftJobs: drafts.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview),
      activeJobs: deliveryActive.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview),
      delayedJobsCount: paused.length,
      delayedJobs: paused.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview),
    };
  } catch {
    return {
      projectsCount: null,
      recentJobs: [],
      activeJobsCount: 0,
      draftJobsCount: 0,
      waitingCustomerCount: 0,
      activeJobs: [],
      draftJobs: [],
      delayedJobsCount: 0,
      delayedJobs: [],
    };
  }
}

async function loadQuoteStats(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<QuoteStats> {
  try {
    const quotes = await listQuotesForWorkspaceEnsured(workspace, uid);
    const sortedQuotes = [...quotes].sort(sortJobsByRecency);
    const awaiting = quotes.filter((q) => QUOTES_NEEDING_ACTION.has(q.status));
    return {
      quotesCount: quotes.length,
      quotesRecent: sortedQuotes.slice(0, RECENT_JOBS_LIMIT).map(toQuotePreview),
      quotesAwaitingCount: awaiting.length,
      quotesAwaiting: awaiting.slice(0, QUOTES_ACTION_LIMIT).map(toQuotePreview),
    };
  } catch {
    return {
      quotesCount: null,
      quotesAwaitingCount: 0,
      quotesAwaiting: [],
      quotesRecent: [],
    };
  }
}

async function loadEstimatesCount(): Promise<number | null> {
  try {
    const res = await fetch("/api/estimates");
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}

async function loadTeamCount(orgId: string | undefined): Promise<number | null> {
  if (!orgId) return null;
  try {
    const members = await listOrgMembers(orgId);
    return members.filter((m) => m.status === "active").length;
  } catch {
    return null;
  }
}

function workspaceCacheId(workspace: Workspace | ActiveWorkspace): string {
  if ("orgId" in workspace && workspace.orgId) return `org:${workspace.orgId}`;
  return `${workspace.type}:${workspace.id}`;
}

export function fetchDashboardStats(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<DashboardStats> {
  // The company dashboard requests stats from several widgets at once; merge
  // those concurrent calls into a single read pass.
  return dedupeInflight(`dashboardStats:${uid}:${workspaceCacheId(workspace)}`, () =>
    computeDashboardStats(workspace, uid)
  );
}

async function computeDashboardStats(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<DashboardStats> {
  const isCompany =
    "source" in workspace
      ? isCompanyWorkspaceType(workspace.type)
      : (workspace as Workspace).type === "team";

  const legacyWorkspace =
    "source" in workspace
      ? toLegacyWorkspace(workspace)
      : (workspace as Workspace);

  const orgId =
    "orgId" in workspace && workspace.orgId
      ? workspace.orgId
      : legacyWorkspace.type === "team"
        ? legacyWorkspace.id
        : undefined;

  // All four reads are independent — run them in parallel so the dashboard
  // resolves at the speed of the slowest query instead of their sum.
  const [projectStats, quoteStats, estimatesCount, teamCount] = await Promise.all([
    loadProjectStats(workspace, uid),
    loadQuoteStats(workspace, uid),
    loadEstimatesCount(),
    isCompany ? loadTeamCount(orgId) : Promise.resolve<number | null>(null),
  ]);

  return {
    ...projectStats,
    ...quoteStats,
    estimatesCount,
    teamCount,
  };
}
