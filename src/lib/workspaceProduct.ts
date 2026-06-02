/**
 * Product-mode helpers: company management vs personal use.
 */
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import { isCompanyWorkspaceType } from "@/types/workspace";

export function isCompanyWorkspaceMode(
  workspace: ActiveWorkspace | null | undefined
): boolean {
  return workspace != null && isCompanyWorkspaceType(workspace.type);
}

/** Owner/admin — firm overview, team, finances. */
export function isOwnerLikeRole(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Owner, admin, manager — day-to-day company operations. */
export function canManageCompanyOperations(role: WorkspaceRole | undefined): boolean {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "accountant"
  );
}

/** Field roles — assigned work, fewer management screens. */
export function isFieldRole(role: WorkspaceRole | undefined): boolean {
  return role === "worker" || role === "client";
}

export type DashboardNextStep = {
  messageKey: string;
  ctaKey: string;
  ctaHref: string;
};

export type DashboardNextStepInput = {
  activeJobsCount: number;
  draftJobsCount: number;
  waitingCustomerCount: number;
  quotesAwaitingCount: number;
  delayedJobsCount: number;
};

export function getDashboardNextStep(
  input: DashboardNextStepInput,
  isCompany: boolean
): DashboardNextStep {
  const {
    activeJobsCount,
    draftJobsCount,
    waitingCustomerCount,
    quotesAwaitingCount,
    delayedJobsCount,
  } = input;

  if (isCompany && delayedJobsCount > 0) {
    return {
      messageKey: "dashboard.nextStep.delayedJobs",
      ctaKey: "dashboard.nextStep.cta.reviewDelayed",
      ctaHref: "/app/projects?filter=active",
    };
  }

  if (isCompany && waitingCustomerCount > 0) {
    return {
      messageKey: "dashboard.nextStep.waitingCustomer",
      ctaKey: "dashboard.nextStep.cta.reviewRequests",
      ctaHref: "/app/projects?filter=waiting",
    };
  }

  if (draftJobsCount > 0) {
    return {
      messageKey: "dashboard.nextStep.draftJobs",
      ctaKey: "dashboard.nextStep.cta.reviewConcepts",
      ctaHref: "/app/projects?filter=concepts",
    };
  }

  if (quotesAwaitingCount > 0) {
    return {
      messageKey: "dashboard.nextStep.quotesAction",
      ctaKey: "dashboard.nextStep.cta.reviewQuotes",
      ctaHref: "/app/quotes",
    };
  }

  if (activeJobsCount === 0) {
    return {
      messageKey: "dashboard.nextStep.noJobs",
      ctaKey: "dashboard.nextStep.cta.createJob",
      ctaHref: "/app/projects/new",
    };
  }

  return {
    messageKey: isCompany
      ? "dashboard.nextStep.hasJobsCompany"
      : "dashboard.nextStep.hasJobs",
    ctaKey: "dashboard.nextStep.cta.newQuote",
    ctaHref: "/app/quotes/new",
  };
}

export function buildAttentionAlerts(
  input: DashboardNextStepInput,
  isCompany: boolean
): { id: string; labelKey: string; count: number; href: string }[] {
  if (!isCompany) return [];

  const alerts: { id: string; labelKey: string; count: number; href: string }[] = [];

  if (input.delayedJobsCount > 0) {
    alerts.push({
      id: "delayed-jobs",
      labelKey: "dashboard.attention.delayedJobs",
      count: input.delayedJobsCount,
      href: "/app/projects?filter=active",
    });
  }
  if (input.waitingCustomerCount > 0) {
    alerts.push({
      id: "waiting-customer",
      labelKey: "dashboard.attention.waitingCustomer",
      count: input.waitingCustomerCount,
      href: "/app/projects?filter=waiting",
    });
  }
  if (input.draftJobsCount > 0) {
    alerts.push({
      id: "draft-jobs",
      labelKey: "dashboard.attention.draftJobs",
      count: input.draftJobsCount,
      href: "/app/projects?filter=concepts",
    });
  }
  if (input.quotesAwaitingCount > 0) {
    alerts.push({
      id: "quotes-action",
      labelKey: "dashboard.attention.quotesAction",
      count: input.quotesAwaitingCount,
      href: "/app/quotes",
    });
  }
  if (input.activeJobsCount > 0) {
    alerts.push({
      id: "active-jobs",
      labelKey: "dashboard.attention.activeJobs",
      count: input.activeJobsCount,
      href: "/app/projects?filter=active",
    });
  }

  return alerts;
}
