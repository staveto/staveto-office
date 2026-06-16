"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Sparkles, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { fetchEmailInquiries } from "@/services/email/emailInquiryService";
import type { EmailInquiry } from "@/lib/emailInquiryTypes";
import { startGmailOAuth, syncGmailInbox, notifyGmailOAuthPopupResult } from "@/services/email/gmailIntegrationService";
import { loadAppCenterSettings } from "@/services/organizations/appCenterSettings";
import { GmailConnectCard } from "@/components/inbox/GmailConnectCard";
import { resolveGmailError } from "@/lib/gmail/errors";
import { cn } from "@/lib/utils";

function intentLabel(intent: string | undefined, t: (k: string) => string): string {
  if (intent === "new_project") return t("inbox.intent.newProject");
  if (intent === "follow_up") return t("inbox.intent.followUp");
  if (intent === "invoice") return t("inbox.intent.invoice");
  return t("inbox.intent.other");
}

export function EmailInboxPage() {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspace();
  const orgId =
    activeWorkspace?.type === "company"
      ? activeWorkspace.orgId ?? activeWorkspace.id
      : undefined;

  const [rows, setRows] = useState<EmailInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const gmailStatus = searchParams.get("gmail");

  useEffect(() => {
    const oauthPopup = searchParams.get("oauth_popup") === "1";
    if (notifyGmailOAuthPopupResult(gmailStatus, oauthPopup)) return;

    if (gmailStatus === "connected") {
      setSuccess(t("inbox.connectedSuccess"));
    } else if (gmailStatus === "failed" || gmailStatus === "error") {
      setError(t("inbox.error.connect"));
    }
  }, [gmailStatus, t, searchParams]);

  const refreshGmailStatus = useCallback(async () => {
    if (!orgId) return;
    const settings = await loadAppCenterSettings(orgId);
    const gmail = settings.integrations.gmail;
    const connected = gmail?.status === "connected";
    setGmailConnected(connected);
    const email = (gmail as { email?: string } | undefined)?.email;
    setGmailEmail(typeof email === "string" ? email : undefined);
  }, [orgId]);

  useEffect(() => {
    void refreshGmailStatus();
  }, [refreshGmailStatus]);

  const loadInquiries = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEmailInquiries(orgId, { showAll });
      setRows(data);
      if (!showAll) {
        const all = await fetchEmailInquiries(orgId, { showAll: true });
        setTotalCount(all.length);
      } else {
        setTotalCount(data.length);
      }
    } catch (e) {
      setError(resolveGmailError(e, t));
    } finally {
      setLoading(false);
    }
  }, [orgId, t, user, authLoading, showAll]);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadInquiries();
  }, [authLoading, user, loadInquiries]);

  const unreadCount = useMemo(() => rows.filter((r) => r.unread).length, [rows]);

  const handleConnect = useCallback(async () => {
    if (!orgId) return;
    setConnecting(true);
    setError(null);
    try {
      await startGmailOAuth(orgId, "/app/inbox");
      await refreshGmailStatus();
    } catch (e) {
      setError(resolveGmailError(e, t));
    } finally {
      setConnecting(false);
    }
  }, [orgId, t]);

  const hiddenCount = Math.max(0, totalCount - rows.length);

  const handleSync = useCallback(async () => {
    if (!orgId) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await syncGmailInbox(orgId);
      if (result.threadsFound === 0) {
        setSuccess(t("inbox.syncSuccessEmpty"));
      } else if (result.newInquiries > 0) {
        setSuccess(
          result.filteredOut > 0
            ? t("inbox.syncSuccessNewFiltered", {
                count: result.newInquiries,
                filtered: result.filteredOut,
              })
            : t("inbox.syncSuccessNew", { count: result.newInquiries })
        );
      } else if (result.failed > 0) {
        setSuccess(t("inbox.syncSuccessPartial", { synced: result.synced, failed: result.failed }));
      } else {
        setSuccess(t("inbox.syncSuccessWithCount", { count: result.synced }));
      }
      await refreshGmailStatus();
      await loadInquiries();
    } catch (e) {
      setError(resolveGmailError(e, t));
    } finally {
      setSyncing(false);
    }
  }, [orgId, t, refreshGmailStatus, loadInquiries]);

  useEffect(() => {
    if (gmailStatus === "connected" && orgId && gmailConnected) {
      void handleSync();
    }
  }, [gmailStatus, orgId, gmailConnected, handleSync]);

  if (!orgId) {
    return <p className="text-sm text-muted-foreground">{t("inbox.error.noCompany")}</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-bold text-[#1D376A]">{t("inbox.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("inbox.subtitleFiltered")}</p>
        {unreadCount > 0 ? (
          <p className="mt-2 text-sm font-medium text-[#e06737]">
            {t("inbox.unreadCount", { count: unreadCount })}
          </p>
        ) : null}
      </header>

      {!gmailConnected ? (
        <GmailConnectCard loading={connecting} onConnect={() => void handleConnect()} />
      ) : (
        <GmailConnectCard
          connected
          connectedEmail={gmailEmail}
          syncing={syncing}
          onConnect={() => void handleConnect()}
          onSync={() => void handleSync()}
        />
      )}

      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {gmailConnected && !showAll && hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("inbox.filterHidden", { count: hiddenCount })}
        </p>
      ) : null}

      {gmailConnected ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowAll((v) => !v)}
          >
            <Filter className="mr-1.5 size-4" />
            {showAll ? t("inbox.showInquiriesOnly") : t("inbox.showAllEmails")}
          </Button>
        </div>
      ) : null}

      {!gmailConnected ? null : loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("inbox.loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="font-medium text-[#1D376A]">
            {showAll ? t("inbox.emptyAfterConnect.title") : t("inbox.emptyFiltered.title")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {showAll
              ? t("inbox.emptyAfterConnect.description")
              : t("inbox.emptyFiltered.description")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/app/inbox/${row.id}`}
                className={cn(
                  "flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between",
                  row.unread && "bg-orange-50/40"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.unread ? (
                      <span className="size-2 rounded-full bg-[#e06737]" aria-hidden />
                    ) : null}
                    <p className="truncate font-semibold text-[#1D376A]">{row.subject}</p>
                    {row.ai?.intent === "new_project" && (row.ai.confidence ?? 0) >= 50 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        <Sparkles className="size-3" />
                        {t("inbox.badge.newProject")}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {row.fromName ? `${row.fromName} · ` : ""}
                    {row.fromEmail}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-[#4a5568]">{row.snippet}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>{intentLabel(row.ai?.intent, t)}</p>
                  <p className="mt-1">
                    {row.lastMessageAt ? new Date(row.lastMessageAt).toLocaleString() : "—"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
