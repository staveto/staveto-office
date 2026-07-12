import { z } from "zod";
import { createEvidenceSource, normalizeEvidenceSource } from "../utils/firestoreSanitizer";

export const aiUnitSchema = z.preprocess((val) => {
  if (val == null || val === "") return undefined;
  if (typeof val !== "string" && typeof val !== "number") return "unknown";
  const n = String(val)
    .trim()
    .toLowerCase()
    .replace(/m²/g, "m2")
    .replace(/m\^2/g, "m2")
    .replace(/m2/g, "m2");
  const map: Record<string, string> = {
    ks: "ks",
    pcs: "ks",
    pc: "ks",
    piece: "ks",
    pieces: "ks",
    kus: "ks",
    kusy: "ks",
    stk: "ks",
    m: "m",
    meter: "m",
    metres: "m",
    meters: "m",
    bm: "m",
    lm: "m",
    m2: "m2",
    sqm: "m2",
    hod: "hod",
    h: "hod",
    hour: "hod",
    hours: "hod",
    hr: "hod",
    bod: "bod",
    set: "set",
    sada: "set",
    pausal: "pausal",
    paušál: "pausal",
    unknown: "unknown",
  };
  return map[n] ?? (["ks", "m", "m2", "hod", "bod", "set", "pausal", "unknown"].includes(n) ? n : "unknown");
}, z.enum(["ks", "m", "m2", "hod", "bod", "set", "pausal", "unknown"]).optional());

export const aiConfidenceSchema = z.preprocess((val) => {
  if (typeof val !== "string") return "medium";
  const n = val.trim().toLowerCase();
  return ["high", "medium", "low"].includes(n) ? n : "medium";
}, z.enum(["high", "medium", "low"]));
export const aiOriginSchema = z.enum([
  "from_document",
  "from_photo",
  "from_user_text",
  "inferred",
  "assumption",
  "missing",
]);
export const aiDocumentTypeSchema = z.enum([
  "electrical_marking",
  "floor_plan",
  "material_list",
  "quote_request",
  "site_photo",
  "customer_description",
  "technical_specification",
  "unknown",
]);
export const aiItemCategorySchema = z.enum([
  "lighting",
  "socket",
  "switch",
  "cable",
  "led_strip",
  "distribution_board",
  "installation_material",
  "labor",
  "travel",
  "other",
]);

const evidenceSchema = z.object({
  fileId: z.string().optional(),
  fileName: z.string().optional(),
  page: z.number().optional(),
  regionLabel: z.string().optional(),
  inputType: z.enum(["pdf", "image", "text", "email", "voice", "unknown"]).default("unknown"),
});

export const extractedRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().optional(),
  areaM2: z.number().optional(),
  floor: z.string().optional(),
  evidence: z.array(evidenceSchema).default([]),
  confidence: aiConfidenceSchema.default("medium"),
  needsReview: z.boolean().default(false),
});

export const extractedItemSchema = z.object({
  id: z.string(),
  category: aiItemCategorySchema.default("other"),
  roomId: z.string().optional(),
  roomName: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: aiUnitSchema.optional(),
  multiplier: z.number().optional(),
  computedQuantity: z.number().optional(),
  origin: aiOriginSchema,
  evidence: z.array(evidenceSchema).default([]),
  confidence: aiConfidenceSchema.default("medium"),
  needsReview: z.boolean().default(false),
  reviewReason: z.string().optional(),
  included: z.boolean().optional(),
});

export const missingQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  reason: z.string().default(""),
  importance: z.enum(["critical", "important", "nice_to_have"]).default("important"),
  blocksFixedQuote: z.boolean().default(false),
  suggestedAnswer: z.string().optional(),
});

export const riskWarningSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["high", "medium", "low"]).default("medium"),
  commercialImpact: z.string().optional(),
});

export const aiTradeSchema = z
  .enum(["electrical", "hvac", "plumbing", "flooring", "roofing", "general"])
  .default("general");

export const aiSymbolTypeSchema = z
  .enum([
    "pendant_light",
    "ceiling_light",
    "wall_light",
    "led_strip",
    "lighting_profile",
    "mirror_light_output",
    "furniture_light",
    "socket",
    "switch",
    "distribution_board",
    "cable_route",
    "unknown",
  ])
  .default("unknown");

export const drawingRegionSchema = z.object({
  id: z.string(),
  page: z.number().default(1),
  label: z.string().optional(),
  regionType: z
    .enum(["legend", "floor_plan", "room", "title_block", "table", "unknown"])
    .default("unknown"),
  confidence: aiConfidenceSchema.default("medium"),
});

