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
export type OrgMemberStatus = "active" | "invited" | "removed";

export type Organization = {
  name: string;
  ownerUid: string;
  seatLimit: number;
  plan: OrgPlan;
  createdAt: unknown;
  trialEndsAt?: unknown;
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

export async function getUserOrgMemberships(uid: string): Promise<{ orgId: string; orgName: string; role: OrgMemberRole }[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const orgsSnap = await getDocs(collection(db, "organizations"));
  const result: { orgId: string; orgName: string; role: OrgMemberRole }[] = [];
  for (const orgDoc of orgsSnap.docs) {
    const memberSnap = await getDoc(doc(db, "organizations", orgDoc.id, "members", uid));
    if (memberSnap.exists()) {
      const member = memberSnap.data() as OrgMember;
      if (member.status === "active") {
        const org = orgDoc.data() as Organization;
        result.push({
          orgId: orgDoc.id,
          orgName: org.name,
          role: member.role,
        });
      }
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
