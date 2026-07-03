import { z } from "zod";
import {
  parseAreaM2FromText,
  parseLocalizedNumber,
  roundDocumentQuantity,
} from "./localizedNumber";

export const NUMBER_FORMAT_RULES = `NUMBER FORMAT (critical — Slovak/Czech/German/Swiss documents):
- Comma is the DECIMAL separator: "12,5 m²" means twelve point five (12.5), NOT 125 or 1250.
- Dot is the THOUSANDS separator: "1.234,56" means 1234.56.
- In JSON numeric fields (areaM2, quantity, totalKnownAreaM2) always output standard JSON numbers with a dot decimal: 12.5 — never strings like "12,5".
- Copy the printed value exactly; convert European notation to JSON number correctly.
- Room area "24,30 m²" → areaM2: 24.3. Wrong: 2430, 243, or 24,30 as string.
- If unsure about a digit, omit the number and ask in missingQuestions instead of guessing.`;

const localizedNumberSchema = z.preprocess((value) => {
  const parsed = parseLocalizedNumber(value as string | number | null | undefined);
  if (parsed === undefined) return undefined;
  return roundDocumentQuantity(parsed);
}, z.number().optional());

const nullishLocalizedNumber = z.preprocess((value) => {
  if (value === null || value === undefined) return undefined;
  const parsed = parseLocalizedNumber(value as string | number);
  if (parsed === undefined) return undefined;
  return roundDocumentQuantity(parsed);
}, z.number().optional());

export const documentTypeSchema = z.enum([
  "floor_plan",
  "technical_specification",
  "quote",
  "invoice",
  "photo",
  "unknown",
]);

const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value ?? undefined);

export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const attachmentSummarySchema = z.object({
  fileName: z.string(),
  documentType: documentTypeSchema.default("unknown"),
  extractedTextSummary: z.string().default(""),
  roomsAndAreas: z
    .array(
      z.object({
        roomName: z.string(),
        areaM2: localizedNumberSchema,
        floor: optionalString,
        sourceNote: optionalString,
      })
    )
    .default([]),
  dimensions: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        sourceNote: optionalString,
      })
    )
    .default([]),
  detectedScopeOfWork: z.array(z.string()).default([]),
  detectedMaterials: z
    .array(
      z.object({
        name: z.string(),
        category: optionalString,
        quantity: nullishLocalizedNumber,
        unit: optionalString,
        confidence: confidenceSchema.default("low"),
        sourceNote: optionalString,
      })
    )
    .default([]),
  timeOrDurationHints: z
    .array(
      z.object({
        description: z.string(),
        value: optionalString,
        sourceNote: optionalString,
      })
    )
    .default([]),
  risksOrConstraints: z.array(z.string()).default([]),
  missingQuestions: z.array(z.string()).default([]),
  confidence: confidenceSchema.default("low"),
});

export type AttachmentSummary = z.infer<typeof attachmentSummarySchema>;

export const materialSourceSchema = z.enum(["attachment", "user_text", "inferred"]);

export const draftMaterialSuggestionSchema = z.object({
  name: z.string(),
  category: z.string(),
  quantity: nullishLocalizedNumber,
  unit: optionalString,
  confidence: confidenceSchema.default("low"),
  source: materialSourceSchema,
  sourceNote: optionalString,
});

export const projectFactsSchema = z.object({
  buildingType: z.string().optional(),
  totalKnownAreaM2: localizedNumberSchema,
  rooms: z
    .array(
      z.object({
        name: z.string(),
        areaM2: localizedNumberSchema,
      })
    )
    .optional(),
  dimensions: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      })
    )
    .optional(),
});

export const processedFileStatusSchema = z.enum(["processed", "skipped", "failed"]);

export const extractedSignalsSchema = z.object({
  hasFloorPlan: z.boolean().optional(),
  hasRoomSchedule: z.boolean().optional(),
  hasDimensions: z.boolean().optional(),
  hasMaterialNotes: z.boolean().optional(),
  hasWorkScope: z.boolean().optional(),
});

