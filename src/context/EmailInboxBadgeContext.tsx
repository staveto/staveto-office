"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import {
  EMAIL_INBOX_CHANGED_EVENT,
  fetchEmailInquiriesDetailed,
  subscribeEmailInquiries,
} from "@/services/email/emailInquiryService";
import {
  autoSyncGmailInbox,
  clearGmailAutoSyncDisable,
  GMAIL_AUTO_SYNC_INTERVAL_MS,
  isGmailAutoSyncDisabled,
} from "@/services/email/gmailAutoSync";
import { loadAppCenterSettings } from "@/services/organizations/appCenterSettings";

type EmailInboxBadgeContextValue = {
  unreadCount: number;
  loading: boolean;
  visible: boolean;
  gmailConnected: boolean;
};

const EmailInboxBadgeContext = createContext<EmailInboxBadgeContextValue>({
  unreadCount: 0,
  loading: false,
  visible: false,
  gmailConnected: false,
});

export function EmailInboxBadgeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);

  const orgId =
    activeWorkspace?.type === "company"
      ? activeWorkspace.orgId ?? activeWorkspace.id
      : undefined;

  const visible = useMemo(
    () =>
      !!user?.id &&
      !!orgId &&
      isCompanyWorkspaceType(activeWorkspace?.type ?? "personal") &&
      canManageCompanyOperations(activeWorkspace?.role),
    [user?.id, orgId, activeWorkspace?.type, activeWorkspace?.role]
  );

  useEffect(() => {
    if (authLoading || !visible || !orgId) {
      setUnreadCount(0);
      setLoading(false);
      setGmailConnected(false);
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | undefined;
    let syncTimer: number | undefined;
    let onChanged: (() => void) | undefined;
    let onFocus: (() => void) | undefined;

    const stopSyncTimer = () => {
      if (syncTimer != null) {
        window.clearInterval(syncTimer);
        syncTimer = undefined;
      }
    };

    const detachListeners = () => {
      if (onChanged) window.removeEventListener(EMAIL_INBOX_CHANGED_EVENT, onChanged);
      if (onFocus) window.removeEventListener("focus", onFocus);
      onChanged = undefined;
      onFocus = undefined;
    };

    setLoading(true);

    void (async () => {
      try {
        const settings = await loadAppCenterSettings(orgId);
        if (cancelled) return;
        const connected = settings.integrations.gmail?.status === "connected";
        setGmailConnected(connected);

        if (!connected) {
          setUnreadCount(0);
          setLoading(false);
          return;
        }

        clearGmailAutoSyncDisable(orgId);

        unsub = subscribeEmailInquiries(
          orgId,
          (rows) => {
            if (cancelled) return;
            setUnreadCount(rows.filter((r) => r.unread).length);
            setLoading(false);
          },
          () => {
            if (cancelled) return;
            setUnreadCount(0);
            setLoading(false);
          },
          { poll: true }
        );

        onChanged = () => {
          if (isGmailAutoSyncDisabled(orgId)) return;
          void fetchEmailInquiriesDetailed(orgId)
            .then((result) => {
              if (cancelled) return;
              if (!result.connected) {
                setGmailConnected(false);
                setUnreadCount(0);
                stopSyncTimer();
                unsub?.();
                detachListeners();
                return;
              }
              setUnreadCount(result.inquiries.filter((r) => r.unread).length);
            })
            .catch(() => undefined);
        };
        onFocus = () => onChanged?.();
        window.addEventListener(EMAIL_INBOX_CHANGED_EVENT, onChanged);
        window.addEventListener("focus", onFocus);

        const syncTick = () => {
          if (isGmailAutoSyncDisabled(orgId)) {
            stopSyncTimer();
            return;
          }
          void autoSyncGmailInbox(orgId)
            .then((result) => {
              if (cancelled) return;
              if (result && result.connected === false) {
                setGmailConnected(false);
                setUnreadCount(0);
                stopSyncTimer();
                unsub?.();
                detachListeners();
              }
            })
            .catch(() => undefined);
        };
        syncTick();
        syncTimer = window.setInterval(syncTick, GMAIL_AUTO_SYNC_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          setGmailConnected(false);
          setUnreadCount(0);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
      stopSyncTimer();
      detachListeners();
    };
  }, [authLoading, visible, orgId]);

  const value = useMemo(
    () => ({ unreadCount, loading, visible, gmailConnected }),
    [unreadCount, loading, visible, gmailConnected]
  );

  return (
    <EmailInboxBadgeContext.Provider value={value}>
      {children}
    </EmailInboxBadgeContext.Provider>
  );
}

export function useEmailInboxBadge() {
  return useContext(EmailInboxBadgeContext);
}

export function getEmailInboxBadgeForItem(
  itemId: string,
  unreadCount: number,
  visible: boolean
): number {
  if (!visible || itemId !== "jobs-inbox" || unreadCount <= 0) return 0;
  return unreadCount;
}
