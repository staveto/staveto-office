import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { EmailIntent } from "@/lib/emailInquiryTypes";

export async function createIncomingEmailNotifications(input: {
  orgId: string;
  inquiryId: string;
  subject: string;
  fromEmail: string;
  intent: EmailIntent;
  confidence: number;
  excludeUid?: string;
}): Promise<void> {
  const db = getAdminDb();
  if (!db) return;

  const membersSnap = await db.collection(`organizations/${input.orgId}/members`).get();
  const orgSnap = await db.doc(`organizations/${input.orgId}`).get();
  const ownerUid = orgSnap.data()?.ownerUid as string | undefined;

  const targetUids = new Set<string>();
  if (ownerUid) targetUids.add(ownerUid);
  for (const doc of membersSnap.docs) {
    const data = doc.data();
    if (data.status !== "active") continue;
    if (["owner", "admin", "manager"].includes(data.role)) {
      targetUids.add(doc.id);
    }
  }
  if (input.excludeUid) targetUids.delete(input.excludeUid);

  const notifId = `email-inquiry-${input.inquiryId}`;
  const payload = {
    type: "INCOMING_EMAIL",
    orgId: input.orgId,
    inquiryId: input.inquiryId,
    subject: input.subject,
    fromEmail: input.fromEmail,
    intent: input.intent,
    confidence: input.confidence,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };

  await Promise.all(
    [...targetUids].map((uid) =>
      Promise.all([
        db.doc(`users/${uid}/notifications/${notifId}`).set(payload, { merge: true }),
        db.doc(`notifications/${uid}_${notifId}`).set({ ...payload, userId: uid }, { merge: true }),
      ])
    )
  );
}
