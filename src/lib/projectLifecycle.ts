/**
 * Pre-sales / delivery lifecycle for zákazky (projects collection).
 * All fields optional on stored documents — use normalize* for legacy rows.
 */
import type { ProjectDoc } from "./projects";

export type ProjectPhase = "sales" | "delivery";

export type ProjectLifecycleStatus =
  | "new_request"
  | "collecting_info"
  | "needs_customer_input"
  | "ready_for_quote"
  | "quote_drafted"
  | "quote_sent"
  | "accepted"
  | "rejected"
  | "converted_to_project"
  | "planned"
  | "in_progress"
  | "paused"
  | "completed"
  | "archived";

export type ProjectSalesStatus =
  | "draft"
  | "waiting_for_customer"
  | "ready_for_quote"
  | "quote_sent"
  | "accepted"
  | "rejected";

export type ProjectQuoteStatus =
  | "none"
  | "draft"
  | "ready"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export type JobSource =
  | "manual"
  | "email"
  | "phone"
  | "photo"
  | "document"
  | "social"
  | "web";

export type ProjectListFilter =
  | "all"
  | "concepts"
  | "active"
  | "waiting"
  | "closed"
  | "completed"
  | "archived";

export type ProjectFilterContext = {
  taskProgressPercent?: number | null;
};

const SALES_LIFECYCLE: ReadonlySet<ProjectLifecycleStatus> = new Set([
  "new_request",
  "collecting_info",
  "needs_customer_input",
  "ready_for_quote",
  "quote_drafted",
  "quote_sent",
  "accepted",
  "rejected",
  "converted_to_project",
]);

const ACTIVE_DELIVERY: ReadonlySet<ProjectLifecycleStatus> = new Set([
  "planned",
  "in_progress",
  "paused",
]);

const CLOSED: ReadonlySet<ProjectLifecycleStatus> = new Set([
  "rejected",
  "archived",
  "completed",
]);

export type ProjectPhaseInput = Pick<
  ProjectDoc,
  "phase" | "lifecycleStatus" | "quoteStatus" | "salesStatus"
>;

export function normalizeProjectPhase(project: ProjectPhaseInput): ProjectPhase {
  if (project.phase === "sales" || project.phase === "delivery") {
    return project.phase;
  }

  const ls = project.lifecycleStatus;
  const qs = project.quoteStatus;
  const ss = project.salesStatus;
  const inActiveDelivery = ls != null && ACTIVE_DELIVERY.has(ls);

  // Quote / sales signals win over stale delivery lifecycle on legacy mobile rows.
  if (qs === "draft" || qs === "ready" || qs === "sent" || qs === "rejected" || qs === "expired") {
    return "sales";
  }
  if (qs === "accepted" && !inActiveDelivery) {
    return "sales";
  }

  if (
    ss === "draft" ||
    ss === "waiting_for_customer" ||
    ss === "ready_for_quote" ||
    ss === "quote_sent" ||
    ss === "rejected"
  ) {
    return "sales";
  }
  if (ss === "accepted" && !inActiveDelivery) {
    return "sales";
  }

  if (ls && SALES_LIFECYCLE.has(ls) && ls !== "converted_to_project" && !inActiveDelivery) {
    return "sales";
  }

  return "delivery";
}

export function normalizeLifecycleStatus(
  project: ProjectPhaseInput
): ProjectLifecycleStatus {
  const phase = normalizeProjectPhase(project);
  const raw = project.lifecycleStatus;
  if (raw && isLifecycleStatus(raw)) {
    return raw;
  }
  return phase === "sales" ? "new_request" : "in_progress";
}

function isLifecycleStatus(value: string): value is ProjectLifecycleStatus {
  return (
    SALES_LIFECYCLE.has(value as ProjectLifecycleStatus) ||
    ACTIVE_DELIVERY.has(value as ProjectLifecycleStatus) ||
    CLOSED.has(value as ProjectLifecycleStatus)
  );
}

