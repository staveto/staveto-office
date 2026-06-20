import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  verifyApiAuth,
  guardOrgMember,
  requireAdminConfigured,
} from "@/lib/apiAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  getEmailInquiryForOrg,
  listEmailInquiryMessagesForOrg,
} from "@/lib/gmail/inquiryReadService";
import { generateInquiryReplyDraft } from "@/lib/gmail/replyDraftService";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!requireAdminConfigured()) {
    return NextResponse.json({ errorCode: "GMAIL_ADMIN_NOT_CONFIGURED" }, { status: 503 });
  }

  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await context.params;
  let body: { orgId?: string; companyName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  if (!orgId || !id) {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const denied = await guardOrgMember(orgId, auth.uid, auth.email);
  if (denied) return denied;

  const inquiry = await getEmailInquiryForOrg(orgId, id);
  if (!inquiry) {
    return NextResponse.json({ errorCode: "INQUIRY_NOT_FOUND" }, { status: 404 });
  }

  const messages = await listEmailInquiryMessagesForOrg(orgId, id);
  const inbound = messages.filter((m) => m.direction === "inbound");
  const threadBody = inbound.map((m) => m.bodyText).join("\n\n") || inquiry.snippet;

  let companyName =
    typeof body.companyName === "string" && body.companyName.trim()
      ? body.companyName.trim()
      : "";

  if (!companyName) {
    const db = getAdminDb();
    const orgSnap = await db?.doc(`organizations/${orgId}`).get();
    companyName =
      String(orgSnap?.data()?.name ?? orgSnap?.data()?.companyName ?? "").trim() ||
      "Staveto";
  }

  try {
    const result = await generateInquiryReplyDraft({
      companyName,
      customerName: inquiry.fromName,
      customerEmail: inquiry.fromEmail,
      subject: inquiry.subject,
      threadBody,
      ai: inquiry.ai,
    });

    const db = getAdminDb();
    if (db) {
      await db
        .collection("organizations")
        .doc(orgId)
        .collection("emailInquiries")
        .doc(id)
        .set(
          {
            ai: {
              ...inquiry.ai,
              suggestedReply: result.draft,
              missingInfo: result.missingInfo,
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DRAFT_FAILED";
    return NextResponse.json({ errorCode: "DRAFT_FAILED", message: msg }, { status: 502 });
  }
}