export const legendEntrySchema = z.object({
  id: z.string(),
  trade: aiTradeSchema,
  symbolLabel: z.string().optional(),
  symbolDescription: z.string(),
  normalizedType: aiSymbolTypeSchema,
  unit: aiUnitSchema.optional(),
  defaultQuoteCategory: z
    .enum(["material", "labor", "material_and_labor", "review_only"])
    .default("material_and_labor"),
  evidence: z.array(evidenceSchema).default([]),
  confidence: aiConfidenceSchema.default("medium"),
  needsReview: z.boolean().default(false),
});

export const symbolOccurrenceSchema = z.object({
  id: z.string(),
  legendEntryId: z.string().optional(),
  page: z.number().default(1),
  roomId: z.string().optional(),
  roomName: z.string().optional(),
  normalizedType: aiSymbolTypeSchema,
  title: z.string(),
  quantity: z.number().optional(),
  unit: aiUnitSchema.optional(),
  visibleLabel: z.string().optional(),
  origin: aiOriginSchema.default("from_document"),
  evidence: z.array(evidenceSchema).default([]),
  confidence: aiConfidenceSchema.default("medium"),
  needsReview: z.boolean().default(false),
  reviewReason: z.string().optional(),
});

export const companyFocusSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  focusType: z
    .enum([
      "quote_line",
      "material_purchase",
      "labor_planning",
      "site_verification",
      "customer_question",
      "risk",
      "execution_task",
    ])
    .default("quote_line"),
  importance: z.enum(["critical", "important", "nice_to_have"]).default("important"),
  relatedRoomId: z.string().optional(),
  relatedSymbolIds: z.array(z.string()).optional(),
  relatedItemIds: z.array(z.string()).optional(),
});

export const estimatorFactsSchema = z.object({
  sessionId: z.string(),
  detectedDocumentTypes: z.array(aiDocumentTypeSchema).default([]),
  inputSummary: z.string().default(""),
  rooms: z.array(extractedRoomSchema).default([]),
  extractedItems: z.array(extractedItemSchema).default([]),
  inferredItems: z.array(extractedItemSchema).default([]),
  missingQuestions: z.array(missingQuestionSchema).default([]),
  risks: z.array(riskWarningSchema).default([]),
  confidence: aiConfidenceSchema.default("medium"),
  warnings: z.preprocess((val) => {
    if (!Array.isArray(val)) return [];
    return val.map((w) => {
      if (typeof w === "string") return w;
      if (w && typeof w === "object" && !Array.isArray(w)) {
        const o = w as Record<string, unknown>;
        for (const k of ["message", "text", "warning", "title", "description", "note"]) {
          if (typeof o[k] === "string" && (o[k] as string).trim()) return o[k];
        }
        try {
          return JSON.stringify(w);
        } catch {
          return "Upozornenie";
        }
      }
      return String(w ?? "");
    }).filter((s) => typeof s === "string" && s.trim().length > 0);
  }, z.array(z.string()).default([])),
  drawingRegions: z.array(drawingRegionSchema).default([]),
  legendEntries: z.array(legendEntrySchema).default([]),
  symbolOccurrences: z.array(symbolOccurrenceSchema).default([]),
  unknownSymbols: z.array(symbolOccurrenceSchema).default([]),
  companyFocus: z.array(companyFocusSchema).default([]),
});

export type LegendEntryPayload = z.infer<typeof legendEntrySchema>;
export type SymbolOccurrencePayload = z.infer<typeof symbolOccurrenceSchema>;
export type CompanyFocusPayload = z.infer<typeof companyFocusSchema>;
export type DrawingRegionPayload = z.infer<typeof drawingRegionSchema>;

export type EstimatorFactsPayload = z.infer<typeof estimatorFactsSchema>;

export const estimateLineSchema = z.object({
  id: z.string(),
  type: z.enum(["material", "labor", "travel", "subcontractor", "other"]),
  title: z.string(),
  description: z.string().optional(),
  quantity: z.number(),
  unit: z.string(),
  unitCost: z.number().optional(),
  unitPrice: z.number().optional(),
  marginPercent: z.number().optional(),
  totalCost: z.number().optional(),
  totalPrice: z.number().optional(),
  origin: aiOriginSchema,
  confidence: aiConfidenceSchema,
  needsReview: z.boolean().default(false),
  evidence: z.array(evidenceSchema).default([]),
  roomName: z.string().optional(),
});

