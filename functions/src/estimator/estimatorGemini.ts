import { GoogleGenerativeAI } from "@google/generative-ai";
import { languageLabel } from "../draftPrompt";
import {
  buildElectricalMarkingPrompt,
  buildElectricalSymbolReadingPrompt,
  buildGenericDocumentEstimatorPrompt,
  buildPhotoEstimatorPrompt,
  buildTextOnlyEstimatorPrompt,
  buildEstimateFromFactsPrompt,
  buildQuoteDraftFromEstimatePrompt,
} from "./estimatorPrompts";
import {
  createEvidenceSource,
  normalizeEvidenceSource,
} from "../utils/firestoreSanitizer";
import {
  parseEstimatorFactsJson,
  parseLooseJsonObject,
  parseQuoteDraftJson,
  type EstimatorFactsPayload,
  type QuoteDraftPayload,
  estimateLineSchema,
} from "./estimatorSchema";
import { z } from "zod";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  return key;
}

function isRetryable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("quota") ||
    msg.includes("overloaded") ||
    msg.includes("resource_exhausted") ||
    msg.includes("high demand")
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryable(e) || i === attempts - 1) throw e;
      await sleep(2000 + i * 2000);
    }
  }
  throw last;
}

const MODEL_FALLBACKS = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash"];

function modelCandidates(envName: string): string[] {
  const primary = process.env[envName]?.trim() || "gemini-2.5-flash-lite";
  return [...new Set([primary, ...MODEL_FALLBACKS].filter(Boolean))];
}

export async function generateJsonText(params: {
  prompt: string;
  system?: string;
  attachments?: Array<{ mimeType: string; fileName: string; bytes: Buffer }>;
  maxOutputTokens: number;
  temperature: number;
  envModel: string;
}): Promise<string> {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const candidates = modelCandidates(params.envModel);
  let lastErr: unknown;
  for (const modelName of candidates) {
    try {
      return await withRetry(async () => {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: params.system,
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: params.maxOutputTokens,
            temperature: params.temperature,
          },
        });
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
          { text: params.prompt },
        ];
        for (const att of params.attachments ?? []) {
          const mime = att.mimeType.toLowerCase();
          if (!mime.startsWith("image/") && mime !== "application/pdf") continue;
          if (att.bytes.length > 18 * 1024 * 1024) continue;
          parts.push({ text: `\n[File: ${att.fileName}]` });
          parts.push({
            inlineData: {
              mimeType: mime === "application/pdf" ? "application/pdf" : mime,
              data: att.bytes.toString("base64"),
            },
          });
        }
        const result = await model.generateContent(parts);
        return result.response.text().trim();
      });
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
    }
  }
  throw lastErr;
}

const ESTIMATOR_SYSTEM = `You are Staveto AI Document Intelligence and Estimator.
Return valid JSON only.
Do not invent exact prices or quantities.
Preserve row-level detail from drawings and legends.
Mark uncertain rows with needsReview=true.
Never claim inferred items are from_document.`;

export type EstimatorAttachment = {
  fileId?: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  /** Optional PDF/text-layer extract when already available on the draft file. */
  extractedText?: string;
  /** 1-based page when processing a single-page PDF split. */
  pageNumber?: number;
};

function guessDocKind(
  mime: string,
  fileName: string,
  tradeType?: string
): "electrical" | "photo" | "generic" {
  const name = fileName.toLowerCase();
  if (mime.startsWith("image/")) return "photo";
  const trade = (tradeType ?? "").toLowerCase();
  if (
    name.includes("elektr") ||
    name.includes("osvet") ||
    name.includes("znacen") ||
    name.includes("znač") ||
    name.includes("lighting") ||
    name.includes("elektro") ||
    name.includes("marking") ||
    name.includes("pudorys") ||
    name.includes("pôdorys") ||
    trade.includes("elektr") ||
    trade.includes("elektro") ||
    trade.includes("lighting")
  ) {
    return "electrical";
  }
  return "generic";
}

