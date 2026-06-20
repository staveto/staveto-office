import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyApiAuth, guardOrgMember, requireAdminConfigured } from "@/lib/apiAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  getEmailInquiryForOrg,
  listEmailInquiryMessagesForOrg,
} from "@/lib/gmail/inquiryReadService";

export async function GET(
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
  const orgId = request.nextUrl.searchParams.get("orgId")?.trim() ?? "";
  if (!orgId || !id) {
    return NextResponse.json({ errorCode: "BAD_REQUEST" }, { status: 400 });
  }

  const denied = await guardOrgMember(orgId, auth.uid, auth.email);
  if (denied) return denied;

  try {
    const [inquiry, messages] = await Promise.all([
      getEmailInquiryForOrg(orgId, id),
      listEmailInquiryMessagesForOrg(orgId, id),
    ]);
    if (!inquiry) {
      return NextResponse.json({ errorCode: "INQUIRY_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, inquiry, messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LOAD_FAILED";
    return NextResponse.json({ errorCode: "LOAD_FAILED", message: msg }, { status: 502 });
  }
}

export async function PATCH(
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
  let body: { orgId?: string; unread?: boolean; status?: string };
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

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ errorCode: "GMAIL_ADMIN_NOT_CONFIGURED" }, { status: 503 });
  }

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof body.unread === "boolean") patch.unread = body.unread;
  if (body.status === "ignored") {
    patch.status = "ignored";
    patch.unread = false;
  }

  await db
    .collection("organizations")
    .doc(orgId)
    .collection("emailInquiries")
    .doc(id)
    .set(patch, { merge: true });

  return NextResponse.json({ ok: true });
}
