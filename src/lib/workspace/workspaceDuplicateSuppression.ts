/**
 * Phase 1.3 — hide non-canonical duplicate orgs from the normal workspace switcher.
 * Read-only on organizations/projects; may persist users/{uid}.lastActiveWorkspaceId only.
 */
import type { ActiveWorkspace } from "@/types/workspace";
import {
  buildDuplicateGroups,
  scoreOrgForCanonical,
  appearsEmptyOrg,
  appearsLegacyOrg,
  hasImportantOrgData,
  normalizeOrgLabel,
  type DuplicateGroupReview,
  type OrgReviewSnapshot,
} from "./workspaceDuplicateReview";

export type HiddenDuplicateOrg = {
  orgId: string;
  canonicalOrgId: string;
  displayLabel: string;
  projectsCount: number;
  membersCount: number | null;
  profileFieldCount: number;
  hideReason: string;
  recommendedAction: "manual_review_duplicate";
  canonicalReason: string;
  likelySource?: string | null;
};

export type DuplicateSuppressionResult = {
  switcherWorkspaces: ActiveWorkspace[];
  allWorkspaces: ActiveWorkspace[];
  hiddenDuplicates: HiddenDuplicateOrg[];
  duplicateGroups: DuplicateGroupReview[];
  hiddenOrgIdToCanonical: ReadonlyMap<string, string>;
  remapOrgId: (orgId: string | null | undefined) => string | null | undefined;
};

function workspaceOrgId(workspace: ActiveWorkspace): string {
  return workspace.type === "company" ? (workspace.orgId ?? workspace.id) : workspace.id;
}

function buildHideReason(
  org: DuplicateGroupReview["orgs"][number],
  group: DuplicateGroupReview
): string {
  const winner = group.orgs.find((o) => o.orgId === group.canonicalOrgId);
  if (org.appearsEmpty && (winner?.projectsCount ?? 0) > 0) {
    return `Hidden from switcher: empty duplicate (${org.projectsCount} projects) while canonical org has ${winner?.projectsCount ?? 0} project(s).`;
  }
  if (org.projectsCount < (winner?.projectsCount ?? 0)) {
    return `Hidden from switcher: fewer projects (${org.projectsCount} vs canonical ${winner?.projectsCount ?? 0}).`;
  }
  return `Hidden from switcher: lower canonical score (${org.canonicalScore} vs ${winner?.canonicalScore ?? 0}). ${group.canonicalReason}`;
}

export function applyDuplicateSuppression(
  workspaces: ActiveWorkspace[],
  snapshots: OrgReviewSnapshot[],
  userId?: string
): DuplicateSuppressionResult {
  const duplicateGroups = buildDuplicateGroups(snapshots, { userId });
  const hiddenOrgIdToCanonical = new Map<string, string>();
  const hiddenDuplicates: HiddenDuplicateOrg[] = [];

  for (const group of duplicateGroups) {
    for (const org of group.orgs) {
      if (org.orgId === group.canonicalOrgId) continue;
      hiddenOrgIdToCanonical.set(org.orgId, group.canonicalOrgId);
      hiddenDuplicates.push({
        orgId: org.orgId,
        canonicalOrgId: group.canonicalOrgId,
        displayLabel: group.displayLabel,
        projectsCount: org.projectsCount,
        membersCount: org.membersCount,
        profileFieldCount: org.profileFieldCount,
        hideReason: buildHideReason(org, group),
        recommendedAction: "manual_review_duplicate",
        canonicalReason: group.canonicalReason,
        likelySource: org.source ?? null,
      });
    }
  }

  // Belt-and-suspenders: hide lower-scored same-name orgs even if grouping missed an edge case.
  if (userId?.trim()) {
    const byLabel = new Map<string, OrgReviewSnapshot[]>();
    for (const row of snapshots) {
      const labelKey = normalizeOrgLabel(row.legalName || row.name);
      if (!labelKey) continue;
      const list = byLabel.get(labelKey) ?? [];
      if (!list.some((entry) => entry.orgId === row.orgId)) {
        list.push(row);
      }
      byLabel.set(labelKey, list);
    }
    for (const rows of byLabel.values()) {
      const uniqueOrgIds = new Set(rows.map((row) => row.orgId));
      if (uniqueOrgIds.size < 2) continue;
      const scored = [...rows].sort(
        (a, b) => scoreOrgForCanonical(b) - scoreOrgForCanonical(a)
      );
      const canonicalOrgId = scored[0].orgId;
      for (const row of scored.slice(1)) {
        if (hiddenOrgIdToCanonical.has(row.orgId)) continue;
        hiddenOrgIdToCanonical.set(row.orgId, canonicalOrgId);
        hiddenDuplicates.push({
          orgId: row.orgId,
          canonicalOrgId,
          displayLabel: row.legalName?.trim() || row.name.trim(),
          projectsCount: row.projectsCount,
          membersCount: row.membersCount,
          profileFieldCount: row.profileFieldCount,
          hideReason: buildHideReason(
            {
              ...row,
              duplicateCandidate: true,
              recommendedAction: "manual_review_duplicate",
              appearsEmpty: appearsEmptyOrg(row),
              appearsLegacy: appearsLegacyOrg(row.source),
              hasImportantData: hasImportantOrgData(row),
              canonicalScore: scoreOrgForCanonical(row),
            },
            {
              groupKey: "",
              displayLabel: row.legalName?.trim() || row.name.trim(),
              orgIds: scored.map((entry) => entry.orgId),
              canonicalOrgId,
              canonicalReason: "Highest score among same-name organizations for this user.",
              riskLevel: "medium",
              orgs: scored.map((entry) => ({
                ...entry,
                duplicateCandidate: true,
                recommendedAction: "manual_review_duplicate",
                appearsEmpty: appearsEmptyOrg(entry),
                appearsLegacy: appearsLegacyOrg(entry.source),
                hasImportantData: hasImportantOrgData(entry),
                canonicalScore: scoreOrgForCanonical(entry),
              })),
            }
          ),
          recommendedAction: "manual_review_duplicate",
          canonicalReason: "Highest score among same-name organizations for this user.",
          likelySource: row.source ?? null,
        });
      }
    }
  }

  const hiddenIds = new Set(hiddenOrgIdToCanonical.keys());
  const switcherWorkspaces = workspaces.filter((w) => {
    if (w.type !== "company") return true;
    return !hiddenIds.has(workspaceOrgId(w));
  });

  const remapOrgId = (orgId: string | null | undefined): string | null | undefined => {
    if (!orgId?.trim()) return orgId;
    const trimmed = orgId.trim();
    return hiddenOrgIdToCanonical.get(trimmed) ?? trimmed;
  };

  return {
    switcherWorkspaces,
    allWorkspaces: workspaces,
    hiddenDuplicates,
    duplicateGroups,
    hiddenOrgIdToCanonical,
    remapOrgId,
  };
}

export function logDuplicateSuppressionDev(
  userId: string,
  result: DuplicateSuppressionResult,
  activeWorkspaceId: string | null
): void {
  if (process.env.NODE_ENV !== "development") return;
  if (result.hiddenDuplicates.length === 0) return;

  console.group("[WorkspaceSwitcher Phase 1.3] duplicate suppression");
  console.log("userId:", userId);
  console.log("activeWorkspaceId:", activeWorkspaceId);
  console.table(
    result.hiddenDuplicates.map((row) => ({
      hiddenOrgId: row.orgId,
      canonicalOrgId: row.canonicalOrgId,
      projects: row.projectsCount,
      members: row.membersCount,
      hideReason: row.hideReason,
    }))
  );
  console.groupEnd();
}