export async function extractFactsFromAttachment(params: {
  language: "sk" | "de" | "en";
  countryCode: string;
  currency: string;
  tradeType: string;
  attachment: EstimatorAttachment;
  sessionId: string;
  enableSymbolReading?: boolean;
  /** Compact knowledge-backend context (symbols/assemblies/labor) — see knowledgeContext.ts. */
  knowledgeContext?: string;
}): Promise<EstimatorFactsPayload> {
  const lang = languageLabel(params.language);
  const kind = guessDocKind(
    params.attachment.mimeType,
    params.attachment.fileName,
    params.tradeType
  );
  const pageHint =
    params.attachment.pageNumber != null
      ? `\nThis attachment is PAGE ${params.attachment.pageNumber} of the original PDF "${params.attachment.fileName}". Set evidence.page=${params.attachment.pageNumber} on every extracted row from this page.`
      : "";
  const prompt =
    (kind === "electrical"
      ? params.enableSymbolReading !== false
        ? buildElectricalSymbolReadingPrompt({
            language: lang,
            fileName: params.attachment.fileName,
            countryCode: params.countryCode,
            currency: params.currency,
            tradeType: params.tradeType,
          })
        : buildElectricalMarkingPrompt({
            language: lang,
            fileName: params.attachment.fileName,
            countryCode: params.countryCode,
            currency: params.currency,
            tradeType: params.tradeType,
          })
      : kind === "photo"
        ? buildPhotoEstimatorPrompt({
            language: lang,
            fileName: params.attachment.fileName,
            countryCode: params.countryCode,
          })
        : buildGenericDocumentEstimatorPrompt({
            language: lang,
            fileName: params.attachment.fileName,
            countryCode: params.countryCode,
            currency: params.currency,
          })) + pageHint;

  const layer =
    params.attachment.extractedText && params.attachment.extractedText.trim().length > 40
      ? `\n\nExtracted text layer (use for tables/legends; still verify against the visual):\n${params.attachment.extractedText.slice(0, 12000)}`
      : "";

  const knowledge =
    kind === "electrical" && params.knowledgeContext?.trim()
      ? `\n\nSTRUCTURED KNOWLEDGE CONTEXT (project legend still wins over everything below):\n${params.knowledgeContext.trim()}`
      : "";

  const text = await generateJsonText({
    prompt: prompt + knowledge + layer,
    system: ESTIMATOR_SYSTEM,
    attachments: [params.attachment],
    maxOutputTokens: 32768,
    temperature: 0.15,
    envModel: "GEMINI_VISION_MODEL",
  });

  const facts = parseEstimatorFactsJson(text, params.sessionId);
  const defaultPage =
    typeof params.attachment.pageNumber === "number" &&
    Number.isFinite(params.attachment.pageNumber)
      ? params.attachment.pageNumber
      : undefined;
  const defaultInputType = params.attachment.mimeType.startsWith("image/")
    ? ("image" as const)
    : ("pdf" as const);
  const evidenceDefaults = {
    fileName: params.attachment.fileName,
    fileId: params.attachment.fileId,
    page: defaultPage,
    inputType: defaultInputType,
  };

  const stampEvidenceList = (
    list: EstimatorFactsPayload["extractedItems"][number]["evidence"] | undefined
  ) => {
    if (!list || list.length === 0) {
      return [createEvidenceSource(evidenceDefaults)];
    }
    return list.map((e) => normalizeEvidenceSource(e, evidenceDefaults));
  };

  const stampItems = (items: EstimatorFactsPayload["extractedItems"]) =>
    items.map((item) => ({
      ...item,
      evidence: stampEvidenceList(item.evidence),
    }));

  const stampWithEvidence = <
    T extends { evidence: EstimatorFactsPayload["extractedItems"][number]["evidence"] },
  >(
    rows: T[]
  ): T[] =>
    rows.map((row) => ({
      ...row,
      evidence: stampEvidenceList(row.evidence),
    }));

  return {
    ...facts,
    rooms: facts.rooms.map((room) => ({
      ...room,
      evidence: stampEvidenceList(room.evidence),
    })),
    extractedItems: stampItems(facts.extractedItems),
    inferredItems: stampItems(facts.inferredItems),
    legendEntries: stampWithEvidence(facts.legendEntries ?? []),
    symbolOccurrences: stampWithEvidence(facts.symbolOccurrences ?? []),
    unknownSymbols: stampWithEvidence(facts.unknownSymbols ?? []),
  };
}

