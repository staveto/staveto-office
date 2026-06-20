import type { EmailAiClassification } from "@/lib/emailInquiryTypes";
import {
  buildChecklist,
  buildSmartReplyDraft,
  detectLocale,
  extractJobData,
  type RequestLocale,
} from "./requestInsights";

export type ReplyDraftLocale = RequestLocale;

export { detectLocale };

export function buildHeuristicReplyDraft(opts: {
  companyName: string;
  customerName?: string;
  customerEmail?: string;
  subject: string;
  threadBody: string;
  ai?: EmailAiClassification;
  locale?: ReplyDraftLocale;
}): { draft: string; missingInfo: string[] } {
  const locale = opts.locale ?? detectLocale(`${opts.subject}\n${opts.threadBody}`);
  const extracted =
    opts.ai?.extracted ??
    extractJobData({
      subject: opts.subject,
      threadText: opts.threadBody,
      customerName: opts.customerName,
      customerEmail: opts.customerEmail,
      locale,
    });
  const { missing } = buildChecklist(extracted, locale);

  return buildSmartReplyDraft({
    companyName: opts.companyName,
    customerName: opts.customerName,
    extracted,
    missing,
    locale,
  });
}

const REPLY_DRAFT_PROMPT = `You write professional B2B email replies for a construction / HVAC company on behalf of the company (not as AI).
You are given the customer's email thread plus structured data already EXTRACTED from it and a list of STILL-MISSING fields.

Hard rules:
1. Reply in the SAME language as the customer's email (Slovak, German, or English).
2. Thank the customer briefly.
3. Confirm the information already provided (address, phone, timeframe, system, issue) in a short bullet list.
4. Ask ONLY for the fields listed as missing. NEVER ask for data that is already known
   (if address is known, do not ask for address; same for phone and timeframe).
5. Keep it short, professional and friendly. Plain text only, no markdown, do not quote the thread.
6. Sign with the company name provided.

Return ONLY valid JSON:
{
  "draft": "full email body with line breaks",
  "missingInfo": ["item 1", "item 2"]
}
`;

export async function generateInquiryReplyDraft(opts: {
  companyName: string;
  customerName?: string;
  customerEmail: string;
  subject: string;
  threadBody: string;
  ai?: EmailAiClassification;
  locale?: ReplyDraftLocale;
}): Promise<{ draft: string; missingInfo: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const locale = opts.locale ?? detectLocale(`${opts.subject}\n${opts.threadBody}`);

  const extracted =
    opts.ai?.extracted ??
    extractJobData({
      subject: opts.subject,
      threadText: opts.threadBody,
      customerName: opts.customerName,
      customerEmail: opts.customerEmail,
      locale,
    });
  const { completed, missing } = buildChecklist(extracted, locale);

  if (!apiKey) {
    return buildSmartReplyDraft({
      companyName: opts.companyName,
      customerName: opts.customerName,
      extracted,
      missing,
      locale,
    });
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const context = [
    `Company name (sign as): ${opts.companyName}`,
    `Customer: ${opts.customerName ?? "unknown"} <${opts.customerEmail}>`,
    `Subject: ${opts.subject}`,
    `Reply language: ${locale}`,
    "",
    "Already known (do NOT ask for these again):",
    ...completed.map((c) => `- ${c.label}: ${c.value}`),
    "",
    "Still missing (ask only for these):",
    ...missing.map((m) => `- ${m.label}`),
    "",
    "Customer email thread:",
    opts.threadBody.slice(0, 6000),
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${REPLY_DRAFT_PROMPT}\n\n${context}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.35 },
        }),
      }
    );

    if (!res.ok) {
      return buildSmartReplyDraft({
        companyName: opts.companyName,
        customerName: opts.customerName,
        extracted,
        missing,
        locale,
      });
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("empty");

    const parsed = JSON.parse(text) as { draft?: string; missingInfo?: string[] };
    if (!parsed.draft?.trim()) throw new Error("empty draft");

    return {
      draft: parsed.draft.trim(),
      missingInfo: parsed.missingInfo?.length ? parsed.missingInfo : missing.map((m) => m.label),
    };
  } catch {
    return buildSmartReplyDraft({
      companyName: opts.companyName,
      customerName: opts.customerName,
      extracted,
      missing,
      locale,
    });
  }
}
