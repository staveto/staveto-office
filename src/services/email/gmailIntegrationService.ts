import { getAuthInstance, getCallable } from "@/lib/firebase";

export const GMAIL_OAUTH_MESSAGE_CONNECTED = "staveto:gmail-connected";
export const GMAIL_OAUTH_MESSAGE_FAILED = "staveto:gmail-failed";

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

function appendQuery(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${value}`;
}

async function fetchGmailOAuthUrlFromCloudFunction(
  orgId: string,
  returnUrl: string
): Promise<string> {
  const popupReturn = appendQuery(returnUrl, "oauth_popup", "1");
  const callable = getCallable<{ orgId: string; returnUrl?: string }, { url: string }>(
    "gmailBuildAuthUrl"
  );
  const res = await callable({ orgId, returnUrl: popupReturn });
  const url = res.data?.url;
  if (!url) throw new Error("OAUTH_START_FAILED");
  return url;
}

async function fetchGmailOAuthUrl(orgId: string, returnUrl: string): Promise<string> {
  const headers = await authHeaders();
  const popupReturn = appendQuery(returnUrl, "oauth_popup", "1");
  const params = new URLSearchParams({ orgId, returnUrl: popupReturn });
  const res = await fetch(`/api/gmail/oauth/start?${params.toString()}`, { headers });
  if (!res.ok) {
    let errorCode = "OAUTH_START_FAILED";
    try {
      const data = (await res.json()) as { errorCode?: string };
      errorCode = data.errorCode || errorCode;
    } catch {
      if (res.status === 503) errorCode = "GMAIL_ADMIN_NOT_CONFIGURED";
    }
    if (errorCode === "GMAIL_ADMIN_NOT_CONFIGURED") {
      return fetchGmailOAuthUrlFromCloudFunction(orgId, returnUrl);
    }
    throw new Error(errorCode);
  }
  const data = (await res.json()) as { url: string };
  if (!data.url) throw new Error("OAUTH_START_FAILED");
  return data.url;
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
}> {
  const res = await fetch("/api/gmail");
  if (!res.ok) return { configured: true, oauthReady: true, adminConfigured: false };
  return res.json() as Promise<{
    configured: boolean;
    oauthReady?: boolean;
    adminConfigured: boolean;
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

export async function disconnectGmail(orgId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch("/api/gmail/sync", {
    method: "POST",
    headers,
    body: JSON.stringify({ orgId, action: "disconnect" }),
  });
  if (!res.ok) throw new Error("DISCONNECT_FAILED");
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
