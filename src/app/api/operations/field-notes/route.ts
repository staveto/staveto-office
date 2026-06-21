import { NextRequest, NextResponse } from "next/server";
import {
  verifyApiAuth,
  requireAdminConfigured,
  assertOrgMemberActive,
  AdminUnavailableError,
} from "@/lib/apiAuth";
import { listOpenSharedFieldNotesAdmin } from "@/lib/operations/fieldNotesAdminRead";
import { getAdminDb } from "@/lib/firebaseAdmin";

const OPS_VIEWER_ROLES = new Set(["owner", "admin", "manager", "accountant"]);

async function assertCanViewOrgFieldNotes(
  orgId: string,
  uid: string,
  email?: string
): Promise<boolean> {
  const db = getAdminDb();
  if (!db) throw new AdminUnavailableError();

  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) return false;
  if (orgSnap.data()?.ownerUid === uid) return true;

  const memberActive = await assertOrgMemberActive(orgId, uid, email);
  if (!memberActive) return false;

  const direct = await db.doc(`organizations/${orgId}/members/${uid}`).get();
  if (direct.exists) {
    const role = String(direct.data()?.role ?? "").toLowerCase();
    return OPS_VIEWER_ROLES.has(role);
  }

  const emailKey = email?.trim().toLowerCase();
  if (emailKey) {
    const byEmail = await db.doc(`organizations/${orgId}/members/${emailKey}`).get();
    if (byEmail.exists) {
      const role = String(byEmail.data()?.role ?? "").toLowerCase();
      return OPS_VIEWER_ROLES.has(role);
    }
  }

  const q = await db
    .collection(`organizations/${orgId}/members`)
    .where("userId", "==", uid)
    .limit(1)
    .get();
  if (!q.empty) {
    const role = String(q.docs[0]!.data()?.role ?? "").toLowerCase();
    return OPS_VIEWER_ROLES.has(role);
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!requireAdminConfigured()) {
    return NextResponse.json({ errorCode: "ADMIN_NOT_CONFIGURED" }, { status: 503 });
  }

  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId")?.trim() ?? "";
  if (!orgId) {
    return NextResponse.json({ errorCode: "ORG_REQUIRED" }, { status: 400 });
  }

  try {
    const allowed = await assertCanViewOrgFieldNotes(orgId, auth.uid, auth.email);
    if (!allowed) {
      return NextResponse.json({ errorCode: "FORBIDDEN" }, { status: 403 });
    }

    const notes = await listOpenSharedFieldNotesAdmin(orgId);
    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    if (e instanceof AdminUnavailableError) {
      return NextResponse.json({ errorCode: "ADMIN_UNAVAILABLE" }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : "LOAD_FAILED";
    return NextResponse.json({ errorCode: "LOAD_FAILED", message: msg }, { status: 502 });
  }
}
