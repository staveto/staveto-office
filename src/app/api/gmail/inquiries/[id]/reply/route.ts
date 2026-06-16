import { NextRequest, NextResponse } from "next/server";
import { verifyApiAuth, assertOrgManager } from "@/lib/apiAuth";
import { replyToInquiry } from "@/lib/gmail/inquiryActions";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { orgId?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!orgId || !text) {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const allowed = await assertOrgManager(orgId, auth.uid);
  if (!allowed) {
    return NextResponse.json({ errorCode: "FORBIDDEN" }, { status: 403 });
  }

  try {
    await replyToInquiry({ orgId, uid: auth.uid, inquiryId: id, body: text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "REPLY_FAILED";
    return NextResponse.json({ errorCode: msg }, { status: 502 });
  }
}
