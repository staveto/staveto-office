import { z } from "zod";

export const draftLanguageSchema = z.enum(["sk", "de", "en"]);

export const projectDraftSchema = z.object({
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
});

export type ProjectDraftPayload = z.infer<typeof projectDraftSchema>;

export function parseProjectDraftJson(raw: string): ProjectDraftPayload {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  return projectDraftSchema.parse(parsed);
}
