/**
 * Phase 1.4 — client-side guard against duplicate company organization creation.
 * Read-only on existing orgs; does not merge/delete/modify organization documents.
 */
import { getUserOrgMemberships } from "@/lib/organizations";
import { normalizeCompanyIdentityName } from "./workspaceContract";
import {
  hasImportantOrgData,
  scoreOrgForCanonical,
  type OrgReviewSnapshot,
} from "./workspaceDuplicateReview";
import { applyDuplicateSuppression } from "./workspaceDuplicateSuppression";
import {
  fetchOrgReviewSnapshots,
  type OrgReviewHints,
} from "./orgReviewSnapshots";

export type CompanyIdentityCandidate = {
  orgId: string;
  name: string;
  legalName?: string | null;
  ownerUid?: string | null;
  projectsCount?: number;
  membersCount?: number | null;
  profileFieldCount?: number;
  source?: string | null;
  createdAt?: string | null;
  isOwner?: boolean;
  isMember?: boolean;
  matchesLastActiveWorkspace?: boolean;
  matchesActiveBusinessOrg?: boolean;
};

export type CompanyCreationGuardResult =
  | { action: "create_allowed" }
  | {
      action: "use_existing";
      orgId: string;
      displayName: string;
      reason: string;
      matchedOrgIds: string[];
      likelySource?: string | null;
    }
  | {
      action: "manual_review_required";
      canonicalOrgId: string;
      matchedOrgIds: string[];
      reason: string;
    };

export class CompanyCreationBlockedError extends Error {
  readonly guard: CompanyCreationGuardResult;

  constructor(guard: CompanyCreationGuardResult) {
    super(
      guard.action === "manual_review_required"
        ? guard.reason
        : guard.action === "use_existing"
          ? guard.reason
          : "Company creation blocked."
    );
    this.name = "CompanyCreationBlockedError";
    this.guard = guard;
  }
}

export function findMatchingCompanyCandidates(
  companyName: string,
  candidates: CompanyIdentityCandidate[],
  options?: { legalName?: string | null }
): CompanyIdentityCandidate[] {
  const searchKeys = new Set<string>();
  const primary = normalizeCompanyIdentityName(companyName);
  if (primary) searchKeys.add(primary);
  const legal = normalizeCompanyIdentityName(options?.legalName);
  if (legal) searchKeys.add(legal);
  if (searchKeys.size === 0) return [];

  return candidates.filter((candidate) => {
    const candidateKeys = [candidate.legalName, candidate.name]
      .map(normalizeCompanyIdentityName)
      .filter(Boolean);
    return candidateKeys.some((key) => searchKeys.has(key));
  });
}

function candidateToSnapshot(
  candidate: CompanyIdentityCandidate,
  userId?: string
): OrgReviewSnapshot {
  return {
    orgId: candidate.orgId,
    name: candidate.name,
    legalName: candidate.legalName ?? null,
    ownerUid: candidate.ownerUid ?? null,
    createdAt: candidate.createdAt ?? null,
    source: candidate.source ?? null,
    country: null,
    membersCount: candidate.membersCount ?? null,
    projectsCount: candidate.projectsCount ?? 0,
    profileFieldCount: candidate.profileFieldCount ?? 0,
    isOwner: candidate.isOwner ?? candidate.ownerUid === userId,
    isMember: candidate.isMember ?? true,
    membershipRole: null,
    matchesLastActiveWorkspace: candidate.matchesLastActiveWorkspace ?? false,
    matchesActiveBusinessOrg: candidate.matchesActiveBusinessOrg ?? false,
  };
}

