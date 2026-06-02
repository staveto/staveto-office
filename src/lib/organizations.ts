import type { Firestore } from "firebase/firestore";
import {
  getFirestoreInstance,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
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
  role: OrgMemberRole;
  status: OrgMemberStatus;
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
  const snap = await getDoc(doc(db, "organizations", orgId));
  return snap.exists() ? (snap.data() as Organization) : null;
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

const INACTIVE_ORG_STATUSES = new Set(["canceled", "cancelled", "disabled", "suspended", "deleted"]);

/** Organization is available for company workspace (mobile-aligned, additive fields). */
export function isOrganizationEligible(org: Organization | null): boolean {
  if (!org) return false;
  if (org.businessEnabled === false) return false;
  const status = org.status?.toLowerCase?.() ?? org.status;
  if (status && INACTIVE_ORG_STATUSES.has(status)) return false;
  if (
    status &&
    status !== "active" &&
    status !== "trialing" &&
    status !== "trial"
  ) {
    return false;
  }
  return true;
}

export async function getUserOrgMemberships(uid: string): Promise<OrgMembership[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const orgsSnap = await getDocs(collection(db, "organizations"));
  const result: OrgMembership[] = [];
  for (const orgDoc of orgsSnap.docs) {
    const org = orgDoc.data() as Organization;
    if (!isOrganizationEligible(org)) continue;

    const memberSnap = await getDoc(doc(db, "organizations", orgDoc.id, "members", uid));
    if (memberSnap.exists()) {
      const member = memberSnap.data() as OrgMember;
      if (!isOrgMemberActive(member)) continue;
      const isOwner = org.ownerUid === uid;
      const role = isOwner ? "owner" : String(member.role ?? "member");
      result.push({
        orgId: orgDoc.id,
        orgName: org.name?.trim() || "Firma",
        role,
      });
      continue;
    }

    if (org.ownerUid === uid) {
      await ensureOrgMemberForOwner(orgDoc.id, uid);
      result.push({
        orgId: orgDoc.id,
        orgName: org.name?.trim() || "Firma",
        role: "owner",
      });
    }
  }
  return result;
}

export type OrgMemberRow = OrgMemberWithId & { displayName?: string | null };

export async function listOrgMembers(orgId: string): Promise<OrgMemberRow[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const membersRef = collection(db, "organizations", orgId, "members");
  const snap = await getDocs(membersRef);
  const result: OrgMemberRow[] = [];
  for (const d of snap.docs) {
    const data = d.data() as OrgMember;
    if (data.status === "removed") continue;
    const displayName = await getMemberDisplayName(db, d.id);
    result.push({ uid: d.id, ...data, displayName: displayName ?? data.displayName ?? undefined });
  }
  return result;
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
