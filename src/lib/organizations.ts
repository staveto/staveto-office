import type { Firestore } from "firebase/firestore";
import {
  getFirestoreInstance,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "./firebase";

export type OrgPlan = "TEAM_5" | "TEAM_15" | "TEAM_30";

export type OrgMemberRole = "admin" | "member";
/** Mobile + web member status values. */
export type OrgMemberStatus = "active" | "invited" | "removed" | string;

export type Organization = {
  name: string;
  ownerUid: string;
  seatLimit: number;
  plan: OrgPlan;
  createdAt: unknown;
  trialEndsAt?: unknown;
  /** Optional tenant subdomain (Monday-style). */
  slug?: string;
  domain?: string;
  subdomainEnabled?: boolean;
  slugUpdatedAt?: unknown;
  slugUpdatedBy?: string;
  /** Mobile-aligned org lifecycle (read-only optional fields). */
  status?: string;
  businessEnabled?: boolean;
  planCode?: string;
};

export type OrgMembership = {
  orgId: string;
  orgName: string;
  /** Raw role from Firestore (mobile: owner|admin|manager|…, web legacy: admin|member). */
  role: string;
};

export type OrgMember = {
  role: OrgMemberRole | string;
  status: OrgMemberStatus;
  /** Mobile convention: auth uid on membership doc. */
  userId?: string;
  email?: string;
  displayName?: string;
  invitedAt?: unknown;
  createdAt?: unknown;
};

export type OrgMemberWithId = OrgMember & { uid: string };

export type Invite = {
  orgId: string;
  emailLower: string;
  role: OrgMemberRole;
  invitedByUid: string;
  createdAt: unknown;
  status: "pending" | "accepted" | "revoked";
  token: string;
};

export type InviteWithId = Invite & { id: string };

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isFirestorePermissionDenied(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return (
    err?.code === "permission-denied" ||
    (typeof err?.message === "string" &&
      err.message.toLowerCase().includes("insufficient permissions"))
  );
}

export async function createOrganization(
  ownerUid: string,
  name: string,
  plan: OrgPlan = "TEAM_5"
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const orgRef = await addDoc(collection(db, "organizations"), {
    name,
    ownerUid,
    seatLimit: plan === "TEAM_5" ? 5 : plan === "TEAM_15" ? 15 : 30,
    plan,
    createdAt: serverTimestamp(),
  });
  const orgId = orgRef.id;
  await setDoc(doc(db, "organizations", orgId, "members", ownerUid), {
    role: "admin",
    status: "active",
    userId: ownerUid,
    createdAt: serverTimestamp(),
  });
  return orgId;
}

export async function createInvite(
  orgId: string,
  email: string,
  role: OrgMemberRole,
  invitedByUid: string
): Promise<{ inviteId: string; token: string }> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const emailLower = email.trim().toLowerCase();
  const token = randomToken();
  const inviteRef = await addDoc(collection(db, "invites"), {
    orgId,
    emailLower,
    role,
    invitedByUid,
    createdAt: serverTimestamp(),
    status: "pending",
    token,
  });
  return { inviteId: inviteRef.id, token };
}

export async function getOrCreateUserOrg(uid: string, email: string): Promise<string | null> {
  const memberships = await getUserOrgMemberships(uid);
  if (memberships.length > 0) return memberships[0].orgId;
  const orgId = await createOrganization(uid, "My Team", "TEAM_5");
  return orgId;
}

export async function getInviteByToken(token: string): Promise<Invite & { id: string } | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  const q = query(
    collection(db, "invites"),
    where("token", "==", token),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const inviteDoc = snap.docs[0];
  return { id: inviteDoc.id, ...inviteDoc.data() } as Invite & { id: string };
}

export async function acceptInvite(
  inviteId: string,
  uid: string,
  email: string
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const inviteSnap = await getDoc(doc(db, "invites", inviteId));
  if (!inviteSnap.exists()) throw new Error("Invite not found");
  const invite = inviteSnap.data() as Invite;
  if (invite.status !== "pending") throw new Error("Invite already used");
  const orgId = invite.orgId;
  await setDoc(doc(db, "organizations", orgId, "members", uid), {
    role: invite.role,
    status: "active",
    email: email.trim().toLowerCase(),
    createdAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, "invites", inviteId),
    { status: "accepted", acceptedAt: serverTimestamp() },
    { merge: true }
  );
  return orgId;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "organizations", orgId));
    return snap.exists() ? (snap.data() as Organization) : null;
  } catch (e) {
    if (isFirestorePermissionDenied(e)) return null;
    throw e;
  }
}

/**
 * Firestore project rules require `organizations/{orgId}/members/{uid}`.
 * Legacy orgs may only have `ownerUid` — heal so list/read queries succeed.
 */
