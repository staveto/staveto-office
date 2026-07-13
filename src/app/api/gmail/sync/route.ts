import { NextRequest, NextResponse } from "next/server";
import { verifyApiAuth, guardOrgManager } from "@/lib/apiAuth";
import { syncGmailInbox } from "@/lib/gmail/syncService";
import { disconnectGmail } from "@/lib/gmail/tokenStore";

export async function POST(request: NextRequest) {
  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: { orgId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  if (!orgId) {
    return NextResponse.json({ errorCode: "ORG_REQUIRED" }, { status: 400 });
  }

  const denied = await guardOrgManager(orgId, auth.uid, auth.email);
  if (denied) return denied;

  if (body.action === "disconnect") {
    try {
      await disconnectGmail(orgId, auth.uid);
      return NextResponse.json({ ok: true, disconnected: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "DISCONNECT_FAILED";
      if (msg === "ADMIN_NOT_CONFIGURED") {
        return NextResponse.json({ errorCode: "GMAIL_ADMIN_NOT_CONFIGURED" }, { status: 503 });
      }
      console.error("[gmail/sync disconnect]", e);
      return NextResponse.json({ errorCode: "DISCONNECT_FAILED" }, { status: 502 });
    }
  }

  try {
    const result = await syncGmailInbox(orgId, auth.uid);
    return NextResponse.json({ ok: true, connected: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SYNC_FAILED";
    // Expected states — quiet 200 so clients can stop auto-polling without terminal spam.
    if (msg === "GMAIL_NOT_CONNECTED") {
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "gmail_not_connected",
        synced: 0,
        newInquiries: 0,
        threadsFound: 0,
        failed: 0,
        filteredOut: 0,
      });
    }
    if (msg === "TOKEN_REFRESH_FAILED") {
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "TOKEN_REFRESH_FAILED",
        synced: 0,
        newInquiries: 0,
        threadsFound: 0,
        failed: 0,
        filteredOut: 0,
      });
    }
    if (msg === "GMAIL_NOT_CONFIGURED") {
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "gmail_not_configured",
        synced: 0,
        newInquiries: 0,
        threadsFound: 0,
        failed: 0,
        filteredOut: 0,
      });
    }
    if (msg === "ADMIN_NOT_CONFIGURED") {
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "gmail_admin_not_configured",
        synced: 0,
        newInquiries: 0,
        threadsFound: 0,
        failed: 0,
        filteredOut: 0,
      });
    }
    console.error("[gmail/sync]", e);
    return NextResponse.json({ errorCode: "SYNC_FAILED", message: msg }, { status: 502 });
  }
}
