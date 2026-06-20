import type { EmailAiClassification, EmailIntent } from "@/lib/emailInquiryTypes";
import { hasStrongProjectSignals, isMarketingNoise } from "./inquiryFilter";
import {
  buildChecklist,
  buildRequestSummary,
  buildSmartReplyDraft,
  detectLocale,
  extractJobData,
} from "./requestInsights";

const CLASSIFY_PROMPT = `You analyze incoming business emails for a construction / HVAC company (Staveto).
You receive the FULL email thread (all customer messages). The LATEST customer message has the
highest priority — information provided later overrides earlier gaps.

LANGUAGE RULES (very important):
- Detect the language of the CUSTOMER'S email (Slovak, German, or English).
- "suggestedReply" MUST be written in that SAME customer language (a German email gets a German reply).
- "missingInfo" must also be in the customer's language.
- "summary" and "suggestedTitle" are internal notes for the manager — keep them in Slovak.

EXTRACTION RULES:
- Fill "extracted" with everything the customer stated ANYWHERE in the thread.
- Do NOT list a field in "missingInfo" if it already appears in "extracted".

Return ONLY valid JSON with this shape:
{
  "intent": "new_project" | "follow_up" | "invoice" | "other",
  "confidence": 0-100,
  "suggestedTitle": "short project title in Slovak (internal)",
  "customerName": "name or company",
  "customerEmail": "email if known",
  "scopeBullets": ["work item 1", "work item 2"],
  "missingInfo": ["only what is STILL missing — in the customer's language"],
  "suggestedReply": "professional reply draft in the customer's language, plain text, signed as the company",
  "summary": "one sentence summary in Slovak (internal)",
  "extracted": {
    "address": "", "city": "", "phone": "", "systemType": "", "systemYear": "",
    "issue": "", "desiredTimeframe": "", "urgency": "", "repairOrReplacement": ""
  }
}

intent guide:
- new_project: customer asks for quote, installation, repair, construction work
- follow_up: reply in existing conversation about a project
- invoice: supplier invoice, payment, receipt
- other: newsletters, spam, internal, unrelated

Email thread:
`;

function heuristicClassify(
  subject: string,
  body: string,
  fromEmail: string,
  customerName?: string
): EmailAiClassification {
  if (isMarketingNoise(fromEmail, subject, body)) {
    return {
      intent: "other",
      confidence: 92,
      suggestedTitle: subject.slice(0, 80) || "Marketing",
      summary: "Automatický / marketingový e-mail — nie je dopyt zákazníka.",
      scopeBullets: [],
      missingInfo: [],
      suggestedReply: "",
      classifiedAt: new Date().toISOString(),
    };
  }

  const text = `${subject}\n${body}`.toLowerCase();
  const locale = detectLocale(`${subject}\n${body}`);
  const projectSignals = [
    "ponuka",
    "quote",
    "montáž",
    "montaz",
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
    "angebot",
    "offerte",
    "anlage",
  ];
  const invoiceSignals = ["faktura", "invoice", "rechnung", "úhrada", "uhrada", "payment"];
  const isInvoice = invoiceSignals.some((s) => text.includes(s));
  const isProject = projectSignals.some((s) => text.includes(s)) || hasStrongProjectSignals(subject, body);

  const extracted = isProject
    ? extractJobData({ subject, threadText: body, customerName, customerEmail: fromEmail, locale })
    : undefined;

  const checklist = extracted ? buildChecklist(extracted, locale) : { completed: [], missing: [] };
  const reply = extracted
    ? buildSmartReplyDraft({
        companyName: "Staveto",
        customerName,
        extracted,
        missing: checklist.missing,
        locale,
      })
    : { draft: "", missingInfo: [] };

  let intent: EmailIntent = "other";
  let confidence = 40;
  if (isInvoice) {
    intent = "invoice";
    confidence = 65;
  } else if (isProject) {
    intent = "new_project";
    confidence = 72;
  }

  return {
    intent,
    confidence,
    suggestedTitle: subject.slice(0, 80) || "Nový dopyt",
    customerName,
    customerEmail: fromEmail,
    summary: extracted ? buildRequestSummary(extracted, locale, body) : body.slice(0, 160).trim(),
    scopeBullets: extracted?.issue ? [extracted.issue] : isProject ? [body.slice(0, 200).trim()] : [],
    missingInfo: reply.missingInfo,
    suggestedReply: reply.draft,
    extracted,
    classifiedAt: new Date().toISOString(),
  };
}

export async function classifyEmailWithAi(
  subject: string,
  body: string,
  fromEmail: string,
  customerName?: string
): Promise<EmailAiClassification> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const result = heuristicClassify(subject, body, fromEmail, customerName);
    result.customerEmail = fromEmail;
    return result;
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const prompt = `${CLASSIFY_PROMPT}From: ${fromEmail}\nSubject: ${subject}\n\n${body.slice(0, 8000)}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const fallback = heuristicClassify(subject, body, fromEmail, customerName);
      fallback.customerEmail = fromEmail;
      return fallback;
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("empty");

    const parsed = JSON.parse(text) as EmailAiClassification;
    return {
      ...parsed,
      customerName: parsed.customerName || customerName,
      customerEmail: parsed.customerEmail || fromEmail,
      classifiedAt: new Date().toISOString(),
    };
  } catch {
    const fallback = heuristicClassify(subject, body, fromEmail, customerName);
    fallback.customerEmail = fromEmail;
    return fallback;
  }
}
