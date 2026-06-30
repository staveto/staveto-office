/**
 * Fail-closed quote workspace isolation (P0).
 * Reads must pass quoteBelongsToActiveWorkspace before rendering.
 */
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceType } from "@/types/workspace";
import type { QuoteDoc } from "@/lib/quotes";

export type QuoteScopeFields = {
  ownerId?: string | null;
  ownerUid?: string | null;
  orgId?: string | null;
  workspaceId?: string | null;
  workspaceType?: string | null;
  createdBy?: string | null;
};

export type ActiveQuoteScope = {
  activeWorkspaceType: "company" | "solo";
  /** Org id for company; literal "personal" for solo. */
  activeWorkspaceId: string;
  userId: string;
};

export type ActiveQuoteScopeInput = {
  workspace: ActiveWorkspace | null | undefined;
  userId: string | null | undefined;
};

function trim(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function quoteOwnerUid(quote: QuoteScopeFields): string | null {
  return trim(quote.ownerUid) ?? trim(quote.ownerId);
}

function isCompanyWorkspaceTypeField(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "company" || normalized === "team";
}

function isSoloWorkspaceTypeField(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "solo" || normalized === "personal";
}

export function isUnscopedQuote(quote: QuoteScopeFields): boolean {
  return !quoteOwnerUid(quote) && !trim(quote.orgId) && !trim(quote.workspaceId);
}

export function getActiveQuoteScope(input: ActiveQuoteScopeInput): ActiveQuoteScope | null {
  const userId = trim(input.userId);
  const workspace = input.workspace;
  if (!userId || !workspace) return null;

  if (isCompanyWorkspaceType(workspace.type)) {
    const orgId = trim(workspace.orgId) ?? trim(workspace.id);
    if (!orgId) return null;
    return {
      activeWorkspaceType: "company",
      activeWorkspaceId: orgId,
      userId,
    };
  }

  return {
    activeWorkspaceType: "solo",
    activeWorkspaceId: "personal",
    userId,
  };
}

export function quoteBelongsToActiveWorkspace(
  quote: QuoteScopeFields,
  scope: ActiveQuoteScope | null | undefined
): boolean {
  if (!scope) return false;
  if (isUnscopedQuote(quote)) return false;

  const orgId = trim(quote.orgId);
  const workspaceId = trim(quote.workspaceId);
  const workspaceType = trim(quote.workspaceType);
  const owner = quoteOwnerUid(quote);

  if (scope.activeWorkspaceType === "company") {
    if (orgId) {
      return orgId === scope.activeWorkspaceId;
    }
    if (workspaceId === scope.activeWorkspaceId && isCompanyWorkspaceTypeField(workspaceType)) {
      return true;
    }
    return false;
  }

  if (orgId) return false;
  if (isCompanyWorkspaceTypeField(workspaceType)) return false;
  if (owner !== scope.userId) return false;
  if (workspaceId && workspaceId !== "personal" && workspaceId !== scope.userId) {
    return false;
  }
  if (workspaceType && !isSoloWorkspaceTypeField(workspaceType)) return false;
  return true;
}

export function assertQuoteBelongsToActiveWorkspace(
  quote: QuoteScopeFields,
  scope: ActiveQuoteScope | null | undefined
): void {
  if (!quoteBelongsToActiveWorkspace(quote, scope)) {
    throw new Error("QUOTE_ACCESS_DENIED");
  }
}

export function filterQuotesForActiveWorkspace<T extends QuoteScopeFields>(
  quotes: T[],
  scope: ActiveQuoteScope | null | undefined
): T[] {
  if (!scope) return [];
  return quotes.filter((quote) => quoteBelongsToActiveWorkspace(quote, scope));
}

export function countHiddenUnscopedQuotes(quotes: QuoteScopeFields[]): number {
  return quotes.filter((quote) => isUnscopedQuote(quote)).length;
}

/** Fields for NEW quote documents only — do not bulk-apply to existing docs. */
export function buildQuoteWorkspaceFieldsForNewQuote(
  scope: ActiveQuoteScope
): Record<string, string> {
  if (scope.activeWorkspaceType === "company") {
    return {
      orgId: scope.activeWorkspaceId,
      workspaceId: scope.activeWorkspaceId,
      workspaceType: "team",
      ownerId: scope.userId,
      createdBy: scope.userId,
    };
  }

  return {
    ownerId: scope.userId,
    workspaceId: "personal",
    workspaceType: "personal",
    createdBy: scope.userId,
  };
}

export type QuoteScopeCheckInput = QuoteScopeFields & Pick<QuoteDoc, "id">;
