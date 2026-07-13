import { NextRequest, NextResponse } from "next/server";
import {
  verifyApiAuth,
  guardOrgMember,
  requireAdminConfigured,
} from "@/lib/apiAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { listEmailInquiriesForOrg } from "@/lib/gmail/inquiryReadService";

async function isOrgGmailMarkedConnected(orgId: string): Promise<boolean | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.doc(`organizations/${orgId}`).get();
    const status = (snap.data() as { integrations?: { gmail?: { status?: string } } } | undefined)
      ?.integrations?.gmail?.status;
    if (status === "connected") return true;
    if (status === "not_connected" || status === "error" || status === "disconnected") return false;
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  // Expected local/dev state: admin SDK missing — do not 503-spam the terminal.
  if (!requireAdminConfigured()) {
    return NextResponse.json({
      ok: true,
      connected: false,
      inquiries: [],
      reason: "gmail_admin_not_configured",
    });
  }

  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId")?.trim() ?? "";
  if (!orgId) {
    return NextResponse.json({ errorCode: "ORG_REQUIRED" }, { status: 400 });
  }

  const denied = await guardOrgMember(orgId, auth.uid, auth.email);
  if (denied) return denied;

  const gmailConnected = await isOrgGmailMarkedConnected(orgId);
  if (gmailConnected === false) {
    return NextResponse.json({
      ok: true,
      connected: false,
      inquiries: [],
      reason: "gmail_not_connected",
    });
  }

  const businessOnly = request.nextUrl.searchParams.get("all") !== "1";

  try {
    const inquiries = await listEmailInquiriesForOrg(orgId, { businessOnly });
    return NextResponse.json({
      ok: true,
      connected: true,
      inquiries,
      businessOnly,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LOAD_FAILED";
    return NextResponse.json({ errorCode: "LOAD_FAILED", message: msg }, { status: 502 });
  }
}
