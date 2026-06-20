import type {
  EmailInquiry,
  EmailInquiryMessage,
  ExtractedJobData,
} from "@/lib/emailInquiryTypes";
import {
  buildChecklist,
  buildRequestSummary,
  buildSmartReplyDraft,
  detectLocale,
  extractJobData,
  type CompletedField,
  type MissingField,
  type RequestLocale,
} from "./requestInsights";
import { splitQuotedText } from "./threadDisplay";

export type NextActionType =
  | "reply_for_missing_info"
  | "create_quote"
  | "create_project"
  | "ignore";

export type CustomerRequestDetailViewModel = {
  subject: string;
  customer: { name?: string; email: string; phone?: string };
  classification: {
    type: "new_project_request" | "invoice" | "support" | "other";
    likelyNewJob: boolean;
    confidence: number;
  };
  locale: RequestLocale;
  summary: string;
  extracted: ExtractedJobData;
  completedInfo: CompletedField[];
  missingInfo: MissingField[];
  requiredMissing: MissingField[];
  hasBasics: boolean;
  hasEnoughInfo: boolean;
  nextAction: {
    type: NextActionType;
    title: string;
    description: string;
    primaryLabel: string;
    urgent: boolean;
  };
  draftReply: {
    language: RequestLocale;
    text: string;
    reason: string;
  };
  suggestedProject: {
    title: string;
    brief: string;
    location?: string;
  };
};

const REQUIRED_FIELD_IDS = new Set(["address", "phone", "desiredTimeframe", "issue"]);

type T = (key: string, params?: Record<string, string | number>) => string;

function mapClassificationType(
  intent: string
): CustomerRequestDetailViewModel["classification"]["type"] {
  switch (intent) {
    case "new_project":
      return "new_project_request";
    case "invoice":
      return "invoice";
    case "follow_up":
      return "support";
    default:
      return "other";
  }
}

export function buildCustomerRequestViewModel(
  inquiry: EmailInquiry,
  messages: EmailInquiryMessage[],
  t: T,
  companyName = "Staveto"
): CustomerRequestDetailViewModel {
  // Inbound customer text, newest first → latest reply has priority. Quotes stripped.
  const inboundText =
    messages
      .filter((m) => m.direction === "inbound")
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
      .map((m) => splitQuotedText(m.bodyText || "").visible || m.bodyText || "")
      .join("\n\n")
      .trim() || inquiry.snippet;

  const locale = detectLocale(`${inquiry.subject}\n${inboundText}`);

  const extracted = extractJobData({
    subject: inquiry.subject,
    threadText: inboundText,
    customerName: inquiry.ai?.customerName || inquiry.fromName,
    customerEmail: inquiry.fromEmail,
    locale,
  });

  const { completed, missing } = buildChecklist(extracted, locale);

  const requiredMissing = missing.filter((m) => REQUIRED_FIELD_IDS.has(m.id));
  const hasBasics = requiredMissing.length === 0;
  const hasEnoughInfo = missing.length === 0;
  const anyMissing = missing.length > 0;
  const inboundCount = messages.filter((m) => m.direction === "inbound").length;
  const isUrgent = Boolean(extracted.urgency);

  const summary =
    buildRequestSummary(extracted, locale, inquiry.ai?.summary || inboundText) || inquiry.snippet;

  const draft = buildSmartReplyDraft({
    companyName,
    customerName: extracted.customerName,
    extracted,
    missing,
    locale,
    followUp: inboundCount > 1,
  });

  const nextActionType: NextActionType = anyMissing
    ? "reply_for_missing_info"
    : "create_project";

  const nextAction = {
    type: nextActionType,
    title:
      nextActionType === "reply_for_missing_info"
        ? t("inbox.next.replyTitle")
        : t("inbox.next.projectTitle"),
    description:
      nextActionType === "reply_for_missing_info"
        ? t("inbox.next.replyDesc")
        : t("inbox.next.projectDesc"),
    primaryLabel:
      nextActionType === "reply_for_missing_info"
        ? t("inbox.reply.prepare")
        : t("inbox.startProject"),
    urgent: isUrgent,
  };

  const draftReason = anyMissing
    ? t("inbox.draft.reasonMissing")
    : t("inbox.draft.reasonComplete");

  const location = [extracted.address, extracted.city].filter(Boolean).join(", ") || undefined;
  const cityTitle = extracted.city ? ` - ${extracted.city}` : "";
  const suggestedTitle =
    (inquiry.ai?.suggestedTitle || inquiry.subject || "Anfrage").trim() + cityTitle;

  return {
    subject: inquiry.subject,
    customer: {
      name: extracted.customerName,
      email: inquiry.fromEmail,
      phone: extracted.phone,
    },
    classification: {
      type: mapClassificationType(inquiry.ai?.intent ?? "other"),
      likelyNewJob: inquiry.ai?.intent === "new_project" && (inquiry.ai?.confidence ?? 0) >= 50,
      confidence: inquiry.ai?.confidence ?? 0,
    },
    locale,
    summary,
    extracted,
    completedInfo: completed,
    missingInfo: missing,
    requiredMissing,
    hasBasics,
    hasEnoughInfo,
    nextAction,
    draftReply: {
      language: locale,
      text: draft.draft,
      reason: draftReason,
    },
    suggestedProject: {
      title: suggestedTitle,
      brief: summary,
      location,
    },
  };
}