export const quoteDraftSchema = z.object({
  title: z.string(),
  customerName: z.string().optional(),
  projectAddress: z.string().optional(),
  countryCode: z.string().optional(),
  currency: z.string().default("EUR"),
  vatPercent: z.number().optional(),
  language: z.string().default("sk"),
  scopeIncluded: z.array(z.string()).default([]),
  scopeExcluded: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  missingBeforeFixedPrice: z.array(missingQuestionSchema).default([]),
  lines: z.array(estimateLineSchema).default([]),
  subtotal: z.number().optional(),
  vatAmount: z.number().optional(),
  total: z.number().optional(),
  validityDays: z.number().optional(),
  noteToCustomer: z.string().default(""),
  estimatorSessionId: z.string().optional(),
});

export type QuoteDraftPayload = z.infer<typeof quoteDraftSchema>;

function newId(prefix: string, index: number): string {
  return `${prefix}_${index + 1}`;
}

function tryJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/**
 * Parse JSON that may be truncated by the model's output-token limit.
 * Falls back to closing any open arrays/objects at the last complete element.
 */
export function parseLooseJsonObject(cleaned: string): Record<string, unknown> {
  const firstBrace = cleaned.search(/[{[]/);
  const src = firstBrace > 0 ? cleaned.slice(firstBrace) : cleaned;

  const direct = tryJsonParse(src);
  if (direct && typeof direct === "object") return direct as Record<string, unknown>;

  // Find the last structurally-safe boundary (after a closing bracket, or before a comma).
  let inStr = false;
  let esc = false;
  let safeLen = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === "}" || c === "]") {
      safeLen = i + 1;
    } else if (c === ",") {
      safeLen = i;
    }
  }
  if (safeLen <= 0) throw new Error("Could not repair truncated JSON.");

  const prefix = src.slice(0, safeLen).replace(/,\s*$/, "");

  // Recompute which containers remain open in the prefix, then close them.
  const open: string[] = [];
  let s2 = false;
  let e2 = false;
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i];
    if (s2) {
      if (e2) e2 = false;
      else if (c === "\\") e2 = true;
      else if (c === '"') s2 = false;
      continue;
    }
    if (c === '"') s2 = true;
    else if (c === "{") open.push("}");
    else if (c === "[") open.push("]");
    else if (c === "}" || c === "]") open.pop();
  }
  const repaired = prefix + open.reverse().join("");
  const parsed = tryJsonParse(repaired);
  if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  throw new Error("Could not repair truncated JSON.");
}

/** Coerce arbitrary model output into a readable string (Gemini sometimes nests objects). */
function coerceString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const joined = v
      .map((x) => coerceString(x, ""))
      .filter((s) => s.trim().length > 0)
      .join("; ");
    return joined || fallback;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["summary", "text", "value", "description", "content", "label", "note"]) {
      if (typeof o[k] === "string" && (o[k] as string).trim()) return o[k] as string;
    }
    try {
      return JSON.stringify(v);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

const VALID_ORIGINS = new Set([
  "from_document",
  "from_photo",
  "from_user_text",
  "inferred",
  "assumption",
  "missing",
]);

function coerceOrigin(v: unknown, fallback: string): string {
  return typeof v === "string" && VALID_ORIGINS.has(v) ? v : fallback;
}

function pickTitle(row: Record<string, unknown>): string {
  for (const k of ["title", "name", "label", "item", "product", "position"]) {
    const s = coerceString(row[k], "");
    if (s.trim()) return s.trim();
  }
  return "";
}

/** Normalize an item row so `title` and `origin` are always valid before schema parse. */
function normalizeEvidenceList(raw: unknown): ReturnType<typeof createEvidenceSource>[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((e) => normalizeEvidenceSource(e));
}

function coerceUnit(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const n = String(v)
    .trim()
    .toLowerCase()
    .replace(/m²/g, "m2")
    .replace(/m\^2/g, "m2");
  const map: Record<string, string> = {
    ks: "ks",
    pcs: "ks",
    pc: "ks",
    piece: "ks",
    pieces: "ks",
    kus: "ks",
    kusy: "ks",
    stk: "ks",
    m: "m",
    meter: "m",
    metres: "m",
    meters: "m",
    bm: "m",
    lm: "m",
    m2: "m2",
    sqm: "m2",
    hod: "hod",
    h: "hod",
    hour: "hod",
    hours: "hod",
    hr: "hod",
    bod: "bod",
    set: "set",
    sada: "set",
    pausal: "pausal",
    paušál: "pausal",
    unknown: "unknown",
  };
  return map[n] ?? (["ks", "m", "m2", "hod", "bod", "set", "pausal", "unknown"].includes(n) ? n : "unknown");
}

/** Gemini sometimes returns warnings as objects `{ message, severity }` instead of strings. */
function normalizeWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => {
      if (typeof w === "string") return w.trim();
      if (w && typeof w === "object" && !Array.isArray(w)) {
        const o = w as Record<string, unknown>;
        return coerceString(
          o.message ?? o.text ?? o.warning ?? o.title ?? o.description ?? o.note,
          ""
        ).trim();
      }
      return coerceString(w, "").trim();
    })
    .filter((s) => s.length > 0);
}