export function evaluateCompanyCreationGuard(
  companyName: string,
  candidates: CompanyIdentityCandidate[],
  options?: { userId?: string; legalName?: string | null }
): CompanyCreationGuardResult {
  const matches = findMatchingCompanyCandidates(companyName, candidates, options);
  if (matches.length === 0) {
    return { action: "create_allowed" };
  }

  const snapshots = matches.map((row) => candidateToSnapshot(row, options?.userId));
  const suppression = applyDuplicateSuppression([], snapshots, options?.userId);
  const canonicalOrgId =
    suppression.duplicateGroups[0]?.canonicalOrgId ??
    [...snapshots].sort(
      (a, b) => scoreOrgForCanonical(b) - scoreOrgForCanonical(a)
    )[0].orgId;

  const matchedOrgIds = matches.map((row) => row.orgId);
  const canonical =
    matches.find((row) => row.orgId === canonicalOrgId) ?? matches[0];
  const displayName = canonical.legalName?.trim() || canonical.name.trim();

  const dataRichMatches = matches.filter((row) =>
    hasImportantOrgData({
      projectsCount: row.projectsCount ?? 0,
      membersCount: row.membersCount ?? null,
      profileFieldCount: row.profileFieldCount ?? 0,
    })
  );
  if (dataRichMatches.length >= 2) {
    const scores = snapshots.map((row) => scoreOrgForCanonical(row));
    const maxScore = Math.max(...scores);
    const tied = scores.filter((score) => score >= maxScore - 1).length;
    if (tied > 1) {
      return {
        action: "manual_review_required",
        canonicalOrgId,
        matchedOrgIds,
        reason:
          "Multiple organizations with the same company identity contain data. Review in Workspace Diagnostics — no automatic merge or deletion.",
      };
    }
  }

  return {
    action: "use_existing",
    orgId: canonicalOrgId,
    displayName,
    reason:
      matchedOrgIds.length === 1
        ? "A company with the same legal identity already exists for this account."
        : "Existing company with the same legal identity found — using canonical organization instead of creating a duplicate.",
    matchedOrgIds,
    likelySource: canonical.source ?? null,
  };
}

export function getCanonicalWorkspaceIdIfDuplicate(
  orgId: string | null | undefined,
  snapshots: OrgReviewSnapshot[],
  userId?: string
): string | null | undefined {
  if (!orgId?.trim()) return orgId;
  const suppression = applyDuplicateSuppression([], snapshots, userId);
  return suppression.remapOrgId(orgId.trim()) ?? orgId.trim();
}

export async function loadCompanyIdentityCandidates(
  userId: string,
  options?: { orgIdHints?: string[]; profileHints?: OrgReviewHints }
): Promise<CompanyIdentityCandidate[]> {
  const memberships = await getUserOrgMemberships(userId, {
    orgIdHints: options?.orgIdHints,
  });
  const orgIds = [...new Set(memberships.map((membership) => membership.orgId))];
  if (orgIds.length === 0) return [];

  const snapshots = await fetchOrgReviewSnapshots(userId, orgIds, options?.profileHints);
  return snapshots.map((row) => ({
    orgId: row.orgId,
    name: row.name,
    legalName: row.legalName,
    ownerUid: row.ownerUid,
    projectsCount: row.projectsCount,
    membersCount: row.membersCount,
    profileFieldCount: row.profileFieldCount,
    source: row.source,
    createdAt: row.createdAt,
    isOwner: row.isOwner,
    isMember: row.isMember,
    matchesLastActiveWorkspace: row.matchesLastActiveWorkspace,
    matchesActiveBusinessOrg: row.matchesActiveBusinessOrg,
  }));
}

export async function guardCompanyCreation(
  userId: string,
  input: {
    companyName: string;
    legalName?: string | null;
    orgIdHints?: string[];
    profileHints?: OrgReviewHints;
  }
): Promise<CompanyCreationGuardResult> {
  const candidates = await loadCompanyIdentityCandidates(userId, {
    orgIdHints: input.orgIdHints,
    profileHints: input.profileHints,
  });
  return evaluateCompanyCreationGuard(input.companyName, candidates, {
    userId,
    legalName: input.legalName ?? input.companyName,
  });
}
