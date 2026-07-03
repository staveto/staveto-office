import { z } from "zod";
import {
  attachmentSummarySchema,
  draftMaterialSuggestionSchema,
  projectFactsSchema,
} from "./attachmentSummarySchema";

export const draftLanguageSchema = z.enum(["sk", "de", "en"]);

export const projectDraftSchema = z
  .object({
    projectTitle: z.string().min(1),
    projectType: z.string().min(1),
    status: z.enum(["lead", "draft"]),
    summary: z.string(),
    customer: z.object({
      mode: z.enum(["existing", "new", "none"]),
      contactId: z.string().nullable(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    location: z.string().nullable(),
    tasks: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        phase: z.string().nullable(),
        priority: z.enum(["low", "medium", "high"]),
        estimatedDuration: z.string().nullable(),
      })
    ),
    materials: z.array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable(),
        unit: z.string().nullable(),
        note: z.string().nullable(),
      })
    ),
    clarificationQuestions: z.array(z.string()),
    risks: z.array(z.string()),
    nextSteps: z.array(z.string()),
    offerPreparation: z.object({
      suggestedLineItems: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          category: z.enum(["work", "material", "travel", "other"]),
          quantity: z.number().nullable(),
          unit: z.string().nullable(),
        })
      ),
      missingPricingInputs: z.array(z.string()),
    }),
    source: z.object({
      creationMethod: z.literal("ai"),
      attachedFileIds: z.array(z.string()),
      generatedAt: z.union([z.string(), z.number()]).optional(),
    }),
    attachmentFindings: z.array(attachmentSummarySchema).optional(),
    projectFacts: projectFactsSchema.optional(),
    materialSuggestions: z.array(draftMaterialSuggestionSchema).optional(),
    missingQuestions: z.array(z.string()).optional(),
    draftWarnings: z.array(z.string()).optional(),
  })
  .passthrough();

export type ProjectDraftPayload = z.infer<typeof projectDraftSchema>;

function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function coerceNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = coerceString(value).trim();
  return text.length > 0 ? text : null;
}

function coercePriority(value: unknown): "low" | "medium" | "high" {
  if (value === "low" || value === "high") return value;
  return "medium";
}

function coerceLineCategory(value: unknown): "work" | "material" | "travel" | "other" {
  if (value === "material" || value === "travel" || value === "other") return value;
  return "work";
}

/** Gemini often echoes broken attachmentFindings and null quantities — normalize before Zod. */
export function prepareGeminiDraftForValidation(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const draft = { ...(value as Record<string, unknown>) };
  delete draft.attachmentFindings;

  if (Array.isArray(draft.materialSuggestions)) {
    draft.materialSuggestions = draft.materialSuggestions.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = { ...(item as Record<string, unknown>) };
      if (row.quantity === null) delete row.quantity;
      if (row.unit === null) delete row.unit;
      if (row.sourceNote === null) delete row.sourceNote;
      return row;
    });
  }

  return draft;
}

/** Coerce Gemini nulls and missing strings before strict project draft validation. */
export function normalizeProjectDraftPayload(value: unknown): unknown {
  const prepared = prepareGeminiDraftForValidation(value);
  if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) {
    return prepared;
  }

  const draft = { ...(prepared as Record<string, unknown>) };

  draft.projectTitle = coerceString(draft.projectTitle, "New project").trim() || "New project";
  draft.projectType = coerceString(draft.projectType, "customer_job");
  draft.summary = coerceString(draft.summary);
  draft.status = draft.status === "lead" ? "lead" : "draft";
  draft.location = coerceNullableString(draft.location);

  if (Array.isArray(draft.tasks)) {
    draft.tasks = draft.tasks.map((task) => {
      if (!task || typeof task !== "object") return task;
      const row = task as Record<string, unknown>;
      return {
        ...row,
        title: coerceString(row.title, "Task").trim() || "Task",
        description: coerceString(row.description),
        phase: coerceNullableString(row.phase),
        priority: coercePriority(row.priority),
        estimatedDuration: coerceNullableString(row.estimatedDuration),
      };
    });
  }

  if (Array.isArray(draft.materials)) {
    draft.materials = draft.materials.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      return {
        ...row,
        name: coerceString(row.name, "Material").trim() || "Material",
        quantity: typeof row.quantity === "number" ? row.quantity : null,
        unit: coerceNullableString(row.unit),
        note: coerceNullableString(row.note),
      };
    });
  }

  if (draft.offerPreparation && typeof draft.offerPreparation === "object") {
    const offer = { ...(draft.offerPreparation as Record<string, unknown>) };
    if (Array.isArray(offer.suggestedLineItems)) {
      offer.suggestedLineItems = offer.suggestedLineItems.map((item) => {
        if (!item || typeof item !== "object") return item;
        const row = item as Record<string, unknown>;
        return {
          ...row,
          title: coerceString(row.title, "Line item").trim() || "Line item",
          description: coerceString(row.description),
          category: coerceLineCategory(row.category),
          quantity: typeof row.quantity === "number" ? row.quantity : null,
          unit: coerceNullableString(row.unit),
        };
      });
    }
    if (!Array.isArray(offer.missingPricingInputs)) {
      offer.missingPricingInputs = [];
    }
    draft.offerPreparation = offer;
  }

  for (const key of ["clarificationQuestions", "risks", "nextSteps", "missingQuestions", "draftWarnings"] as const) {
    if (!Array.isArray(draft[key])) {
      draft[key] = [];
    }
  }

  return draft;
}

export function parseProjectDraftPayload(value: unknown): ProjectDraftPayload {
  return projectDraftSchema.parse(normalizeProjectDraftPayload(value));
}

export function parseProjectDraftJson(raw: string): ProjectDraftPayload {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  return parseProjectDraftPayload(parsed);
}
