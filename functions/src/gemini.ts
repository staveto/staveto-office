import { GoogleGenerativeAI } from "@google/generative-ai";
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

function languageLabel(lang: "sk" | "de" | "en"): string {
  if (lang === "de") return "German (formal Sie, Swiss spelling with ss not ß)";
  if (lang === "en") return "English";
  return "Slovak";
}

export async function generateDraftWithGemini(
  userPrompt: string,
  options?: { retryInvalidJson?: boolean }
): Promise<ProjectDraftPayload> {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.35,
    },
  });

  const run = async (prompt: string) => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  };

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
  imageNotes?: string[];
}): string {
  const docs =
    params.documentTexts?.length ?
      params.documentTexts
        .map((d) => `--- ${d.fileName} ---\n${d.text.slice(0, 12000)}`)
        .join("\n\n")
    : "None";

  const images =
    params.imageNotes?.length ?
      params.imageNotes.join("\n")
    : "None (image analysis may be limited)";

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
  "source": { "creationMethod": "ai", "attachedFileIds": string[], "generatedAt": string }
}

Language for all human-readable strings: ${languageLabel(params.language)}.
Job type (work type enum): ${params.jobType}
Contact mode: ${params.contactMode}
Contact info: ${params.contactSummary ?? "None"}
Location: ${params.location ?? "Not specified"}
User description:
${params.description}

Extracted document text:
${docs}

Image attachments:
${images}

Set source.creationMethod to "ai" and source.attachedFileIds to the IDs provided in context if any.
Set status to "draft".`;
}

export function buildUpdatePrompt(params: {
  language: "sk" | "de" | "en";
  existingDraft: ProjectDraftPayload;
  userMessage: string;
  attachedFileIds: string[];
}): string {
  return `Update the existing project draft JSON according to the user instruction.
Return the FULL updated JSON object only (same schema). Do not remove unrelated sections unless asked.
Language: ${languageLabel(params.language)}
Attached file IDs (unchanged unless user asks): ${JSON.stringify(params.attachedFileIds)}

Current draft:
${JSON.stringify(params.existingDraft, null, 2)}

User instruction:
${params.userMessage}`;
}
