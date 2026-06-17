import { waitForAuthUser } from "@/lib/firebase";
import type { EmailInquiry, EmailInquiryMessage } from "@/lib/emailInquiryTypes";

export const EMAIL_INBOX_CHANGED_EVENT = "staveto:email-inbox-changed";

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

/** Server-backed list (works when Firestore client rules block direct reads). */
export async function fetchEmailInquiries(
  orgId: string,
  opts?: { showAll?: boolean }
): Promise<EmailInquiry[]> {
  const headers = await authHeaders();
  const allParam = opts?.showAll ? "&all=1" : "";
  const res = await fetch(
    `/api/gmail/inquiries?orgId=${encodeURIComponent(orgId)}${allParam}`,
    { headers }
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { errorCode?: string };
    throw new Error(data.errorCode || "LOAD_FAILED");
  }
  const data = (await res.json()) as { inquiries?: EmailInquiry[] };
  return data.inquiries ?? [];
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

export function subscribeEmailInquiries(
  orgId: string,
  onData: (rows: EmailInquiry[]) => void,
  onError?: (e: Error) => void
): () => void {
  let cancelled = false;

  const refresh = async () => {
    try {
      const rows = await fetchEmailInquiries(orgId);
      if (!cancelled) onData(rows);
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
  const timer = window.setInterval(() => void refresh(), 30_000);
  return () => {
    cancelled = true;
    window.clearInterval(timer);
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
