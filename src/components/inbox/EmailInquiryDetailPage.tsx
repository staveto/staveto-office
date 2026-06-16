"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  Rocket,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { EmailAttachmentMeta, EmailInquiryMessage } from "@/lib/emailInquiryTypes";
import {
  fetchEmailInquiryDetail,
  ignoreEmailInquiry,
  markEmailInquiryRead,
} from "@/services/email/emailInquiryService";
import {
  replyToEmailInquiry,
  startProjectFromEmailInquiry,
  generateInquiryReplyDraft,
} from "@/services/email/gmailIntegrationService";
import type { EmailInquiry } from "@/lib/emailInquiryTypes";
import { cn } from "@/lib/utils";

type Props = {
  inquiryId: string;
};

export function EmailInquiryDetailPage({ inquiryId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { activeWorkspace } = useWorkspace();
  const orgId =
    activeWorkspace?.type === "company"
      ? activeWorkspace.orgId ?? activeWorkspace.id
      : undefined;

  const [inquiry, setInquiry] = useState<EmailInquiry | null>(null);
  const [messages, setMessages] = useState<EmailInquiryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());

  const companyName = activeWorkspace?.name ?? "Staveto";

  const allAttachments = useMemo(() => {
    const list: EmailAttachmentMeta[] = [];
    for (const msg of messages) {
      for (const att of msg.attachments) list.push(att);
    }
    return list;
  }, [messages]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const detail = await fetchEmailInquiryDetail(orgId, inquiryId);
      setInquiry(detail?.inquiry ?? null);
      setMessages(detail?.messages ?? []);
      if (detail?.inquiry) {
        await markEmailInquiryRead(orgId, inquiryId);
        setReplyText((prev) => prev || detail.inquiry.ai?.suggestedReply || "");
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, inquiryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAttachment = (id: string) => {
    setSelectedAttachments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerateDraft = async () => {
    if (!orgId) return;
    setDrafting(true);
    setError(null);
    try {
      const result = await generateInquiryReplyDraft(orgId, inquiryId, companyName);
      setReplyText(result.draft);
      if (inquiry) {
        setInquiry({
          ...inquiry,
          ai: {
            ...inquiry.ai,
            intent: inquiry.ai?.intent ?? "new_project",
            confidence: inquiry.ai?.confidence ?? 0,
            suggestedReply: result.draft,
            missingInfo: result.missingInfo,
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inbox.error.draftReply"));
    } finally {
      setDrafting(false);
    }
  };

  const handleReply = async () => {
    if (!orgId || !replyText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await replyToEmailInquiry(orgId, inquiryId, replyText.trim());
      setReplyText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inbox.error.reply"));
    } finally {
      setBusy(false);
    }
  };

  const handleStartProject = async () => {
    if (!orgId || !inquiry) return;
    setBusy(true);
    setError(null);
    try {
      const { projectId } = await startProjectFromEmailInquiry({
        orgId,
        inquiryId,
        name: inquiry.ai?.suggestedTitle || inquiry.subject,
        attachmentIds: [...selectedAttachments],
        importAttachments: selectedAttachments.size > 0,
      });
      setStartOpen(false);
      router.push(`/app/projects/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("inbox.error.startProject"));
    } finally {
      setBusy(false);
    }
  };

  const handleIgnore = async () => {
    if (!orgId) return;
    await ignoreEmailInquiry(orgId, inquiryId);
    router.push("/app/inbox");
  };

  if (!orgId) {
    return <p className="text-sm text-muted-foreground">{t("inbox.error.noCompany")}</p>;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("inbox.loading")}
      </div>
    );
  }

  if (!inquiry) {
    return <p className="text-sm text-muted-foreground">{t("inbox.error.notFound")}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/app/inbox"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 size-4" />
          {t("inbox.back")}
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-[#1D376A]">{inquiry.subject}</h1>
        <p className="text-sm text-muted-foreground">
          {inquiry.fromName ? `${inquiry.fromName} · ` : ""}
          {inquiry.fromEmail}
        </p>
      </header>

      {inquiry.ai ? (
        <section className="rounded-xl border border-[#b8c5d4] bg-[#f8fafc] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1D376A]">
            <Sparkles className="size-4 text-[#e06737]" />
            {t("inbox.ai.title")}
            {inquiry.ai.intent === "new_project" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {t("inbox.badge.newProject")} · {inquiry.ai.confidence}%
              </span>
            ) : null}
          </div>
          {inquiry.ai.summary ? (
            <p className="text-sm text-[#4a5568]">{inquiry.ai.summary}</p>
          ) : null}
          {inquiry.ai.scopeBullets && inquiry.ai.scopeBullets.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#4a5568]">
              {inquiry.ai.scopeBullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {inquiry.ai.missingInfo && inquiry.ai.missingInfo.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("inbox.ai.missing")}: {inquiry.ai.missingInfo.join(", ")}
            </p>
          ) : null}
          {inquiry.ai.suggestedReply ? (
            <div className="mt-3 rounded-lg border border-[#e2e8f0] bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5a6577]">
                {t("inbox.ai.suggestedReply")}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#334155]">
                {inquiry.ai.suggestedReply}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-[#1D376A]">{t("inbox.thread")}</h2>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "rounded-lg border px-3 py-3 text-sm",
              msg.direction === "outbound"
                ? "ml-8 border-[#1D376A]/20 bg-[#1D376A]/5"
                : "mr-8 border-border bg-white"
            )}
          >
            <p className="mb-1 text-xs text-muted-foreground">
              {msg.direction === "outbound" ? t("inbox.you") : msg.from} ·{" "}
              {new Date(msg.sentAt).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap text-[#334155]">{msg.bodyText || "—"}</p>
          </div>
        ))}
      </section>

      {allAttachments.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1D376A]">
            <Paperclip className="size-4" />
            {t("inbox.attachments")}
          </h2>
          <ul className="space-y-2">
            {allAttachments.map((att) => (
              <li key={att.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedAttachments.has(att.id)}
                  onChange={() => toggleAttachment(att.id)}
                  id={`att-${att.id}`}
                  className="size-4 rounded border-border"
                />
                <label htmlFor={`att-${att.id}`} className="cursor-pointer">
                  {att.fileName}{" "}
                  <span className="text-muted-foreground">
                    ({Math.round(att.size / 1024)} KB)
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{t("inbox.attachmentsHint")}</p>
        </section>
      ) : null}

      {!inquiry.projectId ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-[#1D376A]">{t("inbox.reply.title")}</h2>
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={8}
            placeholder={t("inbox.reply.placeholder")}
          />
          <p className="text-xs text-muted-foreground">{t("inbox.reply.generateHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={drafting || busy}
              onClick={() => void handleGenerateDraft()}
            >
              {drafting ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 size-4 text-[#e06737]" />
              )}
              {t("inbox.reply.generateAi")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !replyText.trim()}
              onClick={() => void handleReply()}
            >
              {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}
              {t("inbox.reply.send")}
            </Button>
            <Button
              type="button"
              className="bg-[#e06737] hover:bg-[#c9562d]"
              disabled={busy}
              onClick={() => setStartOpen(true)}
            >
              <Rocket className="mr-1 size-4" />
              {t("inbox.startProject")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void handleIgnore()}>
              <X className="mr-1 size-4" />
              {t("inbox.ignore")}
            </Button>
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          {t("inbox.converted")}{" "}
          <Link href={`/app/projects/${inquiry.projectId}`} className="font-semibold underline">
            {t("inbox.openProject")}
          </Link>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inbox.startProjectTitle")}</DialogTitle>
            <DialogDescription>{t("inbox.startProjectDescription")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium text-[#1D376A]">
            {inquiry.ai?.suggestedTitle || inquiry.subject}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStartOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              className="bg-[#e06737] hover:bg-[#c9562d]"
              disabled={busy}
              onClick={() => void handleStartProject()}
            >
              {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              {t("inbox.startProjectConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
