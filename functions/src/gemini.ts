import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildAttachmentVisionPrompt } from "./attachmentPrompt";
import {
  emptyAttachmentSummary,
  parseAttachmentSummaryJson,
  type AttachmentSummary,
} from "./attachmentSummarySchema";
import { parseProjectDraftJson, type ProjectDraftPayload } from "./draftSchema";
import { languageLabel } from "./draftPrompt";

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

export { buildGeneratePrompt, buildUpdatePrompt } from "./draftPrompt";

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
