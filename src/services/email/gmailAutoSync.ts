import { syncGmailInbox } from "./gmailIntegrationService";
import { notifyEmailInboxChanged } from "./emailInquiryService";
import { dedupeInflight } from "@/lib/inflightCache";

/** Minimum gap between automatic sync runs for the same org. */
const MIN_GAP_MS = 45 * 1000;
/** Background interval while the app is open. */
export const GMAIL_AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000;
/** Faster polling while the customer inbox page is visible. */
export const GMAIL_INBOX_ACTIVE_SYNC_INTERVAL_MS = 45 * 1000;

const lastSyncedAt = new Map<string, number>();

export function canAutoSyncGmail(orgId: string, force = false): boolean {
  if (force) return true;
  const last = lastSyncedAt.get(orgId) ?? 0;
  return Date.now() - last >= MIN_GAP_MS;
}

export type GmailSyncResult = Awaited<ReturnType<typeof syncGmailInbox>>;

/**
 * Sync Gmail inbox when due. Merges concurrent calls per org.
 * Returns null when skipped (too soon after last sync).
 */
export async function autoSyncGmailInbox(
  orgId: string,
  options?: { force?: boolean }
): Promise<GmailSyncResult | null> {
  if (!canAutoSyncGmail(orgId, options?.force)) return null;

  return dedupeInflight(`gmail-auto-sync:${orgId}`, async () => {
    if (!canAutoSyncGmail(orgId, options?.force)) return null;
    const result = await syncGmailInbox(orgId);
    lastSyncedAt.set(orgId, Date.now());
    notifyEmailInboxChanged();
    return result;
  });
}
