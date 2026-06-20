"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Rocket,
  Send,
  Sparkles,
  User,
  Wrench,
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
import { buildCustomerRequestViewModel } from "@/lib/gmail/requestViewModel";
import { fieldLabel, fieldStateOf } from "@/lib/gmail/requestInsights";
import { splitQuotedText, findLatestCustomerMessage } from "@/lib/gmail/threadDisplay";
import { cn } from "@/lib/utils";

type Props = {
  inquiryId: string;
};

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning";
}) {
  const tones: Record<string, string> = {
    neutral:
      "bg-muted text-muted-foreground",
    primary:
      "bg-[#1D376A]/10 text-[#1D376A] dark:bg-[#9db8e8]/15 dark:text-[#9db8e8]",
    success:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    warning:
      "bg-orange-100 text-[#b4501f] dark:bg-orange-500/15 dark:text-orange-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

type RowState = "detected" | "missing" | "uncertain";

function DataRow({
  label,
  value,
  icon,
  state,
  stateLabels,
}: {
  label: string;
  value?: string;
  icon?: React.ReactNode;
  state?: RowState;
  stateLabels: Record<RowState, string>;
}) {
  const resolved: RowState = state ?? (value && value.trim() ? "detected" : "missing");
  const has = Boolean(value && value.trim());
  const chip: Record<RowState, string> = {
    detected: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    uncertain: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    missing: "bg-muted text-muted-foreground",
  };
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex min-w-0 items-start gap-2">
        {icon ? <span className="mt-0.5 text-muted-foreground">{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={cn(
              "truncate text-sm",
              has ? "font-medium text-foreground" : "italic text-muted-foreground/70"
            )}
            title={has ? value : undefined}
          >
            {has ? value : "—"}
          </p>
        </div>
      </div>
      <span
        className={cn(
          "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
          chip[resolved]
        )}
      >
        {resolved === "detected" ? <Check className="size-3" /> : <CircleAlert className="size-3" />}
        {stateLabels[resolved]}
      </span>
    </div>
  );
}

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
  const [showThread, setShowThread] = useState(false);
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());

  const seededRef = useRef(false);
  const composerRef = useRef<HTMLDivElement | null>(null);

  const companyName = activeWorkspace?.name ?? "Staveto";

  const vm = useMemo(
    () => (inquiry ? buildCustomerRequestViewModel(inquiry, messages, t, companyName) : null),
    [inquiry, messages, t, companyName]
  );

  const allAttachments = useMemo(() => {
    const list: EmailAttachmentMeta[] = [];
    for (const msg of messages) {
      for (const att of msg.attachments) list.push(att);
    }
    return list;
  }, [messages]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => (a.sentAt < b.sentAt ? -1 : 1)),
    [messages]
  );
  const latestMessage = useMemo(() => findLatestCustomerMessage(messages), [messages]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const detail = await fetchEmailInquiryDetail(orgId, inquiryId);
      setInquiry(detail?.inquiry ?? null);
      setMessages(detail?.messages ?? []);
      if (detail?.inquiry) {
        await markEmailInquiryRead(orgId, inquiryId);
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, inquiryId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Seed the composer once with the freshly-computed smart draft.
  useEffect(() => {
    if (seededRef.current || !vm) return;
    if (!inquiry?.projectId) {
      setReplyText((prev) => prev || vm.draftReply.text);
    }
    seededRef.current = true;
  }, [vm, inquiry?.projectId]);

  const toggleAttachment = (id: string) => {
    setSelectedAttachments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleQuote = (id: string) => {
    setExpandedQuotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const focusComposer = () => {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleGenerateDraft = async () => {
    if (!orgId) return;
    setDrafting(true);
    setError(null);
    try {
      const result = await generateInquiryReplyDraft(orgId, inquiryId, companyName);
      setReplyText(result.draft);
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
      seededRef.current = false;
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
        name: vm?.suggestedProject.title || inquiry.ai?.suggestedTitle || inquiry.subject,
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

  if (!inquiry || !vm) {
    return <p className="text-sm text-muted-foreground">{t("inbox.error.notFound")}</p>;
  }

  const anyMissing = vm.missingInfo.length > 0;
  const requiredMissingCount = vm.requiredMissing.length;
  const stateLabels: Record<"detected" | "missing" | "uncertain", string> = {
    detected: t("inbox.state.detected"),
    missing: t("inbox.state.missing"),
    uncertain: t("inbox.state.uncertain"),
  };
  const subtitle = [vm.customer.name, vm.customer.email, vm.extracted.city]
    .filter(Boolean)
    .join(" · ");

  // ---- Section nodes (reused in mobile + desktop layouts) ----

  const headerSection = (
    <header className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-[#1D376A] dark:text-[#9db8e8] sm:text-2xl">
          {vm.subject}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">{subtitle}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {vm.classification.type === "new_project_request" ? (
          <Badge tone="primary">
            <Sparkles className="size-3" />
            {t("inbox.intent.newProject")}
          </Badge>
        ) : null}
        {vm.classification.likelyNewJob ? (
          <Badge tone="success">{t("inbox.badge.newProject")} · {vm.classification.confidence}%</Badge>
        ) : null}
        {inquiry.unread ? <Badge tone="warning">{t("inbox.badge.unread")}</Badge> : null}
        {inquiry.ai ? <Badge tone="neutral">{t("inbox.badge.aiAnalyzed")}</Badge> : null}
      </div>

      {!inquiry.projectId ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2",
            vm.nextAction.urgent
              ? "border-[#e06737]/30 bg-[#e06737]/5 dark:border-[#e06737]/30 dark:bg-[#e06737]/10"
              : "border-[#1D376A]/15 bg-[#1D376A]/5 dark:border-[#9db8e8]/20 dark:bg-[#9db8e8]/5"
          )}
        >
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              vm.nextAction.urgent ? "text-[#e06737]" : "text-[#1D376A] dark:text-[#9db8e8]"
            )}
          >
            {t("inbox.recommendation")}
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{vm.nextAction.title}</p>
          <p className="text-xs text-muted-foreground">{vm.nextAction.description}</p>
        </div>
      ) : null}

      {!inquiry.projectId ? (
        <div className="flex flex-wrap gap-2">
          {anyMissing ? (
            <>
              <Button type="button" size="sm" onClick={focusComposer} className="bg-[#1D376A] hover:bg-[#16294f]">
                <Send className="mr-1.5 size-4" />
                {t("inbox.reply.prepare")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setStartOpen(true)}>
                <Rocket className="mr-1.5 size-4" />
                {t("inbox.startProject")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                className="bg-[#e06737] hover:bg-[#c9562d]"
                onClick={() => setStartOpen(true)}
              >
                <Rocket className="mr-1.5 size-4" />
                {t("inbox.startProject")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={focusComposer}>
                <Send className="mr-1.5 size-4" />
                {t("inbox.reply.prepare")}
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => void handleIgnore()}>
            <X className="mr-1.5 size-4" />
            {t("inbox.ignore")}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          {t("inbox.converted")}{" "}
          <Link href={`/app/projects/${inquiry.projectId}`} className="font-semibold underline">
            {t("inbox.openProject")}
          </Link>
        </div>
      )}
    </header>
  );

  const summarySection = (
    <section className="rounded-xl border border-[#b8c5d4] bg-[#f8fafc] p-4 dark:border-border dark:bg-muted/30">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1D376A] dark:text-[#9db8e8]">
        <Sparkles className="size-4 text-[#e06737]" />
        {t("inbox.summary.title")}
      </div>
      <p className="text-sm text-[#334155] dark:text-foreground/85">{vm.summary}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Check className="size-3.5" />
          {t("inbox.summary.detectedCount", { count: vm.completedInfo.length })}
        </span>
        {vm.missingInfo.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <CircleAlert className="size-3.5" />
            {t("inbox.summary.missingCount", { count: vm.missingInfo.length })}
          </span>
        ) : null}
      </div>
    </section>
  );

  const dataSection = (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-[#1D376A] dark:text-[#9db8e8]">
        {t("inbox.data.title")}
      </h2>

      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("inbox.data.customer")}
      </p>
      <div className="divide-y divide-border/70">
        <DataRow label={fieldLabel("name", vm.locale)} value={vm.customer.name} icon={<User className="size-3.5" />} stateLabels={stateLabels} />
        <DataRow label={fieldLabel("email", vm.locale)} value={vm.customer.email} icon={<Mail className="size-3.5" />} stateLabels={stateLabels} />
        <DataRow label={fieldLabel("phone", vm.locale)} value={vm.customer.phone} icon={<Phone className="size-3.5" />} stateLabels={stateLabels} />
      </div>

      <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("inbox.data.object")}
      </p>
      <div className="divide-y divide-border/70">
        <DataRow label={fieldLabel("address", vm.locale)} value={vm.extracted.address} icon={<MapPin className="size-3.5" />} stateLabels={stateLabels} />
        <DataRow label={fieldLabel("city", vm.locale)} value={vm.extracted.city} stateLabels={stateLabels} />
      </div>

      <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("inbox.data.request")}
      </p>
      <div className="divide-y divide-border/70">
        <DataRow label={fieldLabel("systemType", vm.locale)} value={vm.extracted.systemType} icon={<Wrench className="size-3.5" />} stateLabels={stateLabels} />
        <DataRow label={fieldLabel("systemYear", vm.locale)} value={vm.extracted.systemYear} stateLabels={stateLabels} />
        <DataRow label={fieldLabel("issue", vm.locale)} value={vm.extracted.issue} stateLabels={stateLabels} />
        <DataRow label={fieldLabel("desiredTimeframe", vm.locale)} value={vm.extracted.desiredTimeframe} icon={<Clock className="size-3.5" />} stateLabels={stateLabels} />
        <DataRow label={fieldLabel("urgency", vm.locale)} value={vm.extracted.urgency} stateLabels={stateLabels} />
        <DataRow
          label={fieldLabel("repairOrReplacement", vm.locale)}
          value={vm.extracted.repairOrReplacement}
          state={fieldStateOf("repairOrReplacement", vm.extracted, vm.locale)}
          stateLabels={stateLabels}
        />
      </div>
    </section>
  );

  const missingSection =
    vm.missingInfo.length > 0 ? (
      <section className="rounded-xl border border-[#e06737]/25 bg-[#e06737]/5 p-4 dark:border-[#e06737]/25 dark:bg-[#e06737]/10">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#b4501f] dark:text-orange-300">
          <CircleAlert className="size-4" />
          {t("inbox.data.missing")}
        </h2>
        <ul className="space-y-1.5">
          {vm.missingInfo.map((m) => (
            <li key={m.id} className="flex items-start gap-2 text-sm text-foreground/90">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#e06737]" />
              <span>{m.label}</span>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const contactSection = (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold text-[#1D376A] dark:text-[#9db8e8]">
        {t("inbox.contact.title")}
      </h2>
      <div className="space-y-1.5 text-sm">
        {vm.customer.name ? (
          <p className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            {vm.customer.name}
          </p>
        ) : null}
        <p className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          <a href={`mailto:${vm.customer.email}`} className="truncate text-[#1D376A] hover:underline dark:text-[#9db8e8]">
            {vm.customer.email}
          </a>
        </p>
        {vm.customer.phone ? (
          <p className="flex items-center gap-2">
            <Phone className="size-4 text-muted-foreground" />
            <a href={`tel:${vm.customer.phone.replace(/\s/g, "")}`} className="text-[#1D376A] hover:underline dark:text-[#9db8e8]">
              {vm.customer.phone}
            </a>
          </p>
        ) : null}
        {vm.extracted.address ? (
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 text-muted-foreground" />
            <span>
              {vm.extracted.address}
              {vm.extracted.city ? `, ${vm.extracted.city}` : ""}
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );

  const renderMessage = (msg: EmailInquiryMessage, highlight = false) => {
    const { visible, quoted } = splitQuotedText(msg.bodyText || "");
    const body = visible || (msg.bodyText || "").trim() || "—";
    const isOpen = expandedQuotes.has(msg.id);
    return (
      <div
        className={cn(
          "rounded-lg border px-3 py-3 text-sm",
          msg.direction === "outbound"
            ? "border-[#1D376A]/20 bg-[#1D376A]/5 dark:border-[#9db8e8]/25 dark:bg-[#9db8e8]/10"
            : "border-border bg-white dark:bg-muted/30",
          highlight && "ring-1 ring-[#e06737]/30"
        )}
      >
        <p className="mb-1 text-xs text-muted-foreground">
          {msg.direction === "outbound" ? t("inbox.you") : msg.from} ·{" "}
          {msg.sentAt ? new Date(msg.sentAt).toLocaleString() : "—"}
        </p>
        <p className="whitespace-pre-wrap text-[#334155] dark:text-foreground/85">{body}</p>
        {quoted ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => toggleQuote(msg.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
              {isOpen ? t("inbox.hideQuoted") : t("inbox.showQuoted")}
            </button>
            {isOpen ? (
              <p className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-3 text-xs text-muted-foreground">
                {quoted}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const latestSection = latestMessage ? (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1D376A] dark:text-[#9db8e8]">
        <Mail className="size-4" />
        {t("inbox.latestMessage")}
      </h2>
      {renderMessage(latestMessage, true)}
    </section>
  ) : null;

  const threadSection =
    sortedMessages.length > 1 ? (
      <section className="rounded-xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => setShowThread((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-[#1D376A] dark:text-[#9db8e8]"
        >
          <span>{t("inbox.thread")}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {showThread ? t("inbox.hidePrevious") : t("inbox.showPrevious")}
            <ChevronDown className={cn("size-4 transition-transform", showThread && "rotate-180")} />
          </span>
        </button>
        {showThread ? (
          <div className="mt-3 space-y-2">
            {sortedMessages.map((msg) => (
              <div key={msg.id}>{renderMessage(msg)}</div>
            ))}
          </div>
        ) : null}
      </section>
    ) : null;

  const attachmentsSection =
    allAttachments.length > 0 ? (
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1D376A] dark:text-[#9db8e8]">
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
                <span className="text-muted-foreground">({Math.round(att.size / 1024)} KB)</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t("inbox.attachmentsHint")}</p>
      </section>
    ) : null;

  const composerSection = !inquiry.projectId ? (
    <section
      ref={composerRef}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-[#1D376A] dark:text-[#9db8e8]">
          {t("inbox.reply.prepare")}
        </h2>
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#e06737]">
          <Sparkles className="size-3.5" />
          {anyMissing ? t("inbox.reply.recommendMissing") : t("inbox.reply.recommendProject")}
        </p>
      </div>

      <Textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        rows={10}
        placeholder={t("inbox.reply.placeholder")}
      />
      <p className="text-xs text-muted-foreground">{vm.draftReply.reason}</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={drafting || busy} onClick={() => void handleGenerateDraft()}>
          {drafting ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 size-4 text-[#e06737]" />
          )}
          {t("inbox.reply.regenerate")}
        </Button>
        <Button
          type="button"
          variant={anyMissing ? "default" : "outline"}
          className={anyMissing ? "bg-[#1D376A] hover:bg-[#16294f]" : undefined}
          disabled={busy || !replyText.trim()}
          onClick={() => void handleReply()}
        >
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}
          {t("inbox.reply.send")}
        </Button>
        <Button
          type="button"
          variant={anyMissing ? "outline" : "default"}
          className={!anyMissing ? "bg-[#e06737] hover:bg-[#c9562d]" : undefined}
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
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      <Link
        href="/app/inbox"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        {t("inbox.back")}
      </Link>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Mobile: single column in task-focused order */}
      <div className="flex flex-col gap-4 lg:hidden">
        {headerSection}
        {summarySection}
        {dataSection}
        {missingSection}
        {latestSection}
        {composerSection}
        {attachmentsSection}
        {threadSection}
        {contactSection}
      </div>

      {/* Desktop: two-column workspace */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[1.85fr_1fr]">
        {headerSection ? <div className="lg:col-span-2">{headerSection}</div> : null}
        <div className="space-y-4">
          {summarySection}
          {latestSection}
          {threadSection}
          {composerSection}
        </div>
        <div className="space-y-4">
          {dataSection}
          {missingSection}
          {attachmentsSection}
          {contactSection}
        </div>
      </div>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inbox.startProjectTitle")}</DialogTitle>
            <DialogDescription>{t("inbox.startProjectDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="font-medium text-[#1D376A] dark:text-[#9db8e8]">{vm.suggestedProject.title}</p>
            {vm.suggestedProject.location ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" />
                {vm.suggestedProject.location}
              </p>
            ) : null}
            {vm.customer.phone ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4" />
                {vm.customer.phone}
              </p>
            ) : null}
            <p className="text-muted-foreground">{vm.suggestedProject.brief}</p>
            {requiredMissingCount > 0 ? (
              <p className="rounded-md border border-[#e06737]/30 bg-[#e06737]/10 px-2 py-1.5 text-xs font-medium text-[#b4501f] dark:text-orange-300">
                {t("inbox.start.warning")}
              </p>
            ) : vm.missingInfo.length > 0 ? (
              <p className="rounded-md bg-amber-100/60 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {t("inbox.data.missing")}: {vm.missingInfo.map((m) => m.label).join(", ")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {requiredMissingCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStartOpen(false);
                  focusComposer();
                }}
              >
                {t("inbox.start.replyFirst")}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setStartOpen(false)}>
                {t("common.cancel")}
              </Button>
            )}
            <Button
              type="button"
              className="bg-[#e06737] hover:bg-[#c9562d]"
              disabled={busy}
              onClick={() => void handleStartProject()}
            >
              {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              {requiredMissingCount > 0 ? t("inbox.start.draftAnyway") : t("inbox.startProjectConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
