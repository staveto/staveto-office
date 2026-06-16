import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { refreshAccessToken } from "./oauth";

export type GmailConnection = {
  uid: string;
  email: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: Timestamp;
  connectedAt: Timestamp;
  historyId?: string;
};

function connectionPath(orgId: string, uid: string) {
  return `organizations/${orgId}/gmailConnections/${uid}`;
}

export async function saveGmailConnection(
  orgId: string,
  uid: string,
  data: {
    email: string;
    refreshToken: string;
    accessToken: string;
    expiresIn: number;
  }
): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");

  const expiresAt = Timestamp.fromMillis(Date.now() + data.expiresIn * 1000);
  await db.doc(connectionPath(orgId, uid)).set(
    {
      uid,
      email: data.email,
      refreshToken: data.refreshToken,
      accessToken: data.accessToken,
      accessTokenExpiresAt: expiresAt,
      connectedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.doc(`organizations/${orgId}`).set(
    {
      integrations: {
        gmail: {
          status: "connected",
          mode: "oauth",
          email: data.email,
          connectedByUid: uid,
          connectedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getGmailConnection(
  orgId: string,
  uid: string
): Promise<GmailConnection | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.doc(connectionPath(orgId, uid)).get();
  if (!snap.exists) return null;
  return snap.data() as GmailConnection;
}

/** Gmail OAuth token is stored per connecting user; fall back to org integration uid. */
export async function resolveGmailActorUid(
  orgId: string,
  actingUid: string
): Promise<string | null> {
  const direct = await getGmailConnection(orgId, actingUid);
  if (direct?.refreshToken) return actingUid;

  const db = getAdminDb();
  if (!db) return null;

  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  const connectedByUid = orgSnap.data()?.integrations?.gmail?.connectedByUid;
  if (typeof connectedByUid === "string" && connectedByUid) {
    const orgConn = await getGmailConnection(orgId, connectedByUid);
    if (orgConn?.refreshToken) return connectedByUid;
  }

  const connections = await db.collection(`organizations/${orgId}/gmailConnections`).limit(1).get();
  if (!connections.empty) return connections.docs[0]!.id;

  return null;
}

export async function getValidAccessToken(
  orgId: string,
  uid: string
): Promise<{ accessToken: string; email: string } | null> {
  const actorUid = (await resolveGmailActorUid(orgId, uid)) ?? uid;
  const conn = await getGmailConnection(orgId, actorUid);
  if (!conn?.refreshToken) return null;

  const now = Date.now();
  const expiresAt = conn.accessTokenExpiresAt?.toMillis() ?? 0;
  if (conn.accessToken && expiresAt > now + 60_000) {
    return { accessToken: conn.accessToken, email: conn.email };
  }

  const refreshed = await refreshAccessToken(conn.refreshToken);
  const db = getAdminDb();
  if (!db) return null;

  const newExpires = Timestamp.fromMillis(Date.now() + refreshed.expiresIn * 1000);
  await db.doc(connectionPath(orgId, actorUid)).set(
    {
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: newExpires,
    },
    { merge: true }
  );

  return { accessToken: refreshed.accessToken, email: conn.email };
}

export async function disconnectGmail(orgId: string, uid: string): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error("ADMIN_NOT_CONFIGURED");
  await db.doc(connectionPath(orgId, uid)).delete();
  await db.doc(`organizations/${orgId}`).set(
    {
      integrations: {
        gmail: { status: "not_connected", mode: "oauth" },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