export async function extractFactsFromTextOnly(params: {
  language: "sk" | "de" | "en";
  countryCode: string;
  currency: string;
  tradeType: string;
  description: string;
  location?: string;
  sessionId: string;
}): Promise<EstimatorFactsPayload> {
  const prompt = buildTextOnlyEstimatorPrompt({
    language: languageLabel(params.language),
    countryCode: params.countryCode,
    currency: params.currency,
    tradeType: params.tradeType,
    description: params.description,
    location: params.location,
  });
  const text = await generateJsonText({
    prompt,
    system: ESTIMATOR_SYSTEM,
    maxOutputTokens: 16384,
    temperature: 0.25,
    envModel: "GEMINI_MODEL",
  });
  return parseEstimatorFactsJson(text, params.sessionId);
}

export async function generateEstimateLinesFromFacts(params: {
  language: "sk" | "de" | "en";
  countryCode: string;
  currency: string;
  vatPercent: number;
  hourlyRate?: number;
  travelRate?: number;
  marginPercent?: number;
  facts: EstimatorFactsPayload;
}): Promise<z.infer<typeof estimateLineSchema>[]> {
  const prompt = buildEstimateFromFactsPrompt({
    language: languageLabel(params.language),
    countryCode: params.countryCode,
    currency: params.currency,
    vatPercent: params.vatPercent,
    hourlyRate: params.hourlyRate,
    travelRate: params.travelRate,
    marginPercent: params.marginPercent,
    factsJson: JSON.stringify(params.facts),
  });
  const text = await generateJsonText({
    prompt,
    system: ESTIMATOR_SYSTEM,
    maxOutputTokens: 16384,
    temperature: 0.2,
    envModel: "GEMINI_MODEL",
  });
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const raw = parseLooseJsonObject(cleaned) as { lines?: unknown[] };
  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  const out: z.infer<typeof estimateLineSchema>[] = [];
  const validOrigins = new Set([
    "from_document",
    "from_photo",
    "from_user_text",
    "inferred",
    "assumption",
    "missing",
  ]);
  const validTypes = new Set(["material", "labor", "travel", "subcontractor", "other"]);
  lines.forEach((line, i) => {
    const row = (typeof line === "object" && line ? line : {}) as Record<string, unknown>;
    const asString = (v: unknown, fb = ""): string =>
      typeof v === "string" ? v : v == null ? fb : String(v);
    const asNumber = (v: unknown, fb: number): number => {
      if (typeof v === "number" && !Number.isNaN(v)) return v;
      const n = Number(asString(v).replace(",", "."));
      return Number.isFinite(n) ? n : fb;
    };
    const title = asString(row.title ?? row.name ?? row.label).trim() || `Položka ${i + 1}`;
    const typeRaw = asString(row.type).toLowerCase();
    const originRaw = asString(row.origin);
    const confRaw = asString(row.confidence).toLowerCase();
    const parsed = estimateLineSchema.safeParse({
      ...row,
      id: typeof row.id === "string" && row.id ? row.id : `line_${i + 1}`,
      type: validTypes.has(typeRaw) ? typeRaw : "material",
      title,
      quantity: asNumber(row.quantity, 1),
      unit: asString(row.unit, "ks").trim() || "ks",
      origin: validOrigins.has(originRaw) ? originRaw : "inferred",
      confidence: ["high", "medium", "low"].includes(confRaw) ? confRaw : "medium",
    });
    if (parsed.success) out.push(parsed.data);
  });
  return out;
}

export async function generateQuoteDraftFromFacts(params: {
  language: "sk" | "de" | "en";
  countryCode: string;
  currency: string;
  vatPercent: number;
  legalNotes: string[];
  title: string;
  customerName?: string;
  projectAddress?: string;
  facts: EstimatorFactsPayload;
  lines: z.infer<typeof estimateLineSchema>[];
}): Promise<QuoteDraftPayload> {
  const prompt = buildQuoteDraftFromEstimatePrompt({
    language: languageLabel(params.language),
    countryCode: params.countryCode,
    currency: params.currency,
    vatPercent: params.vatPercent,
    legalNotes: params.legalNotes,
    title: params.title,
    customerName: params.customerName,
    projectAddress: params.projectAddress,
    factsJson: JSON.stringify(params.facts),
    linesJson: JSON.stringify(params.lines),
  });
  const text = await generateJsonText({
    prompt,
    system: ESTIMATOR_SYSTEM,
    maxOutputTokens: 16384,
    temperature: 0.25,
    envModel: "GEMINI_MODEL",
  });
  return parseQuoteDraftJson(text, params.facts.sessionId);
}
