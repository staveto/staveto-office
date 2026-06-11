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
import { listQuotesForWorkspace, type QuoteDoc, type QuoteStatus } from "./quotes";
import { listOrgMembers } from "./organizations";

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

export async function fetchDashboardStats(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<DashboardStats> {
  let projectsCount: number | null = null;
  let estimatesCount: number | null = null;
  let recentJobs: DashboardJobPreview[] = [];
  let activeJobsCount = 0;
  let draftJobsCount = 0;
  let waitingCustomerCount = 0;
  let activeJobs: DashboardJobPreview[] = [];
  let draftJobs: DashboardJobPreview[] = [];
  let quotesCount: number | null = null;
  let quotesAwaitingCount = 0;
  let quotesAwaiting: DashboardQuotePreview[] = [];
  let teamCount: number | null = null;
  let delayedJobsCount = 0;
  let delayedJobs: DashboardJobPreview[] = [];
  let quotesRecent: DashboardQuotePreview[] = [];

  const isCompany =
    "source" in workspace
      ? isCompanyWorkspaceType(workspace.type)
      : (workspace as Workspace).type === "team";

  const legacyWorkspace =
    "source" in workspace
      ? toLegacyWorkspace(workspace)
      : (workspace as Workspace);

  try {
    const projects = await listProjectsForWorkspace(workspace, uid);
    const active = projects.filter((p) => !p.archivedAt);
    projectsCount = active.length;

    const sorted = [...active].sort(sortJobsByRecency);
    recentJobs = sorted.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview);

    const drafts = active.filter((p) => isDraftJob(p));
    const deliveryActive = active.filter((p) => isActiveJob(p));
    const waiting = drafts.filter((p) => isWaitingForCustomer(p));

    draftJobsCount = drafts.length;
    activeJobsCount = deliveryActive.length;
    waitingCustomerCount = waiting.length;

    draftJobs = drafts.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview);
    activeJobs = deliveryActive.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview);

    const paused = active.filter(
      (p) => normalizeLifecycleStatus(p) === "paused"
    );
    delayedJobsCount = paused.length;
    delayedJobs = paused.slice(0, RECENT_JOBS_LIMIT).map(toJobPreview);
  } catch {
    projectsCount = null;
    recentJobs = [];
  }

  try {
    const quotes = await listQuotesForWorkspace(legacyWorkspace, uid);
    quotesCount = quotes.length;
    const sortedQuotes = [...quotes].sort(sortJobsByRecency);
    quotesRecent = sortedQuotes.slice(0, RECENT_JOBS_LIMIT).map(toQuotePreview);
    const awaiting = quotes.filter((q) => QUOTES_NEEDING_ACTION.has(q.status));
    quotesAwaitingCount = awaiting.length;
    quotesAwaiting = awaiting.slice(0, QUOTES_ACTION_LIMIT).map(toQuotePreview);
  } catch {
    quotesCount = null;
    quotesAwaiting = [];
    quotesRecent = [];
  }

  try {
    const res = await fetch("/api/estimates");
    if (res.ok) {
      const data: unknown = await res.json();
      estimatesCount = Array.isArray(data) ? data.length : null;
    }
  } catch {
    estimatesCount = null;
  }

  const orgId =
    "orgId" in workspace && workspace.orgId
      ? workspace.orgId
      : legacyWorkspace.type === "team"
        ? legacyWorkspace.id
        : undefined;

  if (isCompany && orgId) {
    try {
      const members = await listOrgMembers(orgId);
      teamCount = members.filter((m) => m.status === "active").length;
    } catch {
      teamCount = null;
    }
  }

  return {
    projectsCount,
    estimatesCount,
    recentJobs,
    activeJobsCount,
    draftJobsCount,
    waitingCustomerCount,
    activeJobs,
    draftJobs,
    quotesCount,
    quotesAwaitingCount,
    quotesAwaiting,
    teamCount,
    delayedJobsCount,
    delayedJobs,
    quotesRecent,
  };
}
