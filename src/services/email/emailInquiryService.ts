import { waitForAuthUser } from "@/lib/firebase";
import type { EmailInquiry, EmailInquiryMessage } from "@/lib/emailInquiryTypes";

export const EMAIL_INBOX_CHANGED_EVENT = "staveto:email-inbox-changed";

/** Soft failures that should stop polling / auto-sync (not real outages). */
export const GMAIL_SOFT_UNAVAILABLE_CODES = new Set([
  "GMAIL_NOT_CONNECTED",
  "gmail_not_connected",
  "GMAIL_ADMIN_NOT_CONFIGURED",
  "gmail_admin_not_configured",
  "GMAIL_NOT_CONFIGURED",
  "gmail_not_configured",
  "ADMIN_UNAVAILABLE",
  "TOKEN_REFRESH_FAILED",
]);

export function notifyEmailInboxChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EMAIL_INBOX_CHANGED_EVENT));
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const user = await waitForAuthUser();
  if (!user) throw new Error("NOT_SIGNED_IN");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export type FetchEmailInquiriesResult = {
  inquiries: EmailInquiry[];
  connected: boolean;
  reason?: string;
};

/** Server-backed list (works when Firestore client rules block direct reads). */
export async function fetchEmailInquiries(
  orgId: string,
  opts?: { showAll?: boolean }
): Promise<EmailInquiry[]> {
  const result = await fetchEmailInquiriesDetailed(orgId, opts);
  return result.inquiries;
}

export async function fetchEmailInquiriesDetailed(
  orgId: string,
  opts?: { showAll?: boolean }
): Promise<FetchEmailInquiriesResult> {
  const headers = await authHeaders();
  const allParam = opts?.showAll ? "&all=1" : "";
  const res = await fetch(
    `/api/gmail/inquiries?orgId=${encodeURIComponent(orgId)}${allParam}`,
    { headers }
  );

  const data = (await res.json().catch(() => ({}))) as {
    inquiries?: EmailInquiry[];
    connected?: boolean;
    reason?: string;
    errorCode?: string;
  };

  if (res.ok) {
    return {
      inquiries: data.inquiries ?? [],
      connected: data.connected !== false,
      reason: data.reason,
    };
  }

  const code = data.errorCode || data.reason || "LOAD_FAILED";
  if (GMAIL_SOFT_UNAVAILABLE_CODES.has(code) || res.status === 503) {
    return {
      inquiries: [],
      connected: false,
      reason: code,
    };
  }

  throw new Error(code);
}

export async function fetchEmailInquiryDetail(
  orgId: string,
  inquiryId: string
): Promise<{ inquiry: EmailInquiry; messages: EmailInquiryMessage[] } | null> {
  const headers = await authHeaders();
  const res = await fetch(
    `/api/gmail/inquiries/${encodeURIComponent(inquiryId)}?orgId=${encodeURIComponent(orgId)}`,
    { headers }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { errorCode?: string };
    throw new Error(data.errorCode || "LOAD_FAILED");
  }
  const data = (await res.json()) as { inquiry?: EmailInquiry; messages?: EmailInquiryMessage[] };
  if (!data.inquiry) return null;
  return { inquiry: data.inquiry, messages: data.messages ?? [] };
}

export type SubscribeEmailInquiriesOptions = {
  /** When false, fetch once and do not poll. Default true. */
  poll?: boolean;
  pollIntervalMs?: number;
};

export function subscribeEmailInquiries(
  orgId: string,
  onData: (rows: EmailInquiry[]) => void,
  onError?: (e: Error) => void,
  options?: SubscribeEmailInquiriesOptions
): () => void {
  let cancelled = false;
  let timer: number | undefined;
  let pollingEnabled = options?.poll !== false;
  const intervalMs = options?.pollIntervalMs ?? 30_000;

  const clearPoll = () => {
    if (timer != null && typeof window !== "undefined") {
      window.clearInterval(timer);
      timer = undefined;
    }
  };

  const refresh = async () => {
    try {
      const result = await fetchEmailInquiriesDetailed(orgId);
      if (cancelled) return;
      onData(result.inquiries);
      if (!result.connected || (result.reason && GMAIL_SOFT_UNAVAILABLE_CODES.has(result.reason))) {
        pollingEnabled = false;
        clearPoll();
      }
    } catch (e) {
      if (!cancelled) onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  };

  void refresh();
  if (typeof window === "undefined") {
    return () => {
      cancelled = true;
    };
  }

  if (pollingEnabled) {
    timer = window.setInterval(() => {
      if (!pollingEnabled) {
        clearPoll();
        return;
      }
      void refresh();
    }, intervalMs);
  }

  return () => {
    cancelled = true;
    clearPoll();
  };
}

export async function getEmailInquiry(
  orgId: string,
  inquiryId: string
): Promise<EmailInquiry | null> {
  const detail = await fetchEmailInquiryDetail(orgId, inquiryId);
  return detail?.inquiry ?? null;
}

export async function listEmailInquiryMessages(
  orgId: string,
  inquiryId: string
): Promise<EmailInquiryMessage[]> {
  const detail = await fetchEmailInquiryDetail(orgId, inquiryId);
  return detail?.messages ?? [];
}

export async function markEmailInquiryRead(orgId: string, inquiryId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`/api/gmail/inquiries/${encodeURIComponent(inquiryId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ orgId, unread: false }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { errorCode?: string };
    throw new Error(data.errorCode || "UPDATE_FAILED");
  }
  notifyEmailInboxChanged();
}

export async function ignoreEmailInquiry(orgId: string, inquiryId: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`/api/gmail/inquiries/${encodeURIComponent(inquiryId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ orgId, status: "ignored" }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { errorCode?: string };
    throw new Error(data.errorCode || "UPDATE_FAILED");
  }
  notifyEmailInboxChanged();
}

export function getEmailInquiryHref(inquiryId: string): string {
  return `/app/inbox/${inquiryId}`;
}
