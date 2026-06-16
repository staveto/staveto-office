import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { createHmac, timingSafeEqual } from "crypto";

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

type OAuthState = { orgId: string; uid: string; returnUrl: string; ts: number };

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
    const fallback = "/app/inbox";

    if (error) {
      res.redirect(302, `${fallback}?gmail=error`);
      return;
    }
    if (!code || !stateRaw) {
      res.redirect(302, `${fallback}?gmail=missing`);
      return;
    }

    const state = decodeOAuthState(stateRaw);
    if (!state) {
      res.redirect(302, `${fallback}?gmail=state`);
      return;
    }

    try {
      const tokens = await exchangeCode(code);
      if (!tokens.refreshToken) {
        res.redirect(302, `${state.returnUrl}?gmail=no_refresh`);
        return;
      }
      await saveConnection(state.orgId, state.uid, {
        email: tokens.email || "gmail@connected",
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      });
      const dest = state.returnUrl.includes("?")
        ? `${state.returnUrl}&gmail=connected`
        : `${state.returnUrl}?gmail=connected`;
      res.redirect(302, dest);
    } catch (e) {
      console.error("[gmailOAuthCallback]", e);
      res.redirect(302, `${fallback}?gmail=failed`);
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
    if (!orgId) throw new HttpsError("invalid-argument", "orgId required");

    const state: OAuthState = {
      orgId,
      uid: request.auth.uid,
      returnUrl,
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
