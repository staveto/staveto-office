/**
 * Phase 1.2 — read-only workspace / organization diagnostics for the signed-in user.
 * No writes, deletes, archives, or migrations.
 */
import {
  collection,
  getDocs,
  getFirestoreInstance,
  query,
  where,
  limit,
  waitForAuthUser,
  ensureAuthTokenReady,
} from "@/lib/firebase";
import {
  getOrganization,
  getUserOrgMemberships,
  listOrgMembers,
} from "@/lib/organizations";
import { readOrganizationProfile } from "@/lib/organizationProfile";
import type { ProjectDoc } from "@/lib/projects";
import { toProjectDoc } from "@/lib/projects";
import { getProjectOwnershipScope } from "@/lib/projectOwnership";
import { SOLO_WORKSPACE_ID } from "./workspaceContract";
import {
  appearsEmptyOrg,
  appearsLegacyOrg,
  buildDuplicateGroups,
  countProfileFields,
  explainSwitcherDuplicates,
  hasImportantOrgData,
  type DuplicateGroupReview,
  type OrgReviewSnapshot,
} from "./workspaceDuplicateReview";
import {
  applyDuplicateSuppression,
  type HiddenDuplicateOrg,
} from "./workspaceDuplicateSuppression";
export type { HiddenDuplicateOrg };
export { fetchOrgReviewSnapshots, fetchOrgReviewSnapshotsForDev } from "./orgReviewSnapshots";
export type WorkspaceDiagnosticOrgRow = {
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
  appearsEmpty: boolean;
  appearsLegacy: boolean;
  hasImportantData: boolean;
  duplicateCandidate: boolean;
  recommendedAction: string;
  canonicalScore: number;
};
export type WorkspaceProjectBucket = {
  key: string;
  count: number;
  sampleProjectIds: string[];
};
export type WorkspaceDiagnosticsReport = {
  generatedAt: string;
  userId: string;
  userEmail: string | null;
  activeWorkspaceId: string | null;
  lastActiveWorkspaceId: string | null;
  activeBusinessOrgId: string | null;
  organizations: WorkspaceDiagnosticOrgRow[];
  ownedOrganizations: WorkspaceDiagnosticOrgRow[];
  memberOrganizations: WorkspaceDiagnosticOrgRow[];
  duplicateGroups: DuplicateGroupReview[];
  hiddenFromSwitcher: HiddenDuplicateOrg[];
  visibleSwitcherOrganizations: Array<{
    orgId: string;
    name: string;
    projectsCount: number;
    membersCount: number | null;
  }>;
  switcherSuppressionNote: string | null;
  switcherDuplicateExplanation: string | null;
  projectBuckets: WorkspaceProjectBucket[];
  ambiguousProjects: ProjectDoc[];
  crossListProjects: Array<{
    projectId: string;
    name: string;
    ownerId: string | null;
    orgId: string | null;
    workspaceType: string | null;
    workspaceId: string | null;
    inSoloList: boolean;
    inCompanyOrgIds: string[];
  }>;
  soloProjectsCount: number;
  companyProjectsCount: number;
  canonicalOrganizationId: string | null;
  canonicalOrganizationReason: string | null;
  duplicateOrganizationWarning: string | null;
  migrationRiskLevel: "low" | "medium" | "high";
  noAutomaticDeletion: true;
  manualCleanupPlan: string[];
  notes: string[];
};
function formatTimestamp(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    try {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}
function isSoloProject(project: ProjectDoc, uid: string): boolean {
  return getProjectOwnershipScope(project) === "personal" && project.ownerId === uid;
}
async function loadOwnedProjects(uid: string): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "projects"), where("ownerId", "==", uid), limit(200))
  );
  return snap.docs.map((d) => toProjectDoc(d.id, d.data() as Record<string, unknown>));
}
async function loadOrgProjects(orgId: string): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  try {
    const snap = await getDocs(
      query(collection(db, "projects"), where("orgId", "==", orgId), limit(200))
    );
    return snap.docs.map((d) => toProjectDoc(d.id, d.data() as Record<string, unknown>));
  } catch {
    return [];
  }
}
export type WorkspaceDiagnosticsInput = {
  userId: string;
  userEmail?: string | null;
  orgIdHints?: string[];
  activeWorkspaceId?: string | null;
  lastActiveWorkspaceId?: string | null;
  activeBusinessOrgId?: string | null;
};
export async function runWorkspaceDiagnostics(
  input: WorkspaceDiagnosticsInput
): Promise<WorkspaceDiagnosticsReport> {
  await waitForAuthUser();
  await ensureAuthTokenReady();
  const uid = input.userId.trim();
  const lastActive =
    input.lastActiveWorkspaceId?.trim() && input.lastActiveWorkspaceId !== SOLO_WORKSPACE_ID
      ? input.lastActiveWorkspaceId.trim()
      : null;
  const activeBusinessOrgId = input.activeBusinessOrgId?.trim() || null;
  const activeWorkspaceId =
    input.activeWorkspaceId?.trim() && input.activeWorkspaceId !== SOLO_WORKSPACE_ID
      ? input.activeWorkspaceId.trim()
      : activeBusinessOrgId;
  const notes: string[] = [
    "Read-only report. No organizations or projects were modified.",
    "Duplicate merge requires manual review in Phase 2+.",
  ];
  const memberships = await getUserOrgMemberships(uid, {
    orgIdHints: input.orgIdHints,
    email: input.userEmail ?? undefined,
  });
  const orgIds = [...new Set(memberships.map((m) => m.orgId))];
  const snapshots: OrgReviewSnapshot[] = [];
  const orgProjectsMap = new Map<string, ProjectDoc[]>();
  for (const orgId of orgIds) {
    orgProjectsMap.set(orgId, await loadOrgProjects(orgId));
  }
  for (const membership of memberships) {
    const org = await getOrganization(membership.orgId);
    const profile = await readOrganizationProfile(membership.orgId);
    let membersCount: number | null = null;
    try {
      const members = await listOrgMembers(membership.orgId);
      membersCount = members.length;
    } catch {
      membersCount = null;
    }
    const orgRaw = org as unknown as Record<string, unknown> | null;
    const legalName = profile?.profile?.legalName?.trim() || null;
    const name = legalName || org?.name?.trim() || membership.orgName;
    const profileFieldCount = countProfileFields(profile?.profile ?? null);
    const projectsCount = (orgProjectsMap.get(membership.orgId) ?? []).length;
    snapshots.push({
      orgId: membership.orgId,
      name,
      legalName,
      ownerUid: org?.ownerUid ?? null,
      createdAt: formatTimestamp(org?.createdAt),
      source: typeof orgRaw?.source === "string" ? orgRaw.source : null,
      country: profile?.profile?.country?.trim() || null,
      membersCount,
      projectsCount,
      profileFieldCount,
      isOwner: org?.ownerUid === uid,
      isMember: true,
      membershipRole: membership.role,
      matchesLastActiveWorkspace: lastActive === membership.orgId,
      matchesActiveBusinessOrg: activeBusinessOrgId === membership.orgId,
    });
  }
  const duplicateGroups = buildDuplicateGroups(snapshots, { userId: uid });
  const duplicateOrgIds = new Set(duplicateGroups.flatMap((g) => g.orgIds));
  const allOwnedProjects = await loadOwnedProjects(uid);
  const soloProjects = allOwnedProjects.filter((p) => isSoloProject(p, uid));
  const soloIds = new Set(soloProjects.map((p) => p.id));
  const companyProjectIdsByOrg = new Map<string, Set<string>>();
  for (const [orgId, rows] of orgProjectsMap) {
    companyProjectIdsByOrg.set(orgId, new Set(rows.map((p) => p.id)));
  }
  const crossListProjects = allOwnedProjects
    .filter((p) => {
      const inSolo = soloIds.has(p.id);
      const companyOrgs = orgIds.filter((orgId) =>
        (companyProjectIdsByOrg.get(orgId) ?? new Set()).has(p.id)
      );
      return inSolo && companyOrgs.length > 0;
    })
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      ownerId: p.ownerId ?? null,
      orgId: p.orgId ?? null,
      workspaceType: p.workspaceType ?? null,
      workspaceId: p.workspaceId ?? null,
      inSoloList: true,
      inCompanyOrgIds: orgIds.filter((orgId) =>
        (companyProjectIdsByOrg.get(orgId) ?? new Set()).has(p.id)
      ),
    }));
  const ambiguousProjects = allOwnedProjects.filter((p) => {
    const hasOrg = Boolean(p.orgId?.trim());
    const scope = getProjectOwnershipScope(p);
    return (hasOrg && scope === "personal") || (!hasOrg && scope === "company");
  });
  const bucketMap = new Map<string, ProjectDoc[]>();
  for (const p of allOwnedProjects) {
    const key = [
      `ownerId=${p.ownerId ?? "—"}`,
      `orgId=${p.orgId ?? "—"}`,
      `workspaceId=${p.workspaceId ?? "—"}`,
      `workspaceType=${p.workspaceType ?? "—"}`,
    ].join(" | ");
    const list = bucketMap.get(key) ?? [];
    list.push(p);
    bucketMap.set(key, list);
  }
  const projectBuckets: WorkspaceProjectBucket[] = [...bucketMap.entries()]
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      sampleProjectIds: rows.slice(0, 5).map((r) => r.id),
    }))
    .sort((a, b) => b.count - a.count);
  const scoreByOrgId = new Map(
    duplicateGroups.flatMap((g) => g.orgs.map((o) => [o.orgId, o.canonicalScore] as const))
  );
  const groupByOrgId = new Map(
    duplicateGroups.flatMap((g) => g.orgs.map((o) => [o.orgId, g] as const))
  );
  const organizations: WorkspaceDiagnosticOrgRow[] = snapshots.map((row) => {
    const groupOrg = groupByOrgId.get(row.orgId)?.orgs.find((o) => o.orgId === row.orgId);
    const duplicateCandidate = duplicateOrgIds.has(row.orgId);
    let recommendedAction = "keep";
    if (groupOrg) {
      recommendedAction = groupOrg.recommendedAction;
    } else if (row.projectsCount === 0 && row.isOwner) {
      recommendedAction = "review_empty_owned_org";
    }
    return {
      orgId: row.orgId,
      name: row.name,
      legalName: row.legalName,
      ownerUid: row.ownerUid,
      createdAt: row.createdAt,
      source: row.source,
      country: row.country,
      membersCount: row.membersCount,
      projectsCount: row.projectsCount,
      profileFieldCount: row.profileFieldCount,
      isOwner: row.isOwner,
      isMember: row.isMember,
      membershipRole: row.membershipRole,
      matchesLastActiveWorkspace: row.matchesLastActiveWorkspace,
      matchesActiveBusinessOrg: row.matchesActiveBusinessOrg,
      appearsEmpty:
        groupOrg?.appearsEmpty ??
        appearsEmptyOrg({
          projectsCount: row.projectsCount,
          membersCount: row.membersCount,
          profileFieldCount: row.profileFieldCount,
        }),
      appearsLegacy: groupOrg?.appearsLegacy ?? appearsLegacyOrg(row.source),
      hasImportantData:
        groupOrg?.hasImportantData ??
        hasImportantOrgData({
          projectsCount: row.projectsCount,
          membersCount: row.membersCount,
          profileFieldCount: row.profileFieldCount,
        }),
      duplicateCandidate,
      recommendedAction,
      canonicalScore: scoreByOrgId.get(row.orgId) ?? 0,
    };
  });
  const ownedOrganizations = organizations.filter((o) => o.isOwner);
  const memberOrganizations = organizations.filter((o) => !o.isOwner);
  const primaryDuplicateGroup = duplicateGroups[0];
  const canonicalFromDuplicate = primaryDuplicateGroup?.canonicalOrgId ?? null;
  const canonicalFromDuplicateReason = primaryDuplicateGroup?.canonicalReason ?? null;
  const ownedOrgs = organizations.filter((o) => o.isOwner);
  const canonicalFromOwned = [...ownedOrgs].sort((a, b) => {
    if (b.canonicalScore !== a.canonicalScore) return b.canonicalScore - a.canonicalScore;
    if (b.projectsCount !== a.projectsCount) return b.projectsCount - a.projectsCount;
    if ((b.membersCount ?? 0) !== (a.membersCount ?? 0)) {
      return (b.membersCount ?? 0) - (a.membersCount ?? 0);
    }
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return aTime - bTime;
  })[0];
  const canonicalOrganizationId = canonicalFromDuplicate ?? canonicalFromOwned?.orgId ?? null;
  const canonicalOrganizationReason =
    canonicalFromDuplicateReason ??
    (canonicalFromOwned
      ? `Highest score among owned orgs (${canonicalFromOwned.projectsCount} projects, ${canonicalFromOwned.membersCount ?? 0} members, profile ${canonicalFromOwned.profileFieldCount} fields).`
      : orgIds.length === 0
        ? `No company organizations — solo workspace (${SOLO_WORKSPACE_ID}) is canonical for projects.`
        : null);
  const companyWorkspacesForSuppression = snapshots.map((s) => ({
    id: s.orgId,
    type: "company" as const,
    name: s.name,
    role: "owner" as const,
    source: "organization" as const,
    orgId: s.orgId,
    ownerId: s.ownerUid ?? undefined,
    legacyId: s.orgId,
    mobileWorkspaceKind: "business" as const,
  }));
  const suppression = applyDuplicateSuppression(
    companyWorkspacesForSuppression,
    snapshots,
    uid
  );
  const hiddenFromSwitcher = suppression.hiddenDuplicates;
  const hiddenOrgIds = new Set(suppression.hiddenOrgIdToCanonical.keys());
  const visibleSwitcherOrganizations = snapshots
    .filter((row) => !hiddenOrgIds.has(row.orgId))
    .map((row) => ({
      orgId: row.orgId,
      name: row.legalName?.trim() || row.name.trim(),
      projectsCount: row.projectsCount,
      membersCount: row.membersCount,
    }));
  const switcherSuppressionNote =
    hiddenFromSwitcher.length > 0
      ? `${hiddenFromSwitcher.length} duplicate org(s) hidden from the normal workspace switcher; shown here for manual review only. No organizations were modified.`
      : null;
  let duplicateOrganizationWarning: string | null = null;
  if (duplicateGroups.length > 0) {
    duplicateOrganizationWarning = `Found ${duplicateGroups.length} duplicate group(s) (${duplicateOrgIds.size} org document(s)) with similar name/legalName for the same owner. Manual merge review required — no automatic action taken.`;
  }
  const switcherDuplicateExplanation = explainSwitcherDuplicates({
    companyWorkspaces: organizations.map((o) => ({
      id: o.orgId,
      orgId: o.orgId,
      name: o.name,
    })),
    duplicateGroups,
  });
  let migrationRiskLevel: "low" | "medium" | "high" = "low";
  if (duplicateGroups.some((g) => g.riskLevel === "high")) {
    migrationRiskLevel = "high";
  } else if (duplicateGroups.length > 0 || crossListProjects.length > 0) {
    migrationRiskLevel = "medium";
  }
  const manualCleanupPlan: string[] = [
    "1. Open this report and note canonicalOrganizationId vs the empty/legacy duplicate orgId(s).",
    "2. In Firebase Console, compare both organizations/{orgId} documents (createdAt, source, ownerUid) — do not delete yet.",
    "3. Confirm which org holds live projects (projectsCount column) and active billing, if any.",
    "4. Switch workspace in the header to each org and verify dashboard/projects match expectations.",
    "5. Phase 2+ only: plan merge or archive of the non-canonical org after explicit human approval — never auto-delete.",
  ];
  if (ambiguousProjects.length > 0) {
    notes.push(
      `${ambiguousProjects.length} project(s) have unclear workspace assignment (orgId vs workspaceType mismatch).`
    );
  }
  if (crossListProjects.length > 0) {
    notes.push(
      `${crossListProjects.length} project(s) appear in both solo and company scopes — Phase 1 list queries will stop mixing them.`
    );
  }
  if (switcherDuplicateExplanation) {
    notes.push(switcherDuplicateExplanation);
  }
  if (activeWorkspaceId) {
    notes.push(`Currently active company workspace in session/profile hints: ${activeWorkspaceId}.`);
  }
  const companyProjectsCount = [...orgProjectsMap.values()].reduce(
    (sum, rows) => sum + rows.length,
    0
  );
  return {
    generatedAt: new Date().toISOString(),
    userId: uid,
    userEmail: input.userEmail ?? null,
    activeWorkspaceId,
    lastActiveWorkspaceId: lastActive,
    activeBusinessOrgId,
    organizations,
    ownedOrganizations,
    memberOrganizations,
    duplicateGroups,
    hiddenFromSwitcher,
    visibleSwitcherOrganizations,
    switcherSuppressionNote,
    switcherDuplicateExplanation,
    projectBuckets,
    ambiguousProjects: ambiguousProjects.slice(0, 20),
    crossListProjects,
    soloProjectsCount: soloProjects.length,
    companyProjectsCount,
    canonicalOrganizationId,
    canonicalOrganizationReason,
    duplicateOrganizationWarning,
    migrationRiskLevel,
    noAutomaticDeletion: true,
    manualCleanupPlan,
    notes,
  };
}
