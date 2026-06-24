"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, Mail, RefreshCw, RotateCcw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import { resolveGmailError } from "@/lib/gmail/errors";
import {
  disconnectGmail,
  startGmailOAuth,
  syncGmailInbox,
} from "@/services/email/gmailIntegrationService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  email?: string;
  onUpdated?: () => void | Promise<void>;
};

export function GmailManageDialog({
  open,
  onOpenChange,
  orgId,
  email,
  onUpdated,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await syncGmailInbox(orgId);
      setMessage(
        result.threadsFound === 0
          ? t("inbox.syncSuccessEmpty")
          : result.newInquiries > 0
            ? t("gmail.manage.syncSuccessNew", { count: result.newInquiries })
            : t("gmail.manage.syncSuccess")
      );
      await onUpdated?.();
    } catch (e) {
      setError(resolveGmailError(e, t));
    } finally {
      setSyncing(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setError(null);
    setMessage(null);
    try {
      await startGmailOAuth(orgId, "/app/settings/app-center?category=communication");
      setMessage(t("gmail.manage.reconnectSuccess"));
      await onUpdated?.();
    } catch (e) {
      setError(resolveGmailError(e, t));
    } finally {
      setReconnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      await disconnectGmail(orgId);
      await onUpdated?.();
      onOpenChange(false);
      setConfirmDisconnect(false);
    } catch (e) {
      setError(resolveGmailError(e, t));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setConfirmDisconnect(false);
      setMessage(null);
      setError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#1D376A]/10 text-[#1D376A]">
              <Mail className="size-5" aria-hidden />
            </div>
            <div>
              <DialogTitle>{t("gmail.manage.title")}</DialogTitle>
              <DialogDescription>{t("gmail.manage.subtitle")}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {email ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {email}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="justify-start bg-[#e06737] hover:bg-[#c9562d]"
            onClick={() => {
              onOpenChange(false);
              router.push("/app/inbox");
            }}
          >
            <Inbox className="mr-2 size-4" />
            {t("gmail.manage.openInbox")}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={syncing}
            onClick={() => void handleSync()}
          >
            {syncing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            {t("gmail.manage.sync")}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="justify-start"
            disabled={reconnecting}
            onClick={() => void handleReconnect()}
          >
            {reconnecting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 size-4" />
            )}
            {t("gmail.manage.reconnect")}
          </Button>

          {!confirmDisconnect ? (
            <Button
              type="button"
              variant="outline"
              className="justify-start border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => setConfirmDisconnect(true)}
            >
              <Unplug className="mr-2 size-4" />
              {t("gmail.manage.disconnect")}
            </Button>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{t("gmail.manage.disconnectConfirm")}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={disconnecting}
                  onClick={() => void handleDisconnect()}
                >
                  {disconnecting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  {t("gmail.manage.disconnectYes")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDisconnect(false)}
                >
                  {t("gmail.manage.disconnectNo")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
