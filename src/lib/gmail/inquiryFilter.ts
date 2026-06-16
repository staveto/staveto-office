import type { EmailAiClassification, EmailInquiryStatus } from "@/lib/emailInquiryTypes";

const MARKETING_DOMAINS = [
  "wix.com",
  "monday.com",
  "trustpilot",
  "mailchimp",
  "sendgrid",
  "hubspot",
  "constantcontact",
  "campaign-archive",
  "facebookmail",
  "linkedin.com",
  "google.com",
  "stripe.com",
  "shopify.com",
  "squarespace",
  "canva.com",
  "mailerlite",
  "brevo.com",
  "activecampaign",
];

const MARKETING_SUBJECT_RE = [
  /unsubscribe/i,
  /newsletter/i,
  /your (new )?site/i,
  /premium plan/i,
  /social posts are ready/i,
  /trustpilot/i,
  /claim your free/i,
  /congrats on publishing/i,
  /enjoy your new/i,
  /weekly (social )?posts/i,
  /streamline project management/i,
  /@\w+app\b/i,
  /insights$/i,
  /thriving/i,
];

const PROJECT_SIGNALS = [
  "ponuka",
  "dopyt",
  "quote",
  "angebot",
  "offerte",
  "montáž",
  "montaz",
  "montage",
  "inštal",
  "instal",
  "oprava",
  "stavba",
  "projekt",
  "klimatiz",
  "klima",
  "potrebujeme",
  "žiadam",
  "ziadam",
  "chcem",
  "potrebujem",
  "anfrage",
  "reparatur",
  "umbau",
  "renov",
];

export function isMarketingNoise(
  fromEmail: string,
  subject: string,
  bodyText?: string
): boolean {
  const email = fromEmail.toLowerCase();
  const text = `${subject}\n${bodyText ?? ""}`.toLowerCase();

  if (MARKETING_DOMAINS.some((d) => email.includes(d))) return true;
  if (MARKETING_SUBJECT_RE.some((re) => re.test(subject))) return true;

  const isAutomated =
    email.includes("noreply") ||
    email.includes("no-reply") ||
    email.includes("donotreply") ||
    email.includes("notifications@");

  if (isAutomated && !hasStrongProjectSignals(subject, bodyText)) {
    if (MARKETING_SUBJECT_RE.some((re) => re.test(subject))) return true;
    if (text.includes("unsubscribe") || text.includes("odhlásiť")) return true;
  }

  return false;
}

export function hasStrongProjectSignals(subject: string, bodyText?: string): boolean {
  const text = `${subject}\n${bodyText ?? ""}`.toLowerCase();
  return PROJECT_SIGNALS.some((s) => text.includes(s));
}

export type InquiryFilterInput = {
  ai?: EmailAiClassification;
  fromEmail: string;
  subject: string;
  snippet?: string;
  status?: EmailInquiryStatus;
};

/** True when email should appear in the business inquiry inbox. */
export function isBusinessRelevantInquiry(input: InquiryFilterInput): boolean {
  if (input.status === "ignored" || input.status === "converted") return false;

  const body = input.snippet ?? input.ai?.summary ?? "";
  if (isMarketingNoise(input.fromEmail, input.subject, body)) return false;

  const intent = input.ai?.intent ?? "other";
  const confidence = input.ai?.confidence ?? 0;

  if (intent === "new_project" && confidence >= 30) return true;
  if (intent === "follow_up" && confidence >= 30) return true;

  if (hasStrongProjectSignals(input.subject, body)) return true;

  return false;
}