function normalizeItem(
  r: unknown,
  i: number,
  prefix: string,
  defaultOrigin: string
): Record<string, unknown> {
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const title = pickTitle(row);
  const description = coerceString(row.description, "");
  const unit = coerceUnit(row.unit);
  const out: Record<string, unknown> = {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId(prefix, i),
    title: title || description.slice(0, 80) || `Položka ${i + 1}`,
    origin: coerceOrigin(row.origin, defaultOrigin),
    evidence: normalizeEvidenceList(row.evidence),
  };
  if (description) out.description = description;
  else delete out.description;
  if (unit) out.unit = unit;
  else delete out.unit;
  return out;
}

/** Normalize a risk row; tolerate plain strings or alternate key names. */
function normalizeRisk(r: unknown, i: number): Record<string, unknown> {
  if (typeof r === "string") {
    return { id: newId("risk", i), title: r.slice(0, 80) || `Riziko ${i + 1}`, description: r };
  }
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const title = coerceString(row.title ?? row.name ?? row.risk ?? row.label, "");
  const description = coerceString(
    row.description ?? row.detail ?? row.impact ?? row.commercialImpact ?? row.risk,
    ""
  );
  const finalTitle = title || description.slice(0, 80) || `Riziko ${i + 1}`;
  return {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("risk", i),
    title: finalTitle,
    description: description || finalTitle,
  };
}

function normalizeQuestion(r: unknown, i: number): Record<string, unknown> {
  if (typeof r === "string") {
    return { id: newId("q", i), question: r };
  }
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const question = coerceString(row.question ?? row.text ?? row.label, "");
  return {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("q", i),
    question: question || `Otázka ${i + 1}`,
    reason: coerceString(row.reason, ""),
  };
}

function normalizeRoom(r: unknown, i: number): Record<string, unknown> {
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const name = coerceString(row.name ?? row.title ?? row.label, "");
  return {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("room", i),
    name: name || `Miestnosť ${i + 1}`,
    evidence: normalizeEvidenceList(row.evidence),
  };
}

const VALID_SYMBOL_TYPES = new Set([
  "pendant_light",
  "ceiling_light",
  "wall_light",
  "led_strip",
  "lighting_profile",
  "mirror_light_output",
  "furniture_light",
  "socket",
  "switch",
  "distribution_board",
  "cable_route",
  "unknown",
]);

function coerceSymbolType(v: unknown): string {
  return typeof v === "string" && VALID_SYMBOL_TYPES.has(v) ? v : "unknown";
}

function normalizeLegendEntry(r: unknown, i: number): Record<string, unknown> {
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const desc = coerceString(row.symbolDescription ?? row.description ?? row.meaning ?? row.title, "");
  const unit = coerceUnit(row.unit);
  const out: Record<string, unknown> = {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("legend", i),
    symbolDescription: desc || `Legenda ${i + 1}`,
    normalizedType: coerceSymbolType(row.normalizedType),
    evidence: normalizeEvidenceList(row.evidence),
  };
  if (unit) out.unit = unit;
  else delete out.unit;
  return out;
}

function normalizeSymbolOccurrence(r: unknown, i: number): Record<string, unknown> {
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const title = pickTitle(row) || coerceString(row.visibleLabel ?? row.symbolDescription, "");
  const unit = coerceUnit(row.unit);
  const out: Record<string, unknown> = {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("sym", i),
    title: title || `Značka ${i + 1}`,
    normalizedType: coerceSymbolType(row.normalizedType),
    origin: coerceOrigin(row.origin, "from_document"),
    evidence: normalizeEvidenceList(row.evidence),
  };
  if (unit) out.unit = unit;
  else delete out.unit;
  return out;
}

