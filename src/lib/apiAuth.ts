import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, isAdminConfigured } from "@/lib/firebaseAdmin";

export type ApiAuthContext = {
  uid: string;
  email?: string;
};

/** Server-side Firebase Admin could not reach Firestore (expired/missing credentials). */
export class AdminUnavailableError extends Error {
  constructor(message = "ADMIN_UNAVAILABLE") {
    super(message);
    this.name = "AdminUnavailableError";
  }
}

/**
 * Firestore `.get()` only throws on infra errors (auth/credentials/network); a missing
 * doc resolves with `exists === false`. So any throw here means the server lost access,
 * not that the user lacks permission. Surface it as a distinct, actionable error.
 */
function rethrowAsAdminUnavailable(context: string, err: unknown): never {
  console.error(`[${context}]`, err);
  throw new AdminUnavailableError();
}

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
export async function assertOrgMemberActive(
  orgId: string,
  uid: string,
  email?: string
): Promise<boolean> {
  const db = getAdminDb();
  if (!db) throw new AdminUnavailableError();

  try {
    const orgSnap = await db.doc(`organizations/${orgId}`).get();
    if (!orgSnap.exists) return false;
    if (orgSnap.data()?.ownerUid === uid) return true;

    const member = await findOrgMemberAdmin(orgId, uid, email);
    if (!member) return false;
    const status = member.status?.toLowerCase?.() ?? member.status ?? "";
    return !status || status === "active" || status === "pending";
  } catch (err) {
    if (err instanceof AdminUnavailableError) throw err;
    return rethrowAsAdminUnavailable("assertOrgMemberActive", err);
  }
}

type OrgMemberAdminRow = { role: string; status?: string };

/** Match client `findOrgMemberForUser` — members/{uid}, members/{email}, or userId query. */
async function findOrgMemberAdmin(
  orgId: string,
  uid: string,
  email?: string
): Promise<OrgMemberAdminRow | null> {
  const db = getAdminDb();
  if (!db) throw new AdminUnavailableError();

  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) return null;
  if (orgSnap.data()?.ownerUid === uid) {
    return { role: "owner", status: "active" };
  }

  const readMember = (data: Record<string, unknown> | undefined): OrgMemberAdminRow | null => {
    if (!data) return null;
    const role = String(data.role ?? "").trim();
    if (!role) return null;
    return { role, status: typeof data.status === "string" ? data.status : undefined };
  };

  const directSnap = await db.doc(`organizations/${orgId}/members/${uid}`).get();
  const direct = readMember(directSnap.data() as Record<string, unknown> | undefined);
  if (direct) return direct;

  const emailKey = email?.trim().toLowerCase();
  if (emailKey) {
    const emailSnap = await db.doc(`organizations/${orgId}/members/${emailKey}`).get();
    const byEmail = readMember(emailSnap.data() as Record<string, unknown> | undefined);
    if (byEmail) return byEmail;
  }

  const querySnap = await db
    .collection(`organizations/${orgId}/members`)
    .where("userId", "==", uid)
    .limit(1)
    .get();
  if (!querySnap.empty) {
    return readMember(querySnap.docs[0]!.data() as Record<string, unknown>);
  }

  return null;
}

function isOrgManagerMember(member: OrgMemberAdminRow): boolean {
  const status = member.status?.toLowerCase?.() ?? member.status ?? "";
  if (status && status !== "active" && status !== "pending") return false;
  const role = member.role.toLowerCase();
  return role === "owner" || role === "admin" || role === "manager";
}

export async function assertOrgManager(
  orgId: string,
  uid: string,
  email?: string
): Promise<boolean> {
  try {
    const member = await findOrgMemberAdmin(orgId, uid, email);
    if (!member) return false;
    return isOrgManagerMember(member);
  } catch (err) {
    if (err instanceof AdminUnavailableError) throw err;
    return rethrowAsAdminUnavailable("assertOrgManager", err);
  }
}

export async function assertOrgMember(
  orgId: string,
  uid: string,
  email?: string
): Promise<boolean> {
  return assertOrgMemberActive(orgId, uid, email);
}

export function requireAdminConfigured(): boolean {
  return isAdminConfigured();
}

/**
 * Run an org authorization check and convert the outcome into an HTTP guard:
 * - allowed → `null` (caller proceeds)
 * - denied → 403 FORBIDDEN
 * - server lost DB access → 503 ADMIN_UNAVAILABLE (not a permission problem)
 */
async function guardOrg(
  check: () => Promise<boolean>
): Promise<NextResponse | null> {
  try {
    const allowed = await check();
    if (!allowed) {
      return NextResponse.json({ errorCode: "FORBIDDEN" }, { status: 403 });
    }
    return null;
  } catch (err) {
    if (err instanceof AdminUnavailableError) {
      return NextResponse.json({ errorCode: "ADMIN_UNAVAILABLE" }, { status: 503 });
    }
    throw err;
  }
}

export function guardOrgManager(
  orgId: string,
  uid: string,
  email?: string
): Promise<NextResponse | null> {
  return guardOrg(() => assertOrgManager(orgId, uid, email));
}

export function guardOrgMember(
  orgId: string,
  uid: string,
  email?: string
): Promise<NextResponse | null> {
  return guardOrg(() => assertOrgMemberActive(orgId, uid, email));
}

function isOrgOwnerOrAdminMember(member: OrgMemberAdminRow): boolean {
  const status = member.status?.toLowerCase?.() ?? member.status ?? "";
  if (status && status !== "active") return false;
  const role = member.role.toLowerCase();
  return role === "owner" || role === "admin";
}

export async function assertOrgOwnerOrAdmin(
  orgId: string,
  uid: string,
  email?: string
): Promise<boolean> {
  try {
    const db = getAdminDb();
    if (!db) throw new AdminUnavailableError();

    const orgSnap = await db.doc(`organizations/${orgId}`).get();
    if (!orgSnap.exists) return false;
    if (orgSnap.data()?.ownerUid === uid) return true;

    const member = await findOrgMemberAdmin(orgId, uid, email);
    if (!member) return false;
    return isOrgOwnerOrAdminMember(member);
  } catch (err) {
    if (err instanceof AdminUnavailableError) throw err;
    return rethrowAsAdminUnavailable("assertOrgOwnerOrAdmin", err);
  }
}

export function guardOrgOwnerOrAdmin(
  orgId: string,
  uid: string,
  email?: string
): Promise<NextResponse | null> {
  return guardOrg(() => assertOrgOwnerOrAdmin(orgId, uid, email));
}
