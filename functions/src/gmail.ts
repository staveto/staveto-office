import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createHmac, timingSafeEqual } from "crypto";
import { assertWorkspaceAccess } from "./permissions";

const gmailClientSecret = defineSecret("GMAIL_CLIENT_SECRET");

const STAVETO_WEB_CLIENT_ID =
  "255961550157-gaueraial600f02qa3qadki41fhvabit.apps.googleusercontent.com";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "openid",
  "email",
  "profile",
].join(" ");

type OAuthState = {
  orgId: string;
  uid: string;
  returnUrl: string;
  ts: number;
  appOrigin?: string;
};

function getClientId(): string {
  return process.env.GMAIL_CLIENT_ID?.trim() || STAVETO_WEB_CLIENT_ID;
}

function getClientSecret(): string {
  const s = gmailClientSecret.value()?.trim();
  if (!s) throw new Error("GMAIL_CLIENT_SECRET not set");
  return s;
}

function stateSecret(): string {
  return getClientSecret();
}

function encodeOAuthState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function decodeOAuthState(value: string): OAuthState | null {
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (!parsed.orgId || !parsed.uid || Date.now() - parsed.ts > 15 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function callbackUrl(): string {
  const region = process.env.FUNCTION_REGION || "europe-west1";
  const projectId = process.env.GCLOUD_PROJECT || "staveto-mvp-5f251";
  return `https://${region}-${projectId}.cloudfunctions.net/gmailOAuthCallback`;
}

function resolveAppOrigin(state: OAuthState): string {
  const fromState = state.appOrigin?.trim();
  if (fromState?.startsWith("http")) return fromState.replace(/\/$/, "");
  const returnUrl = state.returnUrl.trim();
  if (returnUrl.startsWith("http")) return new URL(returnUrl).origin;
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function resolveReturnPath(returnUrl: string): string {
  const trimmed = returnUrl.trim();
  if (trimmed.startsWith("http")) {
    const url = new URL(trimmed);
    return `${url.pathname}${url.search}`;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function stripOAuthPopupParam(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  const url = trimmed.startsWith("http")
    ? new URL(trimmed)
    : new URL(trimmed.startsWith("/") ? trimmed : `/${trimmed}`, "http://local");
  url.searchParams.delete("oauth_popup");
  const qs = url.searchParams.toString();
  if (trimmed.startsWith("http")) {
    return `${url.origin}${url.pathname}${qs ? `?${qs}` : ""}`;
  }
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}

function absoluteAppUrl(state: OAuthState, pathQuery: string, extraQuery?: string): string {
  const origin = resolveAppOrigin(state);
  const path = pathQuery.startsWith("/") ? pathQuery : `/${pathQuery}`;
  if (!extraQuery) return `${origin}${path}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${origin}${path}${sep}${extraQuery}`;
}

async function assertOrgManager(orgId: string, uid: string): Promise<void> {
  const db = admin.firestore();
  const access = await assertWorkspaceAccess(db, uid, orgId, orgId);
  if (!["owner", "admin", "manager"].includes(access.role)) {
    throw new HttpsError("permission-denied", "FORBIDDEN");
  }
}

async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  email?: string;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: callbackUrl(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  let email: string | undefined;
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { email?: string };
      email = profile.email;
    }
  } catch {
    /* optional */
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    email,
  };
}

async function saveConnection(
  orgId: string,
  uid: string,
  data: { email: string; refreshToken: string; accessToken: string; expiresIn: number }
) {
  const db = admin.firestore();
  const expiresAt = Timestamp.fromMillis(Date.now() + data.expiresIn * 1000);
  await db.doc(`organizations/${orgId}/gmailConnections/${uid}`).set(
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

async function resolveGmailActorUid(orgId: string, actingUid: string): Promise<string> {
  const db = admin.firestore();
  const direct = await db.doc(`organizations/${orgId}/gmailConnections/${actingUid}`).get();
  if (direct.exists) return actingUid;

  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  const connectedByUid = orgSnap.data()?.integrations?.gmail?.connectedByUid;
  if (typeof connectedByUid === "string" && connectedByUid) {
    const orgConn = await db.doc(`organizations/${orgId}/gmailConnections/${connectedByUid}`).get();
    if (orgConn.exists) return connectedByUid;
  }

  const connections = await db.collection(`organizations/${orgId}/gmailConnections`).limit(1).get();
  if (!connections.empty) return connections.docs[0]!.id;

  return actingUid;
}

async function disconnectConnection(orgId: string, uid: string): Promise<void> {
  const db = admin.firestore();
  const actorUid = await resolveGmailActorUid(orgId, uid);
  await db.doc(`organizations/${orgId}/gmailConnections/${actorUid}`).delete();
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

export const gmailOAuthCallback = onRequest(
  {
    region: "europe-west1",
    secrets: [gmailClientSecret],
    cors: false,
    invoker: "public",
  },
  async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const stateRaw = typeof req.query.state === "string" ? req.query.state : null;
    const error = typeof req.query.error === "string" ? req.query.error : null;
    const fallbackPath = "/app/settings/app-center?category=communication";

    if (error) {
      res.redirect(302, absoluteAppUrl({ orgId: "", uid: "", returnUrl: fallbackPath, ts: 0 }, fallbackPath, "gmail=error"));
      return;
    }
    if (!code || !stateRaw) {
      res.redirect(302, absoluteAppUrl({ orgId: "", uid: "", returnUrl: fallbackPath, ts: 0 }, fallbackPath, "gmail=missing"));
      return;
    }

    const state = decodeOAuthState(stateRaw);
    if (!state) {
      res.redirect(302, absoluteAppUrl({ orgId: "", uid: "", returnUrl: fallbackPath, ts: 0 }, fallbackPath, "gmail=state"));
      return;
    }

    const returnPath = resolveReturnPath(state.returnUrl);

    try {
      const tokens = await exchangeCode(code);
      if (!tokens.refreshToken) {
        res.redirect(302, absoluteAppUrl(state, returnPath, "gmail=no_refresh"));
        return;
      }
      await saveConnection(state.orgId, state.uid, {
        email: tokens.email || "gmail@connected",
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      });

      if (state.returnUrl.includes("oauth_popup=1")) {
        const success = new URL("/app/oauth/gmail/success", resolveAppOrigin(state));
        success.searchParams.set("oauth_popup", "1");
        if (tokens.email) success.searchParams.set("email", tokens.email);
        success.searchParams.set("return", stripOAuthPopupParam(returnPath));
        res.redirect(302, success.toString());
        return;
      }

      res.redirect(302, absoluteAppUrl(state, returnPath, "gmail=connected"));
    } catch (e) {
      console.error("[gmailOAuthCallback]", e);
      res.redirect(302, absoluteAppUrl(state, returnPath, "gmail=failed"));
    }
  }
);

export const gmailBuildAuthUrl = onCall(
  { region: "europe-west1", secrets: [gmailClientSecret], invoker: "public" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const orgId = typeof request.data?.orgId === "string" ? request.data.orgId.trim() : "";
    const returnUrl =
      typeof request.data?.returnUrl === "string"
        ? request.data.returnUrl.trim()
        : "/app/inbox";
    const appOrigin =
      typeof request.data?.appOrigin === "string" && request.data.appOrigin.trim().startsWith("http")
        ? request.data.appOrigin.trim()
        : returnUrl.startsWith("http")
          ? new URL(returnUrl).origin
          : undefined;
    if (!orgId) throw new HttpsError("invalid-argument", "orgId required");

    await assertOrgManager(orgId, request.auth.uid);

    const state: OAuthState = {
      orgId,
      uid: request.auth.uid,
      returnUrl,
      appOrigin,
      ts: Date.now(),
    };
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: callbackUrl(),
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state: encodeOAuthState(state),
    });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  }
);

export const gmailDisconnect = onCall(
  { region: "europe-west1", invoker: "public" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const orgId = typeof request.data?.orgId === "string" ? request.data.orgId.trim() : "";
    if (!orgId) throw new HttpsError("invalid-argument", "orgId required");

    await assertOrgManager(orgId, request.auth.uid);
    await disconnectConnection(orgId, request.auth.uid);
    return { ok: true };
  }
);
