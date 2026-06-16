import { NextRequest, NextResponse } from "next/server";
import { verifyApiAuth, assertOrgManager } from "@/lib/apiAuth";
import { importInquiryAttachments } from "@/lib/gmail/inquiryActions";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { orgId?: string; projectId?: string; attachmentIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds : [];
  if (!orgId || !projectId || attachmentIds.length === 0) {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const allowed = await assertOrgManager(orgId, auth.uid);
  if (!allowed) {
    return NextResponse.json({ errorCode: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const imported = await importInquiryAttachments({
      orgId,
      uid: auth.uid,
      inquiryId: id,
      projectId,
      attachmentIds,
    });
    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "IMPORT_FAILED";
    return NextResponse.json({ errorCode: msg }, { status: 502 });
  }
}
