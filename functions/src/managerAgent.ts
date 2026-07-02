import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Firestore } from "firebase-admin/firestore";
import { assertWorkspaceAccess, functionsPermissionError } from "./permissions";

const screenContextSchema = z.object({
  screenType: z.string(),
  route: z.string(),
  activeWorkspaceId: z.string().min(1),
  activeWorkspaceType: z.enum(["personal", "company"]).nullable(),
  activeWorkspaceName: z.string().nullable(),
  userRole: z.string().nullable(),
  userId: z.string().min(1),
  userPreferredLanguage: z.string().nullable(),
  companyCountryCode: z.string().nullable(),
  companyCurrency: z.string().nullable(),
  companyLocale: z.string().nullable(),
  companyDefaultLanguage: z.string().nullable(),
  visibleEntityType: z.string().nullable(),
  visibleEntityId: z.string().nullable(),
  visibleEntitySummary: z.string().nullable(),
  warnings: z.array(z.string()),
  missingFields: z.array(z.string()),
  unsavedChanges: z.boolean(),
  selectedAction: z.string().nullable(),
  timestamp: z.string(),
});

const askInputSchema = z.object({
  userId: z.string().min(1),
  mode: z.enum(["analyze_screen", "next_best_action", "explain_risk"]),
  question: z.string().optional(),
  responseLanguage: z.enum(["en", "sk", "de"]).default("en"),
  screenContext: screenContextSchema,
});

const insightSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "critical", "opportunity"]),
  title: z.string(),
  message: z.string(),
  reason: z.string(),
  source: z.literal("gemini"),
  confidence: z.enum(["high", "medium", "low"]),
  requiresConfirmation: z.boolean(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  suggestedAction: z
    .object({
      type: z.enum([
        "navigate",
        "highlight_field",
        "copy_text",
        "open_ai_assistant",
        "open_ai_brief",
      ]),
      label: z.string(),
      description: z.string(),
      targetRoute: z.string().optional(),
      proposedPatch: z.record(z.string()).optional(),
      confirmationText: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]),
    })
    .optional(),
});

const responseSchema = z.object({
  summary: z.string(),
  insights: z.array(insightSchema),
});

const MANAGER_AGENT_SYSTEM = `You are Staveto Manager Agent.
You help construction company owners and managers understand what needs attention on the current Staveto screen.
Use only the provided Staveto screen context.
Do not invent facts.
Do not claim legal or tax certainty.
If information is missing, say what is missing.
Suggest practical next steps.
Never execute actions.
Return valid JSON only.`;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured on the server.");
  return key;
}

function resolveDraftModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
}

async function assertScreenContextAccess(
  db: Firestore,
  authUid: string,
  screenContext: z.infer<typeof screenContextSchema>
): Promise<void> {
  if (screenContext.userId !== authUid) {
    throw new functionsPermissionError("User ID mismatch.");
  }

  const companyId =
    screenContext.activeWorkspaceType === "company" ? screenContext.activeWorkspaceId : undefined;

  const access = await assertWorkspaceAccess(
    db,
    authUid,
    screenContext.activeWorkspaceId,
    companyId
  );

  if (access.storageKey !== screenContext.activeWorkspaceId) {
    throw new functionsPermissionError("Workspace context mismatch.");
  }
}

function languageLabel(code: z.infer<typeof askInputSchema>["responseLanguage"]): string {
  switch (code) {
    case "sk":
      return "Slovak";
    case "de":
      return "German";
    default:
      return "English";
  }
}

function buildPrompt(input: z.infer<typeof askInputSchema>): string {
  const responseLanguage = languageLabel(input.responseLanguage);
  return `Return JSON:
{
  "summary": string,
  "insights": [{
    "id": string,
    "severity": "info"|"warning"|"critical"|"opportunity",
    "title": string,
    "message": string,
    "reason": string,
    "source": "gemini",
    "confidence": "high"|"medium"|"low",
    "requiresConfirmation": boolean,
    "relatedEntityType": string optional,
    "relatedEntityId": string optional,
    "suggestedAction": {
      "type": "navigate"|"highlight_field"|"copy_text"|"open_ai_assistant"|"open_ai_brief",
      "label": string,
      "description": string,
      "targetRoute": string optional,
      "proposedPatch": object optional,
      "confirmationText": string optional,
      "riskLevel": "low"|"medium"|"high"
    } optional
  }]
}

Mode: ${input.mode}
Question: ${input.question ?? "Analyze the current screen and suggest manager next steps."}

Screen context JSON:
${JSON.stringify(input.screenContext)}

Rules:
- Respond in ${responseLanguage} (${input.responseLanguage}).
- All summary, title, message, reason and suggestedAction labels must be in ${responseLanguage}.
- Advice must stay within activeWorkspaceId only.
- Do not reference data outside the provided context.
- Suggested actions are previews only; set requiresConfirmation=true when action is suggested.
- Prefer 1-4 concise insights.`;
}

export async function handleAskManagerAgent(
  authUid: string | undefined,
  data: unknown
): Promise<{ summary: string; insights: z.infer<typeof responseSchema>["insights"] }> {
  if (!authUid) throw new functionsPermissionError("Authentication required.");

  const input = askInputSchema.parse(data);
  const admin = await import("firebase-admin");
  const db = admin.firestore();

  await assertScreenContextAccess(db, authUid, input.screenContext);

  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({
    model: resolveDraftModel(),
    systemInstruction: MANAGER_AGENT_SYSTEM,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  });

  const result = await model.generateContent(buildPrompt(input));
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AI returned invalid JSON.");
  }

  return responseSchema.parse(parsed);
}