export async function ensureOrgMemberForOwner(orgId: string, uid: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;

  const org = await getOrganization(orgId);
  if (!org || org.ownerUid !== uid) return;

  const memberRef = doc(db, "organizations", orgId, "members", uid);
  const memberSnap = await getDoc(memberRef);
  if (memberSnap.exists()) return;

  try {
    await setDoc(
      memberRef,
      {
        role: "admin",
        userId: uid,
        status: "active",
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    /* Rules may block write — rules update still required */
  }
}

/** Member is usable when active; mobile docs may omit `status`. */
export function isOrgMemberActive(member: Pick<OrgMember, "status">): boolean {
  const status = member.status?.toLowerCase?.() ?? member.status;
  if (!status) return true;
  if (status === "removed" || status === "invited") return false;
  return status === "active";
}

const INACTIVE_ORG_STATUSES = new Set([
  "canceled",
  "cancelled",
  "disabled",
  "suspended",
  "deleted",
  "removed",
]);

const DEFAULT_COMPANY_ROLES = new Set(["owner", "admin", "manager"]);

/** Roles that may receive company workspace as default (mobile owner/admin/manager). */
export function isDefaultCompanyRole(role: string): boolean {
  const r = String(role ?? "").toLowerCase();
  return DEFAULT_COMPANY_ROLES.has(r);
}

function resolveMembershipRole(
  org: Organization,
  member: OrgMember | null,
  memberDocId: string,
  uid: string
): string {
  if (org.ownerUid === uid) return "owner";
  if (!member) return "viewer";
  const raw = String(member.role ?? "member").toLowerCase();
  if (raw === "member") return "manager";
  if (raw === "viewer" || raw === "client") return raw;
  return raw;
}

export type OrgEligibilityContext = {
  uid: string;
  memberRole: string;
};

/**
 * Organization visible in workspace switcher (mobile-aligned, conservative).
 * Owners and pending_payment orgs remain available when user is owner/admin/manager.
 */
export function isOrganizationEligible(
  org: Organization | null,
  context?: OrgEligibilityContext
): boolean {
  if (!org) return false;

  const status = (org.status?.toLowerCase?.() ?? org.status ?? "").trim();
  if (status && INACTIVE_ORG_STATUSES.has(status)) return false;

  const isOwner = org.ownerUid === context?.uid;
  const role = (context?.memberRole ?? "").toLowerCase();
  const isManagerial =
    isOwner || role === "owner" || role === "admin" || role === "manager";

  if (org.businessEnabled === true) return true;
  if (isOwner) return true;
  if (!status) return true;
  if (status === "active" || status === "trialing" || status === "trial") return true;
  if (status === "pending_payment" && isManagerial) return true;

  if (org.businessEnabled === false && !isOwner) return false;

  return isManagerial || role === "worker" || role === "viewer";
}

function parseOrgIdFromMemberPath(path: string): string | null {
  const parts = path.split("/");
  if (parts.length >= 4 && parts[0] === "organizations" && parts[2] === "members") {
    return parts[1] ?? null;
  }
  return null;
}

async function findOrgMemberForUser(
  db: NonNullable<ReturnType<typeof getFirestoreInstance>>,
  orgId: string,
  uid: string
): Promise<{ member: OrgMember; memberDocId: string } | null> {
  const directRef = doc(db, "organizations", orgId, "members", uid);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) {
    return { member: directSnap.data() as OrgMember, memberDocId: uid };
  }

  try {
    const q = query(
      collection(db, "organizations", orgId, "members"),
      where("userId", "==", uid)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { member: d.data() as OrgMember, memberDocId: d.id };
    }
  } catch {
    // Index or rules — fall through
  }

  return null;
}

/** Mobile-style: collectionGroup on `members` filtered by userId. */
async function listMembershipsViaCollectionGroup(uid: string): Promise<OrgMembership[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  try {
    const snap = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", uid))
    );
    const byOrg = new Map<string, OrgMembership>();

    for (const memberDoc of snap.docs) {
      const orgId = parseOrgIdFromMemberPath(memberDoc.ref.path);
      if (!orgId || byOrg.has(orgId)) continue;

      const member = memberDoc.data() as OrgMember;
      if (!isOrgMemberActive(member)) continue;

      const org = await getOrganization(orgId);
      const role = resolveMembershipRole(
        org ?? { ownerUid: "", name: "", seatLimit: 5, plan: "TEAM_5", createdAt: null },
        member,
        memberDoc.id,
        uid
      );
      if (org && !isOrganizationEligible(org, { uid, memberRole: role })) continue;
      if (!org && !isOrgMemberActive(member)) continue;

      byOrg.set(orgId, {
        orgId,
        orgName: org?.name?.trim() || member.displayName?.trim() || "Firma",
        role,
      });
    }

    return [...byOrg.values()];
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[organizations] collectionGroup members failed", err);
    }
    return [];
  }
}

/**
 * Fallback when listing all `organizations` is denied (mobile production rules).
 * Probes known org ids from profile hints + direct member reads.
 */