export const processedFileDiagnosticSchema = z.object({
  name: z.string(),
  mimeType: z.string().optional(),
  status: processedFileStatusSchema,
  reason: z.string().optional(),
  extractedSignals: extractedSignalsSchema.optional(),
});

export const attachmentProcessingSchema = z.object({
  uploadedFileCount: z.number(),
  processedFileCount: z.number(),
  skippedFileCount: z.number(),
  processedFiles: z.array(processedFileDiagnosticSchema),
  warnings: z.array(z.string()),
});

export type AttachmentProcessing = z.infer<typeof attachmentProcessingSchema>;
export type ProcessedFileDiagnostic = z.infer<typeof processedFileDiagnosticSchema>;

function coerceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Pre-coerce string numbers before Zod — Gemini often returns "12,5" in JSON. */
export function normalizeAttachmentSummaryPayload(value: unknown): unknown {
  const root = coerceRecord(value);
  if (!root) return value;

  const rooms = Array.isArray(root.roomsAndAreas)
    ? root.roomsAndAreas.map((item) => {
        const row = coerceRecord(item);
        if (!row) return item;
        const area = parseLocalizedNumber(row.areaM2 as string | number);
        return {
          ...row,
          areaM2: area === undefined ? row.areaM2 : roundDocumentQuantity(area),
        };
      })
    : root.roomsAndAreas;

  const materials = Array.isArray(root.detectedMaterials)
    ? root.detectedMaterials.map((item) => {
        const row = coerceRecord(item);
        if (!row) return item;
        const qty = parseLocalizedNumber(row.quantity as string | number);
        return {
          ...row,
          quantity: qty === undefined ? row.quantity : roundDocumentQuantity(qty),
        };
      })
    : root.detectedMaterials;

  return { ...root, roomsAndAreas: rooms, detectedMaterials: materials };
}

function salvageRoomAreasFromNotes(summary: AttachmentSummary): AttachmentSummary {
  const rooms = summary.roomsAndAreas.map((room) => {
    if (room.areaM2 != null && room.areaM2 > 0) return room;
    const fromNote = room.sourceNote ? parseAreaM2FromText(room.sourceNote) : undefined;
    if (fromNote === undefined) return room;
    return { ...room, areaM2: roundDocumentQuantity(fromNote) };
  });
  return { ...summary, roomsAndAreas: rooms };
}

export function parseAttachmentSummaryJson(raw: string, fileName: string): AttachmentSummary {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  const normalized = normalizeAttachmentSummaryPayload(parsed);
  const result = attachmentSummarySchema.safeParse(normalized);
  if (result.success) return salvageRoomAreasFromNotes(result.data);
  return emptyAttachmentSummary(fileName, "Could not parse structured attachment summary.");
}

export function emptyAttachmentSummary(fileName: string, note: string): AttachmentSummary {
  return {
    fileName,
    documentType: "unknown",
    extractedTextSummary: note,
    roomsAndAreas: [],
    dimensions: [],
    detectedScopeOfWork: [],
    detectedMaterials: [],
    timeOrDurationHints: [],
    risksOrConstraints: [],
    missingQuestions: [],
    confidence: "low",
  };
}

export function deriveExtractedSignals(summary: AttachmentSummary): z.infer<typeof extractedSignalsSchema> {
  return {
    hasFloorPlan: summary.documentType === "floor_plan" || summary.roomsAndAreas.length > 0,
    hasRoomSchedule: summary.roomsAndAreas.length > 0,
    hasDimensions: summary.dimensions.length > 0,
    hasMaterialNotes:
      summary.detectedMaterials.some((m) => m.confidence !== "low") ||
      summary.detectedMaterials.length > 0,
    hasWorkScope: summary.detectedScopeOfWork.length > 0,
  };
}
