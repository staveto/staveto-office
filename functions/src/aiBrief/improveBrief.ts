import { z } from "zod";
import { generateJsonText } from "../estimator/estimatorGemini";

const inputSchema = z.object({
  brief: z.string().default(""),
  projectName: z.string().optional(),
  jobType: z.string().optional(),
  extraContext: z.string().optional(),
  location: z.string().optional(),
  attachmentNames: z.array(z.string()).optional(),
  language: z.enum(["sk", "cs", "de", "en"]).default("sk"),
});

export type ImproveBriefResult = {
  improvedBrief: string;
  addedDetails: string[];
  openQuestions: string[];
};

const LANG_LABEL: Record<string, string> = {
  sk: "Slovak",
  cs: "Czech",
  de: "German",
  en: "English",
};

function buildPrompt(input: z.infer<typeof inputSchema>): string {
  const lang = LANG_LABEL[input.language] ?? "Slovak";
  const attachments = input.attachmentNames?.length
    ? `Attached files (do not invent their contents): ${input.attachmentNames.join(", ")}`
    : "No attachments provided.";
  return `You help a construction/trades company write a clear job description ("popis práce") for an AI estimator.
Rewrite and improve the description below in ${lang}.

Rules:
- Keep the customer's real intent. Do NOT invent quantities, prices, dimensions, or facts that were not stated.
- Fix grammar, structure and clarity. Use short paragraphs or bullet-like sentences.
- Make it useful for estimating: scope of work, what is included, relevant trade specifics.
- If key information is missing, do NOT guess it — instead list it under openQuestions.
- Preserve the trade domain (e.g. electrical installation) if implied.
- Output must stay realistic and professional, not marketing fluff.
- Write ALL output in ${lang}: improvedBrief, every item in addedDetails, and every item in openQuestions. Do NOT use English unless ${lang} is English.

Project name: ${input.projectName || "—"}
Job type: ${input.jobType || "—"}
Location: ${input.location || "—"}
${attachments}
Extra context: ${input.extraContext || "—"}

Original description:
"""
${input.brief}
"""

Return JSON only (all string values written in ${lang}):
{
  "improvedBrief": string,        // the rewritten description in ${lang}
  "addedDetails": string[],       // short notes in ${lang} on what you clarified/structured (may be empty)
  "openQuestions": string[]       // missing info in ${lang} the user should confirm (may be empty)
}`;
}

export async function handleImproveProjectBrief(
  uid: string | undefined,
  data: unknown
): Promise<ImproveBriefResult> {
  if (!uid) throw new Error("Sign in required.");
  const input = inputSchema.parse(data);
  if (!input.brief.trim()) {
    return { improvedBrief: "", addedDetails: [], openQuestions: [] };
  }

  const text = await generateJsonText({
    prompt: buildPrompt(input),
    system:
      "You are Staveto's writing assistant for construction job descriptions. Return valid JSON only. Never invent facts.",
    maxOutputTokens: 2048,
    temperature: 0.3,
    envModel: "GEMINI_MODEL",
  });

  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // Model returned plain text — treat whole response as the improved brief.
    return {
      improvedBrief: cleaned || input.brief,
      addedDetails: [],
      openQuestions: [],
    };
  }

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  const improved =
    typeof raw.improvedBrief === "string" && raw.improvedBrief.trim()
      ? raw.improvedBrief.trim()
      : input.brief;

  return {
    improvedBrief: improved,
    addedDetails: asStringArray(raw.addedDetails),
    openQuestions: asStringArray(raw.openQuestions),
  };
}
