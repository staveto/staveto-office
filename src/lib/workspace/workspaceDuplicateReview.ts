/**
 * Phase 1.2 — read-only duplicate organization review helpers.
 * No writes, merges, or deletions.
 */
import type { OrganizationProfile } from "@/lib/organizationProfile";
import { hasOrganizationProfileData } from "@/lib/organizationProfile";
import { normalizeCompanyIdentityName } from "./workspaceContract";

export type OrgReviewSnapshot = {
  orgId: string;
  name: string;
  legalName: string | null;
  ownerUid: string | null;
  createdAt: string | null;
  source: string | null;
  country: string | null;
  membersCount: number | null;
  projectsCount: number;
  profileFieldCount: number;
  isOwner: boolean;
  isMember: boolean;
  membershipRole: string | null;
  matchesLastActiveWorkspace: boolean;
  matchesActiveBusinessOrg: boolean;
};

export type DuplicateGroupReview = {
  groupKey: string;
  displayLabel: string;
  orgIds: string[];
  canonicalOrgId: string;
  canonicalReason: string;
  riskLevel: "low" | "medium" | "high";
  orgs: Array<
    OrgReviewSnapshot & {
      duplicateCandidate: boolean;
      recommendedAction: string;
      appearsEmpty: boolean;
      appearsLegacy: boolean;
      hasImportantData: boolean;
      canonicalScore: number;
    }
  >;
};

export function normalizeOrgLabel(value: string | null | undefined): string {
  return normalizeCompanyIdentityName(value);
}

export function countProfileFields(profile: OrganizationProfile | null): number {
  if (!profile || !hasOrganizationProfileData(profile)) return 0;
  return Object.entries(profile).filter(
    ([key, value]) => key !== "logoStoragePath" && Boolean(String(value ?? "").trim())
  ).length;
}

const LEGACY_SOURCES = new Set(["web", "legacy", "createOrganization"]);

export function appearsLegacyOrg(source: string | null): boolean {
  if (!source) return true;
  return LEGACY_SOURCES.has(source.toLowerCase());
}

export function appearsEmptyOrg(input: {
  projectsCount: number;
  membersCount: number | null;
  profileFieldCount: number;
}): boolean {
  return (
    input.projectsCount === 0 &&
    (input.membersCount ?? 0) <= 1 &&
    input.profileFieldCount <= 1
  );
}

export function hasImportantOrgData(input: {
  projectsCount: number;
  membersCount: number | null;
  profileFieldCount: number;
}): boolean {
  return input.projectsCount > 0 || (input.membersCount ?? 0) > 1 || input.profileFieldCount >= 3;
}

/** Higher = better canonical candidate. Not used for automatic mutation. */
export function scoreOrgForCanonical(org: OrgReviewSnapshot): number {
  let score = 0;
  score += org.projectsCount * 100;
  score += (org.membersCount ?? 0) * 10;
  score += org.profileFieldCount * 5;
  if (org.matchesLastActiveWorkspace) score += 80;
  if (org.matchesActiveBusinessOrg) score += 60;
  if (org.isOwner) score += 20;
  if (org.source?.includes("business") || org.source === "onboarding") score += 15;
  if (appearsLegacyOrg(org.source)) score -= 10;
  if (appearsEmptyOrg(org)) score -= 25;
  if (org.createdAt) {
    const ageMs = Date.now() - Date.parse(org.createdAt);
    if (!Number.isNaN(ageMs) && ageMs > 0) {
      score += Math.min(10, Math.floor(ageMs / (1000 * 60 * 60 * 24 * 30)));
    }
  }
  return score;
}

function buildCanonicalReason(
  winner: OrgReviewSnapshot & { canonicalScore: number },
  others: OrgReviewSnapshot[]
): string {
  const parts: string[] = [];
  if (winner.projectsCount > 0) {
    parts.push(`${winner.projectsCount} project(s)`);
  }
  if ((winner.membersCount ?? 0) > 0) {
    parts.push(`${winner.membersCount} member(s)`);
  }
  if (winner.profileFieldCount > 0) {
    parts.push(`profile ${winner.profileFieldCount} field(s)`);
  }
  if (winner.matchesLastActiveWorkspace) {
    parts.push("matches lastActiveWorkspaceId");
  }
  if (winner.matchesActiveBusinessOrg) {
    parts.push("matches activeBusinessOrgId");
  }
  if (winner.source) {
    parts.push(`source=${winner.source}`);
  }
  if (others.some((o) => appearsEmptyOrg(o))) {
    parts.push("other candidate(s) appear empty/legacy");
  }
  if (parts.length === 0) {
    return "Highest review score among duplicate group; manual confirmation required.";
  }
  return parts.join("; ");
}

function riskForGroup(
  orgs: Array<{ appearsEmpty: boolean; hasImportantData: boolean; projectsCount: number }>
): "low" | "medium" | "high" {
  const withData = orgs.filter((o) => o.hasImportantData);
  if (withData.length >= 2) return "high";
  if (withData.length === 1 && orgs.some((o) => o.appearsEmpty)) return "medium";
  if (orgs.every((o) => o.appearsEmpty)) return "low";
  return "medium";
}

