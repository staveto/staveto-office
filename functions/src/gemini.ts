import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildAttachmentVisionPrompt } from "./attachmentPrompt";
import {
  emptyAttachmentSummary,
  parseAttachmentSummaryJson,
  type AttachmentSummary,
} from "./attachmentSummarySchema";
import { parseProjectDraftJson, type ProjectDraftPayload } from "./draftSchema";

const SYSTEM_INSTRUCTION = `You are Staveto Project Draft Agent.
You help construction companies create structured project drafts from customer messages, notes, documents and photos.
You must return valid JSON only using the requested schema.
Do not invent exact prices.
Do not create final projects.
Create a useful draft that a project manager can review.
Ask clarification questions when information is missing.
Use practical construction terminology.
Respect the selected language.
If the input is incomplete, create the best possible draft and list missing information.`;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return key;
}

export function isGeminiQuotaError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("quota exceeded") ||
    msg.includes("resource_exhausted")
  );
}

export function isGeminiOverloadedError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("temporarily unavailable")
  );
}

function isGeminiRetryableError(err: unknown): boolean {
  return isGeminiQuotaError(err) || isGeminiOverloadedError(err);
}

function parseRetryDelayMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const secondsMatch = msg.match(/retry in ([\d.]+)s/i);
  if (secondsMatch) {
    return Math.ceil(parseFloat(secondsMatch[1]) * 1000) + 500;
  }
  return 15000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isGeminiRetryableError(err) || attempt === maxAttempts - 1) {
        throw err;
      }
      const delay = isGeminiOverloadedError(err) ? 3000 + attempt * 2000 : parseRetryDelayMs(err);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function languageLabel(lang: "sk" | "de" | "en"): string {
  if (lang === "de") return "German (formal Sie, Swiss spelling with ss not ß)";
  if (lang === "en") return "English";
  return "Slovak";
}

export type GeminiInlineAttachment = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

const MAX_INLINE_ATTACHMENT_BYTES = 7 * 1024 * 1024;

function buildGeminiContentParts(
  prompt: string,
  attachments?: GeminiInlineAttachment[]
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];

  for (const att of attachments ?? []) {
    const mime = att.mimeType.toLowerCase();
    if (!mime.startsWith("image/") && mime !== "application/pdf") continue;
    if (att.bytes.length > MAX_INLINE_ATTACHMENT_BYTES) continue;
    parts.push({ text: `\n[Visual attachment: ${att.fileName}]` });
    parts.push({
      inlineData: {
        mimeType: mime === "application/pdf" ? "application/pdf" : mime,
        data: att.bytes.toString("base64"),
      },
    });
  }

  return parts;
}

function resolveVisionModel(): string {
  return process.env.GEMINI_VISION_MODEL?.trim() || "gemini-2.5-flash-lite";
}

function resolveDraftModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
}

const VISION_MODEL_FALLBACKS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash"];
const DRAFT_MODEL_FALLBACKS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash"];

function uniqueModels(primary: string, fallbacks: string[]): string[] {
  const ordered = primary ? [primary, ...fallbacks] : fallbacks;
  return [...new Set(ordered.filter(Boolean))];
}

function visionModelCandidates(): string[] {
  const primary = resolveVisionModel();
  if (primary.includes("1.5")) {
    console.warn("[staveto-ai] GEMINI_VISION_MODEL is deprecated:", primary);
    return uniqueModels("", VISION_MODEL_FALLBACKS);
  }
  return uniqueModels(primary, VISION_MODEL_FALLBACKS);
}

function draftModelCandidates(): string[] {
  const primary = resolveDraftModel();
  if (primary.includes("1.5")) {
    console.warn("[staveto-ai] GEMINI_MODEL is deprecated:", primary);
    return uniqueModels("", DRAFT_MODEL_FALLBACKS);
  }
  return uniqueModels(primary, DRAFT_MODEL_FALLBACKS);
}

async function runWithModelFallback<T>(
  candidates: string[],
  run: (modelName: string) => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < candidates.length; i++) {
    try {
      return await run(candidates[i]);
    } catch (err) {
      lastErr = err;
      if (!isGeminiRetryableError(err) || i === candidates.length - 1) {
        throw err;
      }
      console.warn("[staveto-ai] model unavailable, trying fallback:", candidates[i]);
    }
  }
  throw lastErr;
}

