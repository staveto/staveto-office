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
    await disconnectGmail(orgId, auth.uid);
    return NextResponse.json({ ok: true, disconnected: true });
  }

  try {
    const result = await syncGmailInbox(orgId, auth.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SYNC_FAILED";
    if (msg === "GMAIL_NOT_CONNECTED") {
      return NextResponse.json({ errorCode: "GMAIL_NOT_CONNECTED" }, { status: 400 });
    }
    if (msg === "TOKEN_REFRESH_FAILED") {
      return NextResponse.json({ errorCode: "TOKEN_REFRESH_FAILED" }, { status: 401 });
    }
    if (msg === "GMAIL_NOT_CONFIGURED") {
      return NextResponse.json({ errorCode: "GMAIL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (msg === "ADMIN_NOT_CONFIGURED") {
      return NextResponse.json({ errorCode: "GMAIL_ADMIN_NOT_CONFIGURED" }, { status: 503 });
    }
    console.error("[gmail/sync]", e);
    return NextResponse.json({ errorCode: "SYNC_FAILED", message: msg }, { status: 502 });
  }
}
