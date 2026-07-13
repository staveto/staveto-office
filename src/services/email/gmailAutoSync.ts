import { syncGmailInbox } from "./gmailIntegrationService";
import {
  GMAIL_SOFT_UNAVAILABLE_CODES,
  notifyEmailInboxChanged,
} from "./emailInquiryService";
import { dedupeInflight } from "@/lib/inflightCache";

/** Minimum gap between automatic sync runs for the same org. */
const MIN_GAP_MS = 45 * 1000;
/** Background interval while the app is open. */
export const GMAIL_AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000;
/** Faster polling while the customer inbox page is visible. */
export const GMAIL_INBOX_ACTIVE_SYNC_INTERVAL_MS = 45 * 1000;

const lastSyncedAt = new Map<string, number>();
/** Orgs where auto-sync should stay off until reconnect / force. */
const autoSyncDisabled = new Map<string, string>();

export function canAutoSyncGmail(orgId: string, force = false): boolean {
  if (!force && autoSyncDisabled.has(orgId)) return false;
  if (force) return true;
  const last = lastSyncedAt.get(orgId) ?? 0;
  return Date.now() - last >= MIN_GAP_MS;
}

export function isGmailAutoSyncDisabled(orgId: string): boolean {
  return autoSyncDisabled.has(orgId);
}

export function getGmailAutoSyncDisableReason(orgId: string): string | undefined {
  return autoSyncDisabled.get(orgId);
}

export function clearGmailAutoSyncDisable(orgId: string): void {
  autoSyncDisabled.delete(orgId);
}

export function disableGmailAutoSync(orgId: string, reason: string): void {
  autoSyncDisabled.set(orgId, reason);
}

export type GmailSyncResult = Awaited<ReturnType<typeof syncGmailInbox>> & {
  connected?: boolean;
  reason?: string;
};

/**
 * Sync Gmail inbox when due. Merges concurrent calls per org.
 * Returns null when skipped (too soon / not connected / disabled).
 */
export async function autoSyncGmailInbox(
  orgId: string,
  options?: { force?: boolean }
): Promise<GmailSyncResult | null> {
  if (!canAutoSyncGmail(orgId, options?.force)) return null;

  return dedupeInflight(`gmail-auto-sync:${orgId}`, async () => {
    if (!canAutoSyncGmail(orgId, options?.force)) return null;
    try {
      const result = await syncGmailInbox(orgId);
      if (result.connected === false) {
        disableGmailAutoSync(orgId, result.reason || "gmail_not_connected");
        return result;
      }
      clearGmailAutoSyncDisable(orgId);
      lastSyncedAt.set(orgId, Date.now());
      notifyEmailInboxChanged();
      return result;
    } catch (e) {
      const code = e instanceof Error ? e.message : "SYNC_FAILED";
      if (GMAIL_SOFT_UNAVAILABLE_CODES.has(code)) {
        disableGmailAutoSync(orgId, code);
        return {
          synced: 0,
          newInquiries: 0,
          threadsFound: 0,
          failed: 0,
          filteredOut: 0,
          connected: false,
          reason: code,
        };
      }
      throw e;
    }
  });
}
