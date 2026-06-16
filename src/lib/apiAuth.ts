import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebaseAdmin";

export type ApiAuthContext = {
  uid: string;
  email?: string;
};

export async function verifyApiAuth(request: NextRequest): Promise<ApiAuthContext | null> {
  const auth = getAdminAuth();
  if (!auth) return null;

  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;

  try {
    const decoded = await auth.verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/** Mirrors Firestore `isOrgMemberActive` — owner or active/pending member. */
export async function assertOrgMemberActive(orgId: string, uid: string): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;

  try {
    const orgSnap = await db.doc(`organizations/${orgId}`).get();
    if (!orgSnap.exists) return false;
    if (orgSnap.data()?.ownerUid === uid) return true;

    const memberSnap = await db.doc(`organizations/${orgId}/members/${uid}`).get();
    if (!memberSnap.exists) return false;
    const status = memberSnap.data()?.status;
    return !status || status === "active" || status === "pending";
  } catch (err) {
    console.error("[assertOrgMemberActive]", err);
    return false;
  }
}

export async function assertOrgManager(orgId: string, uid: string): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;

  try {
    const orgSnap = await db.doc(`organizations/${orgId}`).get();
    if (!orgSnap.exists) return false;
    const org = orgSnap.data();
    if (org?.ownerUid === uid) return true;

    const memberSnap = await db.doc(`organizations/${orgId}/members/${uid}`).get();
    if (!memberSnap.exists) return false;
    const role = memberSnap.data()?.role;
    const status = memberSnap.data()?.status;
    return (
      status === "active" &&
      (role === "owner" || role === "admin" || role === "manager")
    );
  } catch (err) {
    console.error("[assertOrgManager]", err);
    return false;
  }
}

export async function assertOrgMember(orgId: string, uid: string): Promise<boolean> {
  return assertOrgMemberActive(orgId, uid);
}

export function requireAdminConfigured(): boolean {
  return isAdminConfigured();
}
