import { z } from "zod";

export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const documentTypeSchema = z.enum([
  "floor_plan",
  "technical_specification",
  "quote",
  "invoice",
  "photo",
  "unknown",
]);

export const attachmentSummarySchema = z.object({
  fileName: z.string(),
  documentType: documentTypeSchema,
  extractedTextSummary: z.string(),
  roomsAndAreas: z.array(
    z.object({
      roomName: z.string(),
      areaM2: z.number().optional(),
      floor: z.string().optional(),
      sourceNote: z.string(),
    })
  ),
  dimensions: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      sourceNote: z.string(),
    })
  ),
  detectedScopeOfWork: z.array(z.string()),
  detectedMaterials: z.array(
    z.object({
      name: z.string(),
      category: z.string().optional(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      confidence: confidenceSchema,
      sourceNote: z.string(),
    })
  ),
  timeOrDurationHints: z.array(
    z.object({
      description: z.string(),
      value: z.string().optional(),
      sourceNote: z.string(),
    })
  ),
  risksOrConstraints: z.array(z.string()),
  missingQuestions: z.array(z.string()),
  confidence: confidenceSchema,
});

export type AttachmentSummary = z.infer<typeof attachmentSummarySchema>;

export const materialSourceSchema = z.enum(["attachment", "user_text", "inferred"]);

export const draftMaterialSuggestionSchema = z.object({
  name: z.string(),
  category: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  confidence: confidenceSchema,
  source: materialSourceSchema,
  sourceNote: z.string().optional(),
});

export const projectFactsSchema = z.object({
  buildingType: z.string().optional(),
  totalKnownAreaM2: z.number().optional(),
  rooms: z
    .array(
      z.object({
        name: z.string(),
        areaM2: z.number().optional(),
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

export function parseAttachmentSummaryJson(raw: string, fileName: string): AttachmentSummary {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  const result = attachmentSummarySchema.safeParse(parsed);
  if (result.success) return result.data;
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
