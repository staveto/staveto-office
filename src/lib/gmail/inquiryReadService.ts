import { getAdminDb } from "@/lib/firebaseAdmin";
import type { EmailInquiry, EmailInquiryMessage } from "@/lib/emailInquiryTypes";
import { isBusinessRelevantInquiry } from "@/lib/gmail/inquiryFilter";

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toInquiry(id: string, data: Record<string, unknown>): EmailInquiry {
  return {
    id,
    orgId: String(data.orgId ?? ""),
    gmailThreadId: String(data.gmailThreadId ?? ""),
    subject: String(data.subject ?? ""),
    fromEmail: String(data.fromEmail ?? ""),
    fromName: typeof data.fromName === "string" ? data.fromName : undefined,
    snippet: String(data.snippet ?? ""),
    status: (data.status as EmailInquiry["status"]) ?? "new",
    ai: data.ai as EmailInquiry["ai"],
    projectId: typeof data.projectId === "string" ? data.projectId : undefined,
    connectedByUid: typeof data.connectedByUid === "string" ? data.connectedByUid : undefined,
    lastMessageAt: String(data.lastMessageAt ?? toIso(data.updatedAt) ?? ""),
    unread: data.unread === true,
    messageCount: typeof data.messageCount === "number" ? data.messageCount : 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function toMessage(id: string, data: Record<string, unknown>): EmailInquiryMessage {
  return {
    id,
    gmailMessageId: String(data.gmailMessageId ?? id),
    direction: data.direction === "outbound" ? "outbound" : "inbound",
    from: String(data.from ?? ""),
    to: String(data.to ?? ""),
    subject: String(data.subject ?? ""),
    bodyText: String(data.bodyText ?? ""),
    bodyHtml: typeof data.bodyHtml === "string" ? data.bodyHtml : undefined,
    sentAt: String(data.sentAt ?? ""),
    attachments: Array.isArray(data.attachments)
      ? (data.attachments as EmailInquiryMessage["attachments"])
      : [],
  };
}

function inquiriesCol(orgId: string) {
  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  return db.collection("organizations").doc(orgId).collection("emailInquiries");
}

export async function listEmailInquiriesForOrg(
  orgId: string,
  opts?: { businessOnly?: boolean }
): Promise<EmailInquiry[]> {
  const snap = await inquiriesCol(orgId).orderBy("lastMessageAt", "desc").get();
  const rows = snap.docs.map((d) => toInquiry(d.id, d.data() as Record<string, unknown>));
  if (opts?.businessOnly === false) return rows;
  return rows.filter((row) =>
    isBusinessRelevantInquiry({
      ai: row.ai,
      fromEmail: row.fromEmail,
      subject: row.subject,
      snippet: row.snippet,
      status: row.status,
    })
  );
}

export async function getEmailInquiryForOrg(
  orgId: string,
  inquiryId: string
): Promise<EmailInquiry | null> {
  const snap = await inquiriesCol(orgId).doc(inquiryId).get();
  if (!snap.exists) return null;
  return toInquiry(snap.id, snap.data() as Record<string, unknown>);
}

export async function listEmailInquiryMessagesForOrg(
  orgId: string,
  inquiryId: string
): Promise<EmailInquiryMessage[]> {
  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  const snap = await db
    .collection("organizations")
    .doc(orgId)
    .collection("emailInquiries")
    .doc(inquiryId)
    .collection("messages")
    .orderBy("sentAt", "asc")
    .get();
  return snap.docs.map((d) => toMessage(d.id, d.data() as Record<string, unknown>));
}