export function buildDuplicateGroups(
  snapshots: OrgReviewSnapshot[],
  options?: { userId?: string }
): DuplicateGroupReview[] {
  const userId = options?.userId?.trim();
  const deduped = [...new Map(snapshots.map((row) => [row.orgId, row])).values()];
  const groups = new Map<string, OrgReviewSnapshot[]>();

  for (const row of deduped) {
    const labelKey = normalizeOrgLabel(row.legalName || row.name);
    if (!labelKey) continue;
    // Same user-visible org name under one account → one duplicate review group.
    const key = userId
      ? `${labelKey}::user:${userId}`
      : `${labelKey}::${row.ownerUid?.trim() || "unknown-owner"}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const result: DuplicateGroupReview[] = [];

  for (const [groupKey, rows] of groups) {
    const uniqueOrgIds = new Set(rows.map((row) => row.orgId));
    if (uniqueOrgIds.size < 2) continue;

    const scored = rows.map((row) => {
      const canonicalScore = scoreOrgForCanonical(row);
      const appearsEmpty = appearsEmptyOrg(row);
      const appearsLegacy = appearsLegacyOrg(row.source);
      const hasImportantData = hasImportantOrgData(row);
      let recommendedAction = "keep";
      if (appearsEmpty && !hasImportantData) {
        recommendedAction = "review_empty_duplicate — likely test/legacy; manual cleanup in Phase 2+";
      } else if (hasImportantData) {
        recommendedAction =
          "manual_review_duplicate — contains data; do not delete without Phase 2 merge plan";
      } else {
        recommendedAction = "manual_review_duplicate — compare createdAt, source, billing";
      }
      return {
        ...row,
        duplicateCandidate: true,
        recommendedAction,
        appearsEmpty,
        appearsLegacy,
        hasImportantData,
        canonicalScore,
      };
    });

    scored.sort((a, b) => b.canonicalScore - a.canonicalScore);
    const winner = scored[0];
    const displayLabel = winner.legalName?.trim() || winner.name.trim() || groupKey.split("::")[0];

    result.push({
      groupKey,
      displayLabel,
      orgIds: scored.map((o) => o.orgId),
      canonicalOrgId: winner.orgId,
      canonicalReason: buildCanonicalReason(winner, scored.slice(1)),
      riskLevel: riskForGroup(scored),
      orgs: scored,
    });
  }

  return result.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
}

export function explainSwitcherDuplicates(input: {
  companyWorkspaces: Array<{ id: string; orgId?: string; name: string }>;
  duplicateGroups: DuplicateGroupReview[];
}): string | null {
  const companies = input.companyWorkspaces.filter((w) => w.id !== "personal");
  if (companies.length < 2) return null;

  const ids = companies.map((w) => w.orgId ?? w.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size === companies.length && input.duplicateGroups.length === 0) {
    return null;
  }

  if (uniqueIds.size < companies.length) {
    return "Switcher lists the same orgId more than once — unexpected; check WorkspaceContext refresh.";
  }

  const labels = companies.map((w) => w.name.trim().toLowerCase());
  const sameLabel = labels.every((l) => l === labels[0]);
  if (sameLabel && uniqueIds.size > 1) {
    return `${companies.length} separate organization documents (different orgIds) share the display name "${companies[0].name}". This is why the switcher shows duplicates — not a UI label bug.`;
  }

  return `${companies.length} company workspaces with different orgIds; ${input.duplicateGroups.length} duplicate group(s) detected for review.`;
}

/** Dev-only console output — ids and counts only. */
export function logWorkspaceSwitcherCompaniesDev(input: {
  userId: string;
  activeWorkspaceId: string | null;
  companies: Array<{
    orgId: string;
    name: string;
    legalName?: string | null;
    ownerUid?: string | null;
    createdAt?: string | null;
    membersCount?: number | null;
    projectsCount?: number | null;
    source?: string | null;
  }>;
  visibleOrgIds?: string[];
  hiddenOrgIds?: string[];
}): void {
  if (process.env.NODE_ENV !== "development") return;

  const hiddenSet = new Set(input.hiddenOrgIds ?? []);
  const rows = input.companies.map((c) => ({
    orgId: c.orgId,
    name: c.name,
    legalName: c.legalName ?? null,
    ownerUid: c.ownerUid ?? null,
    createdAt: c.createdAt ?? null,
    membersCount: c.membersCount ?? null,
    projectsCount: c.projectsCount ?? null,
    source: c.source ?? null,
    isActive: input.activeWorkspaceId === c.orgId,
    switcherVisible: hiddenSet.size === 0 ? true : !hiddenSet.has(c.orgId),
  }));

  const uniqueIds = new Set(rows.map((r) => r.orgId));
  console.group("[WorkspaceSwitcher Phase 1.3] company workspaces loaded");
  console.log("userId:", input.userId);
  console.log("activeWorkspaceId:", input.activeWorkspaceId);
  console.log("companyCount:", rows.length, "uniqueOrgIds:", uniqueIds.size);
  if (input.visibleOrgIds) {
    console.log("switcherVisibleOrgIds:", input.visibleOrgIds);
  }
  if (input.hiddenOrgIds?.length) {
    console.log("switcherHiddenOrgIds:", input.hiddenOrgIds);
  }
  console.table(rows);
  if (rows.length > 1 && uniqueIds.size === rows.length) {
    const sameName = rows.every((r) => r.name === rows[0].name);
    if (sameName) {
      console.warn(
        `[WorkspaceSwitcher] ${rows.length} different orgIds share name "${rows[0].name}" — run Settings → Workspace diagnostics for full review.`
      );
    }
  }
  console.groupEnd();
}
