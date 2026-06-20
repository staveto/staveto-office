import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { classifyEmailWithAi } from "./emailClassifier";
import {
  getThreadMessages,
  listInboxMessages,
  type ParsedGmailMessage,
} from "./client";
import { getValidAccessToken } from "./tokenStore";
import { createIncomingEmailNotifications } from "./notifications";
import { isBusinessRelevantInquiry } from "./inquiryFilter";

function inquiriesRef(db: Firestore, orgId: string) {
  return db.collection("organizations").doc(orgId).collection("emailInquiries");
}

function inquiryMessagesRef(db: Firestore, orgId: string, inquiryId: string) {
  return inquiriesRef(db, orgId).doc(inquiryId).collection("messages");
}

export async function syncGmailInbox(orgId: string, uid: string): Promise<{
  synced: number;
  newInquiries: number;
  threadsFound: number;
  failed: number;
  filteredOut: number;
}> {
  const token = await getValidAccessToken(orgId, uid);
  if (!token) throw new Error("GMAIL_NOT_CONNECTED");

  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");

  const listed = await listInboxMessages(token.accessToken, 50);
  const threadIds = [...new Set(listed.map((m) => m.threadId).filter(Boolean))];

  let newInquiries = 0;
  let synced = 0;
  let failed = 0;
  let filteredOut = 0;

  for (const threadId of threadIds) {
    try {
    const existing = await inquiriesRef(db, orgId)
      .where("gmailThreadId", "==", threadId)
      .limit(1)
      .get();

    const messages = await getThreadMessages(token.accessToken, threadId);
    if (messages.length === 0) continue;

    const firstInbound =
      messages.find((m) => m.fromEmail.toLowerCase() !== token.email.toLowerCase()) ??
      messages[0];
    const last = messages[messages.length - 1]!;

    // Analyse the FULL inbound thread (latest message first → highest priority),
    // so details provided in later customer replies are recognised, not re-asked.
    const inboundThreadText = messages
      .filter((m) => m.fromEmail.toLowerCase() !== token.email.toLowerCase())
      .reverse()
      .map((m) => m.bodyText || m.snippet)
      .join("\n\n") || (firstInbound.bodyText || firstInbound.snippet);

    if (!existing.empty) {
      const inquiryRef = existing.docs[0]!.ref;
      const inquiryId = existing.docs[0]!.id;
      const prev = existing.docs[0]!.data();
      const ai = await classifyEmailWithAi(
        firstInbound.subject,
        inboundThreadText,
        firstInbound.fromEmail,
        firstInbound.fromName
      );
      const business = isBusinessRelevantInquiry({
        ai,
        fromEmail: firstInbound.fromEmail,
        subject: firstInbound.subject,
        snippet: last.snippet,
        status: prev.status === "converted" ? "converted" : undefined,
      });
      const status =
        prev.status === "converted"
          ? "converted"
          : business
            ? "new"
            : "ignored";

      await upsertMessages(db, orgId, inquiryId, messages, token.email);
      await inquiryRef.set(
        {
          snippet: last.snippet,
          lastMessageAt: last.sentAt,
          messageCount: messages.length,
          updatedAt: FieldValue.serverTimestamp(),
          unread:
            business &&
            last.fromEmail.toLowerCase() !== token.email.toLowerCase(),
          ai,
          status,
        },
        { merge: true }
      );
      if (!business) filteredOut += 1;
      synced += 1;
      continue;
    }

    const ai = await classifyEmailWithAi(
      firstInbound.subject,
      inboundThreadText,
      firstInbound.fromEmail,
      firstInbound.fromName
    );

    const business = isBusinessRelevantInquiry({
      ai,
      fromEmail: firstInbound.fromEmail,
      subject: firstInbound.subject,
      snippet: last.snippet,
    });
    const status = business ? "new" : "ignored";

    const inquiryRef = inquiriesRef(db, orgId).doc();

    await inquiryRef.set({
      orgId,
      gmailThreadId: threadId,
      subject: firstInbound.subject,
      fromEmail: firstInbound.fromEmail,
      fromName: firstInbound.fromName ?? null,
      snippet: last.snippet,
      status,
      ai,
      connectedByUid: uid,
      lastMessageAt: last.sentAt,
      unread: business,
      messageCount: messages.length,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await upsertMessages(db, orgId, inquiryRef.id, messages, token.email);

    if (business) {
      await createIncomingEmailNotifications({
        orgId,
        inquiryId: inquiryRef.id,
        subject: firstInbound.subject,
        fromEmail: firstInbound.fromEmail,
        intent: ai.intent,
        confidence: ai.confidence,
        excludeUid: uid,
      });
      newInquiries += 1;
    } else {
      filteredOut += 1;
    }

    synced += 1;
    } catch (err) {
      failed += 1;
      console.error("[gmail-sync] thread failed", { orgId, threadId, err });
    }
  }

  await db.doc(`organizations/${orgId}`).set(
    {
      integrations: {
        gmail: {
          lastSyncedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { synced, newInquiries, threadsFound: threadIds.length, failed, filteredOut };
}

async function upsertMessages(
  db: Firestore,
  orgId: string,
  inquiryId: string,
  messages: ParsedGmailMessage[],
  accountEmail: string
) {
  const col = inquiryMessagesRef(db, orgId, inquiryId);
  for (const msg of messages) {
    const direction =
      msg.fromEmail.toLowerCase() === accountEmail.toLowerCase()
        ? "outbound"
        : "inbound";
    await col.doc(msg.id).set(
      {
        gmailMessageId: msg.id,
        direction,
        from: msg.from,
        to: msg.to,
        subject: msg.subject,
        bodyText: msg.bodyText,
        bodyHtml: msg.bodyHtml ?? null,
        sentAt: msg.sentAt,
        attachments: msg.attachments.map((a) => ({
          ...a,
          selected: false,
        })),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}
