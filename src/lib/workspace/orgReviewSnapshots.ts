/**
 * Phase 1.3 — read-only org metadata for duplicate review (production-safe).
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
import { getOrganization, listOrgMembers } from "@/lib/organizations";
import { readOrganizationProfile } from "@/lib/organizationProfile";
import { SOLO_WORKSPACE_ID } from "./workspaceContract";
import { countProfileFields, type OrgReviewSnapshot } from "./workspaceDuplicateReview";

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

async function loadOrgProjectsCount(orgId: string): Promise<number> {
  const db = getFirestoreInstance();
  if (!db) return 0;
  try {
    const snap = await getDocs(
      query(collection(db, "projects"), where("orgId", "==", orgId), limit(200))
    );
    return snap.size;
  } catch {
    return 0;
  }
}

export type OrgReviewHints = {
  lastActiveWorkspaceId?: string | null;
  activeBusinessOrgId?: string | null;
};

/** Read-only — used by switcher suppression and diagnostics. */
export async function fetchOrgReviewSnapshots(
  userId: string,
  orgIds: string[],
  hints?: OrgReviewHints
): Promise<OrgReviewSnapshot[]> {
  await waitForAuthUser();
  await ensureAuthTokenReady();

  const uid = userId.trim();
  const lastActive =
    hints?.lastActiveWorkspaceId?.trim() && hints.lastActiveWorkspaceId !== SOLO_WORKSPACE_ID
      ? hints.lastActiveWorkspaceId.trim()
      : null;
  const activeBusinessOrgId = hints?.activeBusinessOrgId?.trim() || null;
  const unique = [...new Set(orgIds.filter(Boolean))];
  const rows: OrgReviewSnapshot[] = [];

  for (const orgId of unique) {
    const org = await getOrganization(orgId);
    const profile = await readOrganizationProfile(orgId);
    let membersCount: number | null = null;
    try {
      membersCount = (await listOrgMembers(orgId)).length;
    } catch {
      membersCount = null;
    }
    const orgRaw = org as unknown as Record<string, unknown> | null;
    const legalName = profile?.profile?.legalName?.trim() || null;
    rows.push({
      orgId,
      name: legalName || org?.name?.trim() || orgId,
      legalName,
      ownerUid: org?.ownerUid ?? null,
      createdAt: formatTimestamp(org?.createdAt),
      source: typeof orgRaw?.source === "string" ? orgRaw.source : null,
      country: profile?.profile?.country?.trim() || null,
      membersCount,
      projectsCount: await loadOrgProjectsCount(orgId),
      profileFieldCount: countProfileFields(profile?.profile ?? null),
      isOwner: org?.ownerUid === uid,
      isMember: true,
      membershipRole: org?.ownerUid === uid ? "owner" : null,
      matchesLastActiveWorkspace: lastActive === orgId,
      matchesActiveBusinessOrg: activeBusinessOrgId === orgId,
    });
  }

  return rows;
}

export async function fetchOrgReviewSnapshotsForDev(
  userId: string,
  orgIds: string[],
  hints?: OrgReviewHints
): Promise<OrgReviewSnapshot[]> {
  if (process.env.NODE_ENV !== "development") return [];
  return fetchOrgReviewSnapshots(userId, orgIds, hints);
}