export async function summarizeAttachmentsWithGemini(
  attachments: GeminiInlineAttachment[],
  language: "sk" | "de" | "en"
): Promise<AttachmentSummary[]> {
  if (attachments.length === 0) return [];

  const genAI = new GoogleGenerativeAI(getApiKey());
  const lang = languageLabel(language);

  const summarizeOne = async (att: GeminiInlineAttachment): Promise<AttachmentSummary> => {
    const mime = att.mimeType.toLowerCase();
    const isPdf = mime === "application/pdf";
    const prompt = buildAttachmentVisionPrompt(lang, att.fileName);

    const text = await runWithModelFallback(visionModelCandidates(), async (modelName) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 3072,
          temperature: 0.1,
        },
      });
      return runWithGeminiRetry(async () => {
        const response = await model.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: isPdf ? "application/pdf" : mime,
              data: att.bytes.toString("base64"),
            },
          },
        ]);
        return response.response.text().trim();
      });
    });

    try {
      return parseAttachmentSummaryJson(text, att.fileName);
    } catch {
      return emptyAttachmentSummary(
        att.fileName,
        text.slice(0, 1200) || "Attachment could not be parsed as structured JSON."
      );
    }
  };

  const results = await Promise.all(
    attachments.map(async (att) => {
      try {
        return await summarizeOne(att);
      } catch {
        return emptyAttachmentSummary(att.fileName, "AI vision could not read this attachment.");
      }
    })
  );

  return results.filter(
    (r) =>
      r.extractedTextSummary.trim().length > 0 ||
      r.roomsAndAreas.length > 0 ||
      r.detectedMaterials.length > 0
  );
}

export async function generateDraftWithGemini(
  userPrompt: string,
  options?: { retryInvalidJson?: boolean; attachments?: GeminiInlineAttachment[] }
): Promise<ProjectDraftPayload> {
  const genAI = new GoogleGenerativeAI(getApiKey());

  const useInlineVision =
    (options?.attachments?.length ?? 0) > 0 &&
    process.env.GEMINI_DRAFT_INLINE_VISION === "1";

  const run = async (prompt: string) =>
    runWithModelFallback(draftModelCandidates(), async (modelName) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.35,
          maxOutputTokens: 8192,
        },
      });
      return runWithGeminiRetry(async () => {
        const parts =
          useInlineVision ?
            buildGeminiContentParts(prompt, options?.attachments)
          : [{ text: prompt }];
        const result = await model.generateContent(parts);
        return result.response.text();
      });
    });

  let text = await run(userPrompt);
  try {
    return parseProjectDraftJson(text);
  } catch (firstErr) {
    if (!options?.retryInvalidJson) throw firstErr;
    const fixPrompt = `${userPrompt}

Your previous response was not valid JSON. Return ONLY valid JSON matching the schema. No markdown.`;
    text = await run(fixPrompt);
    return parseProjectDraftJson(text);
  }
}

