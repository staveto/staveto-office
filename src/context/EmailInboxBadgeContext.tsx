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
  subscribeEmailInquiries,
} from "@/services/email/emailInquiryService";
import {
  autoSyncGmailInbox,
  GMAIL_AUTO_SYNC_INTERVAL_MS,
} from "@/services/email/gmailAutoSync";

type EmailInboxBadgeContextValue = {
  unreadCount: number;
  loading: boolean;
  visible: boolean;
};

const EmailInboxBadgeContext = createContext<EmailInboxBadgeContextValue>({
  unreadCount: 0,
  loading: false,
  visible: false,
});

export function EmailInboxBadgeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

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
      return;
    }

    setLoading(true);
    const unsub = subscribeEmailInquiries(
      orgId,
      (rows) => {
        setUnreadCount(rows.filter((r) => r.unread).length);
        setLoading(false);
      },
      () => {
        setUnreadCount(0);
        setLoading(false);
      }
    );

    const onChanged = () => {
      /* subscribeEmailInquiries will pick up on next poll; force immediate read */
      void import("@/services/email/emailInquiryService").then(({ fetchEmailInquiries }) =>
        fetchEmailInquiries(orgId)
          .then((rows) => setUnreadCount(rows.filter((r) => r.unread).length))
          .catch(() => undefined)
      );
    };

    window.addEventListener(EMAIL_INBOX_CHANGED_EVENT, onChanged);
    const onFocus = () => onChanged();
    window.addEventListener("focus", onFocus);

    const syncTick = () => {
      void autoSyncGmailInbox(orgId).catch(() => undefined);
    };
    syncTick();
    const syncTimer = window.setInterval(syncTick, GMAIL_AUTO_SYNC_INTERVAL_MS);

    return () => {
      unsub();
      window.removeEventListener(EMAIL_INBOX_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(syncTimer);
    };
  }, [authLoading, visible, orgId]);

  const value = useMemo(
    () => ({ unreadCount, loading, visible }),
    [unreadCount, loading, visible]
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