async function listMembershipsViaOrgHints(
  uid: string,
  orgIdHints: string[]
): Promise<OrgMembership[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const unique = [...new Set(orgIdHints.map((id) => id.trim()).filter(Boolean))];
  const result: OrgMembership[] = [];

  for (const orgId of unique) {
    try {
      const org = await getOrganization(orgId);
      if (!org) continue;

      if (org.ownerUid === uid) {
        await ensureOrgMemberForOwner(orgId, uid);
        if (isOrganizationEligible(org, { uid, memberRole: "owner" })) {
          result.push({
            orgId,
            orgName: org.name?.trim() || "Firma",
            role: "owner",
          });
        }
        continue;
      }

      const found = await findOrgMemberForUser(db, orgId, uid);
      if (!found) continue;
      if (!isOrgMemberActive(found.member)) continue;

      const role = resolveMembershipRole(org, found.member, found.memberDocId, uid);
      if (!isOrganizationEligible(org, { uid, memberRole: role })) continue;

      result.push({
        orgId,
        orgName: org.name?.trim() || "Firma",
        role,
      });
    } catch (e) {
      if (isFirestorePermissionDenied(e)) continue;
      throw e;
    }
  }

  return result;
}

/** Orgs where the user is ownerUid — works when member docs omit userId (web legacy). */
async function listMembershipsViaOwnedOrganizations(uid: string): Promise<OrgMembership[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  try {
    const snap = await getDocs(
      query(collection(db, "organizations"), where("ownerUid", "==", uid))
    );
    const result: OrgMembership[] = [];

    for (const orgDoc of snap.docs) {
      const orgId = orgDoc.id;
      const org = orgDoc.data() as Organization;
      await ensureOrgMemberForOwner(orgId, uid);
      if (!isOrganizationEligible(org, { uid, memberRole: "owner" })) continue;

      result.push({
        orgId,
        orgName: org.name?.trim() || "Firma",
        role: "owner",
      });
    }

    return result;
  } catch (e) {
    if (isFirestorePermissionDenied(e)) return [];
    throw e;
  }
}

export type GetUserOrgMembershipsOptions = {
  /** e.g. users/{uid}.activeBusinessOrgId when collectionGroup is unavailable */
  orgIdHints?: string[];
};

export async function getUserOrgMemberships(
  uid: string,
  options?: GetUserOrgMembershipsOptions
): Promise<OrgMembership[]> {
  const fromGroup = await listMembershipsViaCollectionGroup(uid);
  let fromHints: OrgMembership[] = [];
  try {
    fromHints = await listMembershipsViaOrgHints(uid, options?.orgIdHints ?? []);
  } catch (e) {
    if (!isFirestorePermissionDenied(e)) throw e;
  }
  let fromOwned: OrgMembership[] = [];
  try {
    fromOwned = await listMembershipsViaOwnedOrganizations(uid);
  } catch (e) {
    if (!isFirestorePermissionDenied(e)) throw e;
  }
  const merged = new Map<string, OrgMembership>();

  for (const m of [...fromGroup, ...fromHints, ...fromOwned]) {
    const existing = merged.get(m.orgId);
    if (!existing || isDefaultCompanyRole(m.role)) {
      merged.set(m.orgId, m);
    }
  }

  return [...merged.values()];
}

export type OrgMemberRow = OrgMemberWithId & { displayName?: string | null };

export async function listOrgMembers(orgId: string): Promise<OrgMemberRow[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  try {
    const membersRef = collection(db, "organizations", orgId, "members");
    const snap = await getDocs(membersRef);
    const result: OrgMemberRow[] = [];
    for (const d of snap.docs) {
      const data = d.data() as OrgMember;
      if (data.status === "removed") continue;
      let displayName: string | null = null;
      try {
        displayName = await getMemberDisplayName(db, d.id);
      } catch (e) {
        if (!isFirestorePermissionDenied(e)) throw e;
      }
      result.push({
        uid: d.id,
        ...data,
        displayName: displayName ?? data.displayName ?? undefined,
      });
    }
    return result;
  } catch (e) {
    if (isFirestorePermissionDenied(e)) return [];
    throw e;
  }
}

export async function listOrgInvites(orgId: string): Promise<InviteWithId[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const q = query(
    collection(db, "invites"),
    where("orgId", "==", orgId),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InviteWithId));
}

export async function updateMemberRole(
  orgId: string,
  uid: string,
  role: OrgMemberRole
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const ref = doc(db, "organizations", orgId, "members", uid);
  await setDoc(ref, { role }, { merge: true });
}

export async function removeMember(orgId: string, uid: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const ref = doc(db, "organizations", orgId, "members", uid);
  await setDoc(ref, { status: "removed" }, { merge: true });
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await setDoc(
    doc(db, "invites", inviteId),
    { status: "revoked", revokedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getMemberDisplayName(db: Firestore, uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const d = snap.data() as { displayName?: string; firstName?: string; lastName?: string };
  if (d.displayName) return d.displayName;
  if (d.firstName || d.lastName) return [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || null;
  return null;
}