export function isDraftJob(project: ProjectPhaseInput): boolean {
  return normalizeProjectPhase(project) === "sales";
}

export function isActiveJob(project: ProjectPhaseInput): boolean {
  const phase = normalizeProjectPhase(project);
  const status = normalizeLifecycleStatus(project);
  return phase === "delivery" && ACTIVE_DELIVERY.has(status);
}

/** Gantt / visual planning — broader than isActiveJob (delivery phase work). */
export function isGanttEligibleProject(project: ProjectDoc): boolean {
  if (isProjectArchived(project)) return false;
  const ls = normalizeLifecycleStatus(project);
  if (ls === "rejected" || ls === "completed") return false;
  if (isClosedJob(project) && ls !== "paused") return false;
  if (normalizeProjectPhase(project) === "delivery") return true;
  return isActiveJob(project);
}

export function isWaitingForCustomer(
  project: Pick<ProjectDoc, "lifecycleStatus" | "salesStatus">
): boolean {
  return (
    project.lifecycleStatus === "needs_customer_input" ||
    project.salesStatus === "waiting_for_customer"
  );
}

export function isClosedJob(project: Pick<ProjectDoc, "phase" | "lifecycleStatus">): boolean {
  const status = normalizeLifecycleStatus(project);
  if (CLOSED.has(status)) return true;
  if (status === "converted_to_project" && normalizeProjectPhase(project) === "sales") {
    return true;
  }
  return false;
}

export function isProjectArchived(
  project: Pick<ProjectDoc, "archivedAt" | "lifecycleStatus">
): boolean {
  if (project.archivedAt) return true;
  return normalizeLifecycleStatus(project) === "archived";
}

export function matchesProjectFilter(
  project: ProjectDoc,
  filter: ProjectListFilter,
  ctx?: ProjectFilterContext
): boolean {
  const archived = isProjectArchived(project);
  const progress = ctx?.taskProgressPercent ?? null;

  switch (filter) {
    case "all":
      return !archived;
    case "archived":
      return archived;
    case "completed": {
      if (archived) return false;
      if (progress === 100) return true;
      return normalizeLifecycleStatus(project) === "completed";
    }
    case "concepts":
      return !archived && isDraftJob(project);
    case "active": {
      if (archived) return false;
      if (normalizeLifecycleStatus(project) === "rejected") return false;
      if (progress === 100) return false;
      if (isClosedJob(project) && normalizeLifecycleStatus(project) !== "paused") {
        return false;
      }
      return (
        isActiveJob(project) ||
        (normalizeProjectPhase(project) === "delivery" &&
          progress != null &&
          progress < 100)
      );
    }
    case "waiting":
      return !archived && isDraftJob(project) && isWaitingForCustomer(project);
    case "closed":
      return isClosedJob(project) || !!project.archivedAt;
    default:
      return true;
  }
}

/** i18n key suffix for lifecycle badge (projects.lifecycle.*) */
export function getLifecycleBadgeKey(
  project: Pick<ProjectDoc, "phase" | "lifecycleStatus" | "salesStatus">
): string {
  const phase = normalizeProjectPhase(project);
  const status = normalizeLifecycleStatus(project);

  if (phase === "delivery") {
    if (status === "planned") return "planned";
    if (status === "paused") return "paused";
    if (status === "completed") return "completed";
    if (status === "archived") return "archived";
    return "activeJob";
  }

  if (status === "needs_customer_input" || project.salesStatus === "waiting_for_customer") {
    return "waitingCustomer";
  }
  if (status === "ready_for_quote" || status === "quote_drafted") {
    return "readyQuote";
  }
  if (status === "quote_sent") return "quoteSent";
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  if (status === "archived") return "archived";
  return "concept";
}

export function getSourceBadgeKey(source?: JobSource): string | null {
  if (!source) return null;
  return source;
}