export function buildGeneratePrompt(params: {
  language: "sk" | "de" | "en";
  jobType: string;
  contactMode: string;
  contactSummary?: string;
  description: string;
  location?: string;
  documentTexts?: { fileName: string; text: string }[];
  attachmentFindingsText?: string;
}): string {
  const docs =
    params.documentTexts?.length ?
      params.documentTexts
        .map((d) => `--- ${d.fileName} ---\n${d.text.slice(0, 6000)}`)
        .join("\n\n")
    : "None";

  const attachmentFindings = params.attachmentFindingsText?.trim() || "None";

  return `Return a single JSON object matching this schema:
{
  "projectTitle": string,
  "projectType": string,
  "status": "lead" | "draft",
  "summary": string,
  "customer": { "mode": "existing"|"new"|"none", "contactId": string|null, "name": string|null, "email": string|null, "phone": string|null },
  "location": string|null,
  "tasks": [{ "title": string, "description": string, "phase": string|null, "priority": "low"|"medium"|"high", "estimatedDuration": string|null }],
  "materials": [{ "name": string, "quantity": number|null, "unit": string|null, "note": string|null }],
  "clarificationQuestions": string[],
  "risks": string[],
  "nextSteps": string[],
  "offerPreparation": {
    "suggestedLineItems": [{ "title": string, "description": string, "category": "work"|"material"|"travel"|"other", "quantity": number|null, "unit": string|null }],
    "missingPricingInputs": string[]
  },
  "source": { "creationMethod": "ai", "attachedFileIds": string[], "generatedAt": string },
  "attachmentFindings": optional AttachmentSummary[],
  "projectFacts": optional { "buildingType"?: string, "totalKnownAreaM2"?: number, "rooms"?: [{ "name": string, "areaM2"?: number }], "dimensions"?: [{ "label": string, "value": string }] },
  "materialSuggestions": optional [{ "name": string, "category": string, "quantity"?: number, "unit"?: string, "confidence": "low"|"medium"|"high", "source": "attachment"|"user_text"|"inferred", "sourceNote"?: string }],
  "missingQuestions": optional string[],
  "draftWarnings": optional string[]
}

Language for all human-readable strings: ${languageLabel(params.language)}.
Job type (work type enum): ${params.jobType}
Contact mode: ${params.contactMode}
Contact info: ${params.contactSummary ?? "None"}
Location: ${params.location ?? "Not specified"}

User description:
${params.description}

ATTACHMENT FINDINGS (primary project context — do not ignore):
${attachmentFindings}

Use ATTACHMENT FINDINGS as primary project context.
If user text and attachment conflict, mention the conflict in draftWarnings.
Do not ignore attachment findings.
Do not invent exact quantities unless clearly visible in attachments.

Additional plain-text extracts (secondary):
${docs}

Material rules:
- If attachment contains explicit material list, use materials[] with note referencing the document.
- If attachment is floor plan only, populate materialSuggestions[] with useful construction categories (masonry, insulation, windows/doors, plumbing, electrical, flooring, plaster/paint, etc.) as inferred with low/medium confidence.
- Set quantity null and add note "Quantity not found in attachment" when not visible.
- Populate missingQuestions[] from attachment gaps and clarificationQuestions[] for the user.
- Populate projectFacts.rooms and projectFacts.dimensions from attachment findings when available.
- Copy attachmentFindings from the structured summaries provided above.

List each material once only in materials[] — do not repeat the same item in offerPreparation.suggestedLineItems.
Avoid umbrella duplicates (e.g. do not list both "Elektrokabel" and "Elektromaterial").
Up to 20 material rows when attachment scope supports it.

Up to 6 phases and 20 tasks when attachment scope supports it.
Prefer short task titles and brief descriptions with estimatedDuration when inferrable.

Set source.creationMethod to "ai" and source.attachedFileIds to the IDs provided in context if any.
Set status to "draft".`;
}

export function buildUpdatePrompt(params: {
  language: "sk" | "de" | "en";
  existingDraft: ProjectDraftPayload;
  userMessage: string;
  attachedFileIds: string[];
  attachmentFindingsText?: string;
}): string {
  const findings =
    params.attachmentFindingsText?.trim() ||
    (params.existingDraft.attachmentFindings?.length ?
      JSON.stringify(params.existingDraft.attachmentFindings, null, 2)
    : "None stored");

  return `Update the existing project draft JSON according to the user instruction.
Return the FULL updated JSON object only (same schema). Do not remove unrelated sections unless asked.
Language: ${languageLabel(params.language)}
Attached file IDs (unchanged unless user asks): ${JSON.stringify(params.attachedFileIds)}

ATTACHMENT FINDINGS (preserve and use when refining materials, rooms, tasks, or questions):
${findings}

Do not invent exact quantities unless visible in attachment findings.
If refining materials from attachments, populate materialSuggestions[] with source and confidence.

Current draft:
${JSON.stringify(params.existingDraft, null, 2)}

User instruction:
${params.userMessage}`;
}

export async function describeAttachmentWithGemini(params: {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<string> {
  const mime = params.mimeType.toLowerCase();
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  if (!isImage && !isPdf) {
    return "";
  }

  const genAI = new GoogleGenerativeAI(getApiKey());
  const prompt = isImage
    ? `You analyze construction site / plan / equipment photos for project planning.
Describe "${params.fileName}" in detail: rooms, installations, visible defects, materials, dimensions if readable, and implied work steps.
Write in the same language as visible text on the photo; otherwise use English.`
    : `You analyze construction-related PDF attachments for project planning.
Summarize "${params.fileName}": scope, locations, quantities, materials, deadlines, and action items.
Write in the document language when obvious; otherwise use English.`;

  const result = await runWithModelFallback(visionModelCandidates(), async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    });
    return runWithGeminiRetry(async () => {
      const response = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: isPdf ? "application/pdf" : mime,
            data: params.bytes.toString("base64"),
          },
        },
      ]);
      return response.response.text().trim();
    });
  });

  return result.slice(0, 12000);
}
