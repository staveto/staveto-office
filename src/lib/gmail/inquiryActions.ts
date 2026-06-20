import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, getAdminStorage } from "@/lib/firebaseAdmin";
import { mapArchetypeToFirestoreFields } from "@/lib/workTypes";
import { getValidAccessToken } from "./tokenStore";
import { downloadAttachment, getThreadMessages, sendGmailReply } from "./client";
import { extractJobData, buildRequestSummary, detectLocale } from "./requestInsights";
import type { ExtractedJobData } from "@/lib/emailInquiryTypes";

export async function replyToInquiry(opts: {
  orgId: string;
  uid: string;
  inquiryId: string;
  body: string;
}): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");

  const token = await getValidAccessToken(opts.orgId, opts.uid);
  if (!token) throw new Error("GMAIL_NOT_CONNECTED");

  const inquirySnap = await db
    .doc(`organizations/${opts.orgId}/emailInquiries/${opts.inquiryId}`)
    .get();
  if (!inquirySnap.exists) throw new Error("INQUIRY_NOT_FOUND");

  const inquiry = inquirySnap.data()!;
  const threadId = inquiry.gmailThreadId as string;
  const to = inquiry.fromEmail as string;
  const subject = inquiry.subject as string;

  const messages = await getThreadMessages(token.accessToken, threadId);
  const lastInbound = [...messages].reverse().find(
    (m) => m.fromEmail.toLowerCase() !== token.email.toLowerCase()
  );

  const sent = await sendGmailReply({
    accessToken: token.accessToken,
    fromEmail: token.email,
    to,
    subject,
    body: opts.body,
    threadId,
    inReplyToMessageId: lastInbound?.id,
  });

  await db
    .collection(`organizations/${opts.orgId}/emailInquiries/${opts.inquiryId}/messages`)
    .doc(sent.id)
    .set({
      gmailMessageId: sent.id,
      direction: "outbound",
      from: token.email,
      to,
      subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
      bodyText: opts.body,
      sentAt: new Date().toISOString(),
      attachments: [],
      updatedAt: FieldValue.serverTimestamp(),
    });

  await inquirySnap.ref.set(
    {
      status: "negotiating",
      lastMessageAt: new Date().toISOString(),
      snippet: opts.body.slice(0, 120),
      unread: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function startProjectFromInquiry(opts: {
  orgId: string;
  uid: string;
  inquiryId: string;
  workType?: string;
  name?: string;
}): Promise<{ projectId: string }> {
  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");

  const inquiryRef = db.doc(`organizations/${opts.orgId}/emailInquiries/${opts.inquiryId}`);
  const inquirySnap = await inquiryRef.get();
  if (!inquirySnap.exists) throw new Error("INQUIRY_NOT_FOUND");

  const inquiry = inquirySnap.data()!;
  if (inquiry.projectId) {
    return { projectId: inquiry.projectId as string };
  }

  const ai = inquiry.ai as Record<string, unknown> | undefined;
  const name =
    opts.name?.trim() ||
    (typeof ai?.suggestedTitle === "string" ? ai.suggestedTitle : "") ||
    (inquiry.subject as string) ||
    "Nový dopyt";

  const messagesSnap = await inquiryRef.collection("messages").orderBy("sentAt", "asc").get();
  const firstInbound = messagesSnap.docs.find((d) => d.data().direction === "inbound");
  const bodyText = firstInbound?.data().bodyText as string | undefined;

  // Prefill from the WHOLE inbound thread (latest reply first) so address / phone /
  // timeframe the customer provided later are carried into the project.
  const inboundThreadText =
    messagesSnap.docs
      .filter((d) => d.data().direction === "inbound")
      .reverse()
      .map((d) => String(d.data().bodyText || d.data().snippet || ""))
      .join("\n\n")
      .trim() || (bodyText ?? (inquiry.snippet as string) ?? "");

  const subject = (inquiry.subject as string) ?? "";
  const locale = detectLocale(`${subject}\n${inboundThreadText}`);
  const stored = (ai?.extracted as ExtractedJobData | undefined) ?? undefined;
  const extracted: ExtractedJobData =
    stored ??
    extractJobData({
      subject,
      threadText: inboundThreadText,
      customerName: (ai?.customerName as string) ?? (inquiry.fromName as string | undefined),
      customerEmail: (ai?.customerEmail as string) ?? (inquiry.fromEmail as string),
      locale,
    });

  const siteAddress = [extracted.address, extracted.city].filter(Boolean).join(", ") || null;
  const brief = buildRequestSummary(extracted, locale, bodyText || (inquiry.snippet as string) || "");

  const workType = (opts.workType as import("@/lib/workTypes").WorkType) || "customer_job";
  const engine = mapArchetypeToFirestoreFields(workType);

  const projectRef = await db.collection("projects").add({
    name,
    projectType: engine.projectType,
    workType: engine.workType,
    jobArchetype: engine.jobArchetype,
    ...(engine.jobWorkflowKind ? { jobWorkflowKind: engine.jobWorkflowKind } : {}),
    phase: "sales",
    lifecycleStatus: "new_request",
    salesStatus: "draft",
    quoteStatus: "none",
    orgId: opts.orgId,
    workspaceType: "team",
    workspaceId: opts.orgId,
    ownerId: opts.uid,
    source: "email",
    customerRequest: bodyText || inquiry.snippet,
    customerName: extracted.customerName ?? ai?.customerName ?? inquiry.fromName ?? null,
    customerEmail: extracted.email ?? ai?.customerEmail ?? inquiry.fromEmail,
    customerPhone: extracted.phone ?? null,
    siteAddress,
    locationCity: extracted.city ?? null,
    requestType: extracted.requestType ?? null,
    systemType: extracted.systemType ?? null,
    systemYear: extracted.systemYear ?? null,
    desiredTimeframe: extracted.desiredTimeframe ?? null,
    brief,
    emailInquiryId: opts.inquiryId,
    gmailThreadId: inquiry.gmailThreadId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await inquiryRef.set(
    {
      projectId: projectRef.id,
      status: "converted",
      unread: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { projectId: projectRef.id };
}

export async function importInquiryAttachments(opts: {
  orgId: string;
  uid: string;
  inquiryId: string;
  projectId: string;
  attachmentIds: string[];
}): Promise<number> {
  const db = getAdminDb();
  const storage = getAdminStorage();
  if (!db || !storage) throw new Error("ADMIN_NOT_CONFIGURED");

  const token = await getValidAccessToken(opts.orgId, opts.uid);
  if (!token) throw new Error("GMAIL_NOT_CONNECTED");

  const messagesSnap = await db
    .collection(`organizations/${opts.orgId}/emailInquiries/${opts.inquiryId}/messages`)
    .get();

  let imported = 0;
  const bucket = storage.bucket();

  for (const msgDoc of messagesSnap.docs) {
    const msg = msgDoc.data();
    const gmailMessageId = msg.gmailMessageId as string;
    const attachments = (msg.attachments as Array<Record<string, unknown>>) ?? [];

    for (const att of attachments) {
      const attId = att.id as string;
      if (!opts.attachmentIds.includes(attId)) continue;
      if (att.storagePath) continue;

      const gmailAttachmentId = att.gmailAttachmentId as string | undefined;
      if (!gmailAttachmentId) continue;

      const bytes = await downloadAttachment(token.accessToken, gmailMessageId, gmailAttachmentId);
      const fileName = (att.fileName as string) || "attachment";
      const safeName = fileName.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
      const storagePath = `projects/${opts.projectId}/documents/${Date.now()}_${safeName}`;

      await bucket.file(storagePath).save(Buffer.from(bytes), {
        contentType: (att.mimeType as string) || "application/octet-stream",
      });

      await db.collection(`projects/${opts.projectId}/documents`).add({
        fileName,
        mimeType: att.mimeType ?? "application/octet-stream",
        storagePath,
        uploadedBy: opts.uid,
        source: "gmail",
        emailInquiryId: opts.inquiryId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      att.storagePath = storagePath;
      att.importedToProjectId = opts.projectId;
      imported += 1;
    }

    await msgDoc.ref.set({ attachments }, { merge: true });
  }

  return imported;
}
