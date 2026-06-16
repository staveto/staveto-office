/**
 * Staveto Firebase project default Web OAuth client (public).
 * Same as mobile google-services.json client_type 3.
 */
export const STAVETO_GOOGLE_WEB_CLIENT_ID =
  "255961550157-gaueraial600f02qa3qadki41fhvabit.apps.googleusercontent.com";

export const STAVETO_FIREBASE_PROJECT_ID = "staveto-mvp-5f251";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "openid",
  "email",
  "profile",
].join(" ");

export function getGmailClientId(): string {
  return (
    process.env.GMAIL_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GMAIL_CLIENT_ID?.trim() ||
    STAVETO_GOOGLE_WEB_CLIENT_ID
  );
}

export function getGmailClientSecret(): string | null {
  const secret =
    process.env.GMAIL_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    null;
  if (!secret || secret.length < 10) return null;
  return secret;
}

export function getGmailCloudCallbackUrl(): string {
  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    STAVETO_FIREBASE_PROJECT_ID;
  const region = process.env.FIREBASE_FUNCTIONS_REGION?.trim() || "europe-west1";
  return `https://${region}-${projectId}.cloudfunctions.net/gmailOAuthCallback`;
}

export function getGmailRedirectUri(requestOrigin?: string): string {
  const configured = process.env.GMAIL_REDIRECT_URI?.trim();
  if (configured) return configured;

  const origin = requestOrigin || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (origin) {
    return `${origin.replace(/\/$/, "")}/api/gmail/oauth/callback`;
  }

  return getGmailCloudCallbackUrl();
}

/** Client ID is always available; secret may live in Cloud Functions secrets. */
export function isGmailClientConfigured(): boolean {
  return !!getGmailClientId();
}

export function isGmailOAuthFullyConfigured(): boolean {
  return isGmailClientConfigured() && !!getGmailClientSecret();
}
