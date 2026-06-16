import { NextRequest, NextResponse } from "next/server";
import { verifyApiAuth, assertOrgManager } from "@/lib/apiAuth";
import { startProjectFromInquiry, importInquiryAttachments } from "@/lib/gmail/inquiryActions";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: {
    orgId?: string;
    name?: string;
    workType?: string;
    attachmentIds?: string[];
    importAttachments?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  if (!orgId) {
    return NextResponse.json({ errorCode: "ORG_REQUIRED" }, { status: 400 });
  }

  const allowed = await assertOrgManager(orgId, auth.uid);
  if (!allowed) {
    return NextResponse.json({ errorCode: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const { projectId } = await startProjectFromInquiry({
      orgId,
      uid: auth.uid,
      inquiryId: id,
      name: body.name,
      workType: body.workType,
    });

    let imported = 0;
    if (body.importAttachments && Array.isArray(body.attachmentIds) && body.attachmentIds.length > 0) {
      imported = await importInquiryAttachments({
        orgId,
        uid: auth.uid,
        inquiryId: id,
        projectId,
        attachmentIds: body.attachmentIds,
      });
    }

    return NextResponse.json({ ok: true, projectId, imported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "START_PROJECT_FAILED";
    return NextResponse.json({ errorCode: msg }, { status: 502 });
  }
}
