import type { EmailAiClassification, EmailIntent } from "@/lib/emailInquiryTypes";
import { hasStrongProjectSignals, isMarketingNoise } from "./inquiryFilter";
import { buildHeuristicReplyDraft } from "./replyDraftService";

const CLASSIFY_PROMPT = `You analyze incoming business emails for a construction company (Staveto).
Return ONLY valid JSON with this shape:
{
  "intent": "new_project" | "follow_up" | "invoice" | "other",
  "confidence": 0-100,
  "suggestedTitle": "short project title in Slovak",
  "customerName": "name or company",
  "customerEmail": "email if known",
  "scopeBullets": ["work item 1", "work item 2"],
  "missingInfo": ["what is still missing"],
  "suggestedReply": "professional Slovak reply draft",
  "summary": "one sentence summary in Slovak"
}

intent guide:
- new_project: customer asks for quote, installation, repair, construction work
- follow_up: reply in existing conversation about a project
- invoice: supplier invoice, payment, receipt
- other: newsletters, spam, internal, unrelated

Email:
`;

function inferMissingInfo(text: string, subject: string, body: string): string[] {
  const combined = `${subject}\n${body}`.toLowerCase();
  const missing: string[] = [];
  if (!/\d{3,}.*(ul|straße|str\.|cesta|adresa|address)/i.test(combined) && !/plz|psc|zip/i.test(combined)) {
    missing.push("adresa realizácie / Adresse");
  }
  if (!/termín|termin|datum|date|kedy|wann|when/i.test(combined)) {
    missing.push("preferovaný termín / Zeitraum");
  }
  if (/klima|montáž|montaz|montage/i.test(combined) && !/m²|m2|kw|leistung/i.test(combined)) {
    missing.push("technické detaily (výkon, počet miestností)");
  }
  if (!/\+?\d{9,}/.test(combined)) {
    missing.push("telefónne číslo / Telefon");
  }
  if (missing.length === 0) {
    return ["upresnenie rozsahu prác", "preferovaný termín", "kontaktné telefónne číslo"];
  }
  return missing;
}

function heuristicClassify(subject: string, body: string, fromEmail: string): EmailAiClassification {
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
    "potrebujeme",
    "žiadam",
    "ziadam",
    "angebot",
    "offerte",
  ];
  const invoiceSignals = ["faktura", "invoice", "rechnung", "úhrada", "uhrada", "payment"];
  const isInvoice = invoiceSignals.some((s) => text.includes(s));
  const isProject = projectSignals.some((s) => text.includes(s)) || hasStrongProjectSignals(subject, body);
  const missingInfo = isProject ? inferMissingInfo(text, subject, body) : [];
  const replyDraft = isProject
    ? buildHeuristicReplyDraft({
        companyName: "Staveto",
        subject,
        threadBody: body,
        ai: { intent: "new_project", confidence: 72, missingInfo },
      }).draft
    : "";

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
    summary: body.slice(0, 160).trim(),
    scopeBullets: isProject ? [body.slice(0, 200).trim()] : [],
    missingInfo,
    suggestedReply: replyDraft,
    classifiedAt: new Date().toISOString(),
  };
}

export async function classifyEmailWithAi(
  subject: string,
  body: string,
  fromEmail: string
): Promise<EmailAiClassification> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const result = heuristicClassify(subject, body, fromEmail);
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
      const fallback = heuristicClassify(subject, body, fromEmail);
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
      customerEmail: parsed.customerEmail || fromEmail,
      classifiedAt: new Date().toISOString(),
    };
  } catch {
    const fallback = heuristicClassify(subject, body, fromEmail);
    fallback.customerEmail = fromEmail;
    return fallback;
  }
}
