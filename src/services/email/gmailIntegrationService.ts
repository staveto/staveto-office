import { getAuthInstance, getCallable } from "@/lib/firebase";
import { saveIntegrationEntry } from "@/services/organizations/appCenterSettings";

export const GMAIL_OAUTH_MESSAGE_CONNECTED = "staveto:gmail-connected";
export const GMAIL_OAUTH_MESSAGE_FAILED = "staveto:gmail-failed";

const OAUTH_NO_CLOUD_FALLBACK = new Set(["FORBIDDEN", "NOT_SIGNED_IN", "ORG_REQUIRED"]);

type GmailServerProbe = {
  adminHealthy?: boolean;
  preferCloudGmail?: boolean;
};

let gmailServerProbeCache: GmailServerProbe | null = null;

async function authHeaders(): Promise<HeadersInit> {
  const auth = getAuthInstance();
  const user = auth?.currentUser;
  if (!user) throw new Error("NOT_SIGNED_IN");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getGmailServerProbe(force = false): Promise<GmailServerProbe> {
  if (!force && gmailServerProbeCache) return gmailServerProbeCache;
  try {
    const res = await fetch("/api/gmail", { cache: "no-store" });
    gmailServerProbeCache = res.ok
      ? ((await res.json()) as GmailServerProbe)
      : { adminHealthy: false, preferCloudGmail: true };
  } catch {
    gmailServerProbeCache = { adminHealthy: false, preferCloudGmail: true };
  }
  return gmailServerProbeCache;
}

function shouldPreferCloudGmail(probe: GmailServerProbe): boolean {
  return probe.preferCloudGmail === true || probe.adminHealthy === false;
}

function appendQuery(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${value}`;
}

function oauthPopupReturnUrl(returnUrl: string): string {
  const relative = returnUrl.startsWith("/") ? returnUrl : `/${returnUrl}`;
  const absolute =
    typeof window !== "undefined" && !returnUrl.startsWith("http")
      ? `${window.location.origin}${relative}`
      : returnUrl;
  return appendQuery(absolute, "oauth_popup", "1");
}

function oauthAppOrigin(returnUrl: string): string {
  if (typeof window === "undefined") return "";
  if (returnUrl.startsWith("http")) return new URL(returnUrl).origin;
  return window.location.origin;
}

async function fetchGmailOAuthUrlFromCloudFunction(
  orgId: string,
  returnUrl: string
): Promise<string> {
  const popupReturn = oauthPopupReturnUrl(returnUrl);
  const callable = getCallable<
    { orgId: string; returnUrl?: string; appOrigin?: string },
    { url: string }
  >("gmailBuildAuthUrl");
  const res = await callable({
    orgId,
    returnUrl: popupReturn,
    appOrigin: oauthAppOrigin(returnUrl),
  });
  const url = res.data?.url;
  if (!url) throw new Error("OAUTH_START_FAILED");
  return url;
}

async function fetchGmailOAuthUrlFromLocalApi(
  orgId: string,
  returnUrl: string
): Promise<string> {
  const headers = await authHeaders();
  const popupReturn = oauthPopupReturnUrl(returnUrl);
  const params = new URLSearchParams({ orgId, returnUrl: popupReturn });
  const res = await fetch(`/api/gmail/oauth/start?${params.toString()}`, { headers });
  if (!res.ok) {
    let errorCode = "OAUTH_START_FAILED";
    try {
      const data = (await res.json()) as { errorCode?: string };
      errorCode = data.errorCode || errorCode;
    } catch {
      if (res.status === 503) errorCode = "GMAIL_NOT_CONFIGURED";
    }
    throw new Error(errorCode);
  }
  const data = (await res.json()) as { url: string };
  if (!data.url) throw new Error("OAUTH_START_FAILED");
  return data.url;
}

async function fetchGmailOAuthUrl(orgId: string, returnUrl: string): Promise<string> {
  const probe = await getGmailServerProbe();
  const preferCloud = shouldPreferCloudGmail(probe);

  const attempts = preferCloud
    ? [fetchGmailOAuthUrlFromCloudFunction, fetchGmailOAuthUrlFromLocalApi]
    : [fetchGmailOAuthUrlFromLocalApi, fetchGmailOAuthUrlFromCloudFunction];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      return await attempt(orgId, returnUrl);
    } catch (e) {
      const code = e instanceof Error ? e.message : "OAUTH_START_FAILED";
      if (OAUTH_NO_CLOUD_FALLBACK.has(code)) throw e;
      lastError = e instanceof Error ? e : new Error("OAUTH_START_FAILED");
    }
  }
  throw lastError ?? new Error("OAUTH_START_FAILED");
}

function openGoogleOAuthPopup(url: string): Window | null {
  const width = 520;
  const height = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "scrollbars=yes",
    "resizable=yes",
  ].join(",");
  return window.open(url, "staveto-gmail-oauth", features);
}

/** ClickUp-style: popup with Google account chooser; falls back to full redirect if blocked. */
export async function startGmailOAuth(orgId: string, returnUrl?: string): Promise<void> {
  const dest = returnUrl || "/app/inbox";
  const url = await fetchGmailOAuthUrl(orgId, dest);

  const popup = openGoogleOAuthPopup(url);
  if (!popup) {
    window.location.assign(url);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => cleanup(), 5 * 60 * 1000);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === GMAIL_OAUTH_MESSAGE_CONNECTED) {
        cleanup();
        gmailServerProbeCache = null;
        resolve();
      }
      if (event.data?.type === GMAIL_OAUTH_MESSAGE_FAILED) {
        cleanup();
        reject(new Error(event.data?.code || "OAUTH_FAILED"));
      }
    };

    const poll = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        resolve();
      }
    }, 400);

    function cleanup() {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
  });
}

/** Call from return page when opened inside OAuth popup. */
export function notifyGmailOAuthPopupResult(
  gmailStatus: string | null,
  oauthPopup: boolean
): boolean {
  if (!oauthPopup || typeof window === "undefined" || !window.opener) return false;

  const origin = window.location.origin;
  if (gmailStatus === "connected") {
    window.opener.postMessage({ type: GMAIL_OAUTH_MESSAGE_CONNECTED }, origin);
  } else if (gmailStatus) {
    window.opener.postMessage(
      { type: GMAIL_OAUTH_MESSAGE_FAILED, code: gmailStatus },
      origin
    );
  }
  window.close();
  return true;
}

export async function fetchGmailProbe(): Promise<{
  configured: boolean;
  oauthReady?: boolean;
  adminConfigured: boolean;
  adminHealthy?: boolean;
  preferCloudGmail?: boolean;
}> {
  const res = await fetch("/api/gmail", { cache: "no-store" });
  if (!res.ok) {
    return {
      configured: true,
      oauthReady: true,
      adminConfigured: false,
      adminHealthy: false,
      preferCloudGmail: true,
    };
  }
  return res.json() as Promise<{
    configured: boolean;
    oauthReady?: boolean;
    adminConfigured: boolean;
    adminHealthy?: boolean;
    preferCloudGmail?: boolean;
  }>;
}

export async function syncGmailInbox(orgId: string): Promise<{
  synced: number;
  newInquiries: number;
  threadsFound: number;
  failed: number;
  filteredOut: number;
}> {
  const headers = await authHeaders();
  const res = await fetch("/api/gmail/sync", {
    method: "POST",
    headers,
    body: JSON.stringify({ orgId }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { errorCode?: string };
    throw new Error(data.errorCode || "SYNC_FAILED");
  }
  return res.json() as Promise<{
    synced: number;
    newInquiries: number;
    threadsFound: number;
    failed: number;
    filteredOut: number;
  }>;
}

async function disconnectGmailViaCloudFunction(orgId: string): Promise<void> {
  const callable = getCallable<{ orgId: string }, { ok: boolean }>("gmailDisconnect");
  const res = await callable({ orgId });
  if (!res.data?.ok) throw new Error("DISCONNECT_FAILED");
}

async function disconnectGmailViaLocalApi(orgId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch("/api/gmail/sync", {
    method: "POST",
    headers,
    body: JSON.stringify({ orgId, action: "disconnect" }),
  });
  if (res.ok) return;

  let errorCode = "DISCONNECT_FAILED";
  try {
    const data = (await res.json()) as { errorCode?: string };
    errorCode = data.errorCode || errorCode;
  } catch {
    /* keep default */
  }
  throw new Error(errorCode);
}

async function disconnectGmailViaClient(orgId: string): Promise<void> {
  await saveIntegrationEntry(orgId, "gmail", {
    status: "not_connected",
    mode: "oauth",
  });
}

export async function disconnectGmail(orgId: string): Promise<void> {
  const probe = await getGmailServerProbe();
  const preferCloud = shouldPreferCloudGmail(probe);

  const attempts = preferCloud
    ? [
        () => disconnectGmailViaCloudFunction(orgId),
        () => disconnectGmailViaClient(orgId),
        () => disconnectGmailViaLocalApi(orgId),
      ]
    : [
        () => disconnectGmailViaLocalApi(orgId),
        () => disconnectGmailViaCloudFunction(orgId),
        () => disconnectGmailViaClient(orgId),
      ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      await attempt();
      gmailServerProbeCache = null;
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("DISCONNECT_FAILED");
    }
  }

  throw lastError ?? new Error("DISCONNECT_FAILED");
}

export async function replyToEmailInquiry(
  orgId: string,
  inquiryId: string,
  body: string
): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`/api/gmail/inquiries/${inquiryId}/reply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orgId, body }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { errorCode?: string };
    throw new Error(data.errorCode || "REPLY_FAILED");
  }
}

export async function generateInquiryReplyDraft(
  orgId: string,
  inquiryId: string,
  companyName?: string
): Promise<{ draft: string; missingInfo: string[] }> {
  const headers = await authHeaders();
  const res = await fetch(`/api/gmail/inquiries/${inquiryId}/draft-reply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orgId, companyName }),
  });
  if (!res.ok) {
    const data = (await res.json()) as { errorCode?: string };
    throw new Error(data.errorCode || "DRAFT_FAILED");
  }
  return res.json() as Promise<{ draft: string; missingInfo: string[] }>;
}

export async function startProjectFromEmailInquiry(input: {
  orgId: string;
  inquiryId: string;
  name?: string;
  attachmentIds?: string[];
  importAttachments?: boolean;
}): Promise<{ projectId: string; imported: number }> {
  const headers = await authHeaders();
  const res = await fetch(`/api/gmail/inquiries/${input.inquiryId}/start-project`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json()) as { errorCode?: string };
    throw new Error(data.errorCode || "START_PROJECT_FAILED");
  }
  return res.json() as Promise<{ projectId: string; imported: number }>;
}
