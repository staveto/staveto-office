import { NextRequest, NextResponse } from "next/server";
import { verifyApiAuth, assertOrgMemberActive, requireAdminConfigured } from "@/lib/apiAuth";
import { listEmailInquiriesForOrg } from "@/lib/gmail/inquiryReadService";

export async function GET(request: NextRequest) {
  if (!requireAdminConfigured()) {
    return NextResponse.json({ errorCode: "GMAIL_ADMIN_NOT_CONFIGURED" }, { status: 503 });
  }

  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("orgId")?.trim() ?? "";
  if (!orgId) {
    return NextResponse.json({ errorCode: "ORG_REQUIRED" }, { status: 400 });
  }

  const allowed = await assertOrgMemberActive(orgId, auth.uid);
  if (!allowed) {
    return NextResponse.json({ errorCode: "FORBIDDEN" }, { status: 403 });
  }

  const businessOnly = request.nextUrl.searchParams.get("all") !== "1";

  try {
    const inquiries = await listEmailInquiriesForOrg(orgId, { businessOnly });
    return NextResponse.json({ ok: true, inquiries, businessOnly });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LOAD_FAILED";
    return NextResponse.json({ errorCode: "LOAD_FAILED", message: msg }, { status: 502 });
  }
}
