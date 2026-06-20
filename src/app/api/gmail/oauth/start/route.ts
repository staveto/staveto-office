import { NextRequest, NextResponse } from "next/server";
import { verifyApiAuth, guardOrgManager } from "@/lib/apiAuth";
import { isGmailClientConfigured, isGmailOAuthFullyConfigured } from "@/lib/gmail/config";
import { buildGoogleAuthUrl } from "@/lib/gmail/oauth";
import { isAdminConfigured } from "@/lib/firebaseAdmin";

export async function GET(request: NextRequest) {
  if (!isGmailClientConfigured()) {
    return NextResponse.json({ errorCode: "GMAIL_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isGmailOAuthFullyConfigured()) {
    return NextResponse.json({ errorCode: "GMAIL_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json({ errorCode: "GMAIL_ADMIN_NOT_CONFIGURED" }, { status: 503 });
  }

  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId")?.trim();
  if (!orgId) {
    return NextResponse.json({ errorCode: "ORG_REQUIRED" }, { status: 400 });
  }

  const denied = await guardOrgManager(orgId, auth.uid, auth.email);
  if (denied) return denied;

  try {
    const returnUrl =
      request.nextUrl.searchParams.get("returnUrl")?.trim() ||
      "/app/settings/app-center?category=communication";

    const origin = request.nextUrl.origin;
    const url = buildGoogleAuthUrl(
      { orgId, uid: auth.uid, returnUrl, ts: Date.now() },
      origin
    );

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[gmail/oauth/start]", err);
    return NextResponse.json({ errorCode: "OAUTH_START_FAILED" }, { status: 500 });
  }
}