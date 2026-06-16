import type { EmailAiClassification } from "@/lib/emailInquiryTypes";

export type ReplyDraftLocale = "sk" | "de" | "en";

const DEFAULT_MISSING_SK = [
  "presná adresa realizácie",
  "preferovaný termín / naliehavosť",
  "rozsah prác a špecifikácia",
  "kontaktné telefónne číslo",
];

const DEFAULT_MISSING_DE = [
  "genaue Adresse des Objekts",
  "gewünschter Zeitraum / Dringlichkeit",
  "Umfang der Arbeiten und technische Details",
  "Telefonnummer für Rückfragen",
];

const DEFAULT_MISSING_EN = [
  "exact site address",
  "preferred timeline / urgency",
  "scope of work and technical details",
  "phone number for follow-up",
];

function detectLocale(text: string): ReplyDraftLocale {
  const t = text.toLowerCase();
  if (/[äöüß]|möchte|vielen dank|guten tag|wohnung|montage|angebot/.test(t)) return "de";
  if (/ďakuj|dobrý deň|ponuk|montáž|potrebujem|žiadosť/.test(t)) return "sk";
  return "en";
}

function customerSalutation(name: string | undefined, locale: ReplyDraftLocale): string {
  if (!name?.trim()) {
    if (locale === "de") return "Guten Tag";
    if (locale === "en") return "Hello";
    return "Dobrý deň";
  }
  const first = name.trim().split(/\s+/)[0]!;
  if (locale === "de") return `Guten Tag ${first}`;
  if (locale === "en") return `Hello ${first}`;
  return `Dobrý deň ${first}`;
}

function defaultMissing(locale: ReplyDraftLocale): string[] {
  if (locale === "de") return DEFAULT_MISSING_DE;
  if (locale === "en") return DEFAULT_MISSING_EN;
  return DEFAULT_MISSING_SK;
}

export function buildHeuristicReplyDraft(opts: {
  companyName: string;
  customerName?: string;
  subject: string;
  threadBody: string;
  ai?: EmailAiClassification;
  locale?: ReplyDraftLocale;
}): { draft: string; missingInfo: string[] } {
  const locale = opts.locale ?? detectLocale(`${opts.subject}\n${opts.threadBody}`);
  const missing =
    opts.ai?.missingInfo?.filter(Boolean).length
      ? opts.ai.missingInfo!.filter(Boolean)
      : defaultMissing(locale);

  const salutation = customerSalutation(opts.customerName, locale);
  const company = opts.companyName.trim() || "Staveto";

  const bullets = missing.map((m) => `- ${m}`).join("\n");

  if (locale === "de") {
    return {
      missingInfo: missing,
      draft: `${salutation},

vielen Dank für Ihre Anfrage${opts.subject ? ` („${opts.subject}“)` : ""}.

Damit wir Ihnen ein passendes Angebot erstellen können, benötigen wir noch folgende Angaben:

${bullets}

Sobald wir diese Informationen haben, melden wir uns zeitnah mit den nächsten Schritten.

Mit freundlichen Grüßen
${company}`,
    };
  }

  if (locale === "en") {
    return {
      missingInfo: missing,
      draft: `${salutation},

thank you for your inquiry${opts.subject ? ` regarding "${opts.subject}"` : ""}.

To prepare a tailored quote, we still need a few details:

${bullets}

Once we have this information, we will get back to you promptly with next steps.

Best regards
${company}`,
    };
  }

  return {
    missingInfo: missing,
    draft: `${salutation},

ďakujeme za Váš dopyt${opts.subject ? ` k téme „${opts.subject}"` : ""}.

Aby sme Vám mohli pripraviť presnú ponuku, potrebujeme ešte tieto informácie:

${bullets}

Hneď ako ich budeme mať, ozveme sa Vám s ďalšími krokmi.

S pozdravom
${company}`,
  };
}

const REPLY_DRAFT_PROMPT = `You write professional B2B email replies for a construction / HVAC company on behalf of the company (not as AI).
The customer emailed asking for work. Information is incomplete — write a polite reply that:
1. Thanks them for the inquiry
2. Briefly acknowledges what they already shared (1 sentence)
3. Lists clear bullet questions for missing info needed to prepare a quote
4. Promises follow-up after they reply
5. Signs with the company name provided

Match the customer's language (Slovak, German, or English). Plain text only, no markdown.
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

  if (!apiKey) {
    return buildHeuristicReplyDraft(opts);
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const context = [
    `Company name (sign as): ${opts.companyName}`,
    `Customer: ${opts.customerName ?? "unknown"} <${opts.customerEmail}>`,
    `Subject: ${opts.subject}`,
    `Preferred reply language: ${locale}`,
    opts.ai?.summary ? `AI summary: ${opts.ai.summary}` : "",
    opts.ai?.missingInfo?.length
      ? `Known gaps: ${opts.ai.missingInfo.join(", ")}`
      : "",
    "",
    "Customer email:",
    opts.threadBody.slice(0, 6000),
  ]
    .filter(Boolean)
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

    if (!res.ok) return buildHeuristicReplyDraft(opts);

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return buildHeuristicReplyDraft(opts);

    const parsed = JSON.parse(text) as { draft?: string; missingInfo?: string[] };
    if (!parsed.draft?.trim()) return buildHeuristicReplyDraft(opts);

    return {
      draft: parsed.draft.trim(),
      missingInfo: parsed.missingInfo?.length ? parsed.missingInfo : defaultMissing(locale),
    };
  } catch {
    return buildHeuristicReplyDraft(opts);
  }
}