function normalizeCompanyFocus(r: unknown, i: number): Record<string, unknown> {
  if (typeof r === "string") {
    return { id: newId("focus", i), title: r.slice(0, 120), description: r };
  }
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const title = coerceString(row.title ?? row.label ?? row.name, "");
  return {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("focus", i),
    title: title || `Fokus ${i + 1}`,
    description: coerceString(row.description ?? row.detail, ""),
  };
}

function normalizeRegion(r: unknown, i: number): Record<string, unknown> {
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  return {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("region", i),
  };
}

export function parseEstimatorFactsJson(text: string, sessionId: string): EstimatorFactsPayload {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const raw = parseLooseJsonObject(cleaned);
  const withIds = {
    ...raw,
    sessionId: typeof raw.sessionId === "string" && raw.sessionId ? raw.sessionId : sessionId,
    inputSummary: coerceString(raw.inputSummary, ""),
    rooms: Array.isArray(raw.rooms) ? raw.rooms.map((r, i) => normalizeRoom(r, i)) : [],
    extractedItems: Array.isArray(raw.extractedItems)
      ? raw.extractedItems.map((r, i) => normalizeItem(r, i, "item", "from_document"))
      : [],
    inferredItems: Array.isArray(raw.inferredItems)
      ? raw.inferredItems.map((r, i) => normalizeItem(r, i, "inf", "inferred"))
      : [],
    missingQuestions: Array.isArray(raw.missingQuestions)
      ? raw.missingQuestions.map((r, i) => normalizeQuestion(r, i))
      : [],
    risks: Array.isArray(raw.risks) ? raw.risks.map((r, i) => normalizeRisk(r, i)) : [],
    drawingRegions: Array.isArray(raw.drawingRegions)
      ? raw.drawingRegions.map((r, i) => normalizeRegion(r, i))
      : [],
    legendEntries: Array.isArray(raw.legendEntries)
      ? raw.legendEntries.map((r, i) => normalizeLegendEntry(r, i))
      : [],
    symbolOccurrences: Array.isArray(raw.symbolOccurrences)
      ? raw.symbolOccurrences.map((r, i) => normalizeSymbolOccurrence(r, i))
      : [],
    unknownSymbols: Array.isArray(raw.unknownSymbols)
      ? raw.unknownSymbols.map((r, i) => normalizeSymbolOccurrence(r, i))
      : [],
    companyFocus: Array.isArray(raw.companyFocus)
      ? raw.companyFocus.map((r, i) => normalizeCompanyFocus(r, i))
      : [],
    warnings: normalizeWarnings(raw.warnings),
    confidence: coerceString(raw.confidence, "medium").toLowerCase(),
  };
  return estimatorFactsSchema.parse(withIds);
}

const VALID_LINE_TYPES = new Set(["material", "labor", "travel", "subcontractor", "other"]);

function coerceNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = Number(coerceString(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLine(r: unknown, i: number): Record<string, unknown> {
  const row = (r && typeof r === "object" && !Array.isArray(r) ? r : {}) as Record<string, unknown>;
  const type = coerceString(row.type).toLowerCase();
  const origin = coerceString(row.origin);
  const confidence = coerceString(row.confidence).toLowerCase();
  return {
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : newId("line", i),
    type: VALID_LINE_TYPES.has(type) ? type : "material",
    title: pickTitle(row) || `Položka ${i + 1}`,
    quantity: coerceNumber(row.quantity, 1),
    unit: coerceString(row.unit, "ks").trim() || "ks",
    origin: VALID_ORIGINS.has(origin) ? origin : "inferred",
    confidence: ["high", "medium", "low"].includes(confidence) ? confidence : "medium",
  };
}

export function parseQuoteDraftJson(text: string, sessionId?: string): QuoteDraftPayload {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const raw = parseLooseJsonObject(cleaned);
  const lines = Array.isArray(raw.lines) ? raw.lines.map((r, i) => normalizeLine(r, i)) : [];
  return quoteDraftSchema.parse({
    ...raw,
    title: coerceString(raw.title, "Cenová ponuka") || "Cenová ponuka",
    noteToCustomer: coerceString(raw.noteToCustomer, ""),
    lines,
    missingBeforeFixedPrice: Array.isArray(raw.missingBeforeFixedPrice)
      ? raw.missingBeforeFixedPrice.map((r, i) => normalizeQuestion(r, i))
      : [],
    estimatorSessionId: raw.estimatorSessionId ?? sessionId,
  });
}
