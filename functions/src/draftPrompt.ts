import type { ProjectDraftPayload } from "./draftSchema";
import { NUMBER_FORMAT_RULES } from "./attachmentSummarySchema";

export function languageLabel(lang: "sk" | "de" | "en"): string {
  if (lang === "de") return "German (formal Sie, Swiss spelling with ss not ß)";
  if (lang === "en") return "English";
  return "Slovak";
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

${NUMBER_FORMAT_RULES}

Additional plain-text extracts (secondary):
${docs}

Material rules:
- ALWAYS populate materialSuggestions[] with the materials this project needs, even when there are no attachments. Derive them from the user description, the job type, and the phases/tasks you created.
- Provide at least 6 material suggestions for a full construction project, fewer for a small job or single-trade work. Cover the main trades relevant to the scope (e.g. masonry, concrete, insulation, windows/doors, roofing, plumbing, electrical, HVAC, flooring, plaster/paint) — only those that fit this project.
- For each materialSuggestions[] item set: name, category, confidence ("low" when purely inferred, "medium"/"high" when clearly stated), source ("user_text" when named in the description, "attachment" when from a document, otherwise "inferred"), and sourceNote explaining why.
- Set quantity to null when it is not explicitly known. Never invent exact quantities; add unit only when meaningful.
- When projectFacts.rooms, projectFacts.totalKnownAreaM2, or attachment dimensions provide floor areas, derive materialSuggestions quantities for area-based materials (flooring, roofing footprint, facade plaster, interior plaster, insulation in m²). Set source to "attachment" and sourceNote citing the area used (e.g. "Súčet podlahových plôch 86 m²").
- Populate projectFacts.rooms and projectFacts.dimensions from attachment findings when available.

List each material once only. Do not repeat the same item across materials[] and offerPreparation.suggestedLineItems.
Avoid umbrella duplicates (e.g. do not list both "Elektrokabel" and "Elektromaterial").
Up to 60 material suggestions for technical documents (prefer row-level detail over generic categories).
Prefer not merging distinct LED strip / lighting rows across rooms.

Up to 12 phases and 12 tasks per phase when the scope is complex.
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
${NUMBER_FORMAT_RULES}
If refining materials from attachments, populate materialSuggestions[] with source and confidence.

Current draft:
${JSON.stringify(params.existingDraft, null, 2)}

User instruction:
${params.userMessage}`;
}
