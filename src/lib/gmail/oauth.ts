import { createHmac, timingSafeEqual } from "crypto";
import {
  getGmailClientId,
  getGmailClientSecret,
  getGmailRedirectUri,
  GMAIL_SCOPES,
} from "./config";

export type OAuthState = {
  orgId: string;
  uid: string;
  returnUrl: string;
  ts: number;
  /** App origin for absolute redirects after cloud OAuth callback. */
  appOrigin?: string;
};

export function resolveOAuthAppOrigin(state: OAuthState, fallbackOrigin: string): string {
  const fromState = state.appOrigin?.trim();
  if (fromState?.startsWith("http")) return fromState.replace(/\/$/, "");
  const returnUrl = state.returnUrl.trim();
  if (returnUrl.startsWith("http")) return new URL(returnUrl).origin;
  return fallbackOrigin.replace(/\/$/, "");
}

export function resolveOAuthReturnPath(returnUrl: string, fallbackPath = "/app/settings/app-center"): string {
  const trimmed = returnUrl.trim();
  if (trimmed.startsWith("http")) {
    const url = new URL(trimmed);
    return `${url.pathname}${url.search}`;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}` || fallbackPath;
}

export function stripOAuthPopupParam(pathOrUrl: string): string {
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

function stateSecret(): string {
  return getGmailClientSecret() || "staveto-gmail-dev";
}

export function encodeOAuthState(state: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function decodeOAuthState(value: string): OAuthState | null {
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

export function buildGoogleAuthUrl(state: OAuthState, requestOrigin?: string): string {
  const clientId = getGmailClientId();
  if (!clientId) throw new Error("GMAIL_NOT_CONFIGURED");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGmailRedirectUri(requestOrigin),
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: encodeOAuthState(state),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  requestOrigin?: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  email?: string;
}> {
  const clientId = getGmailClientId();
  const clientSecret = getGmailClientSecret();
  if (!clientId || !clientSecret) throw new Error("GMAIL_NOT_CONFIGURED");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGmailRedirectUri(requestOrigin),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth token exchange failed: ${err}`);
  }

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

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const clientId = getGmailClientId();
  const clientSecret = getGmailClientSecret();
  if (!clientId || !clientSecret) throw new Error("GMAIL_NOT_CONFIGURED");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error("TOKEN_REFRESH_FAILED");
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}
