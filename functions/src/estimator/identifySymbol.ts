/**
 * identifyDrawingSymbol — AI identification of a single marked symbol.
 *
 * The client sends a small PNG crop of the drawing around a user-placed mark.
 * Gemini names the symbol (SK first), maps it to an estimator category and
 * says how confident it is. The project legend context, when provided, always
 * wins over the visual guess.
 */

import { z } from "zod";
import { generateJsonText } from "./estimatorGemini";
import { parseLooseJsonObject } from "./estimatorSchema";

const requestSchema = z.object({
  /** Base64 PNG/JPEG crop (no data: prefix), max ~1.5 MB. */
  imageBase64: z.string().min(100).max(2_000_000),
  mimeType: z.enum(["image/png", "image/jpeg"]).default("image/png"),
  language: z.enum(["sk", "de", "en"]).default("sk"),
  /** Optional legend rows from the same drawing — highest-priority context. */
  legendEntries: z
    .array(z.object({ label: z.string().optional(), description: z.string() }))
    .max(80)
    .optional(),
  /** What the user currently calls this position (may be wrong). */
  currentLabel: z.string().max(300).optional(),
});

const CATEGORIES = [
  "socket",
  "switch",
  "lighting",
  "led_strip",
  "cable",
  "distribution_board",
  "installation_material",
  "other",
  "unknown",
] as const;

export type IdentifySymbolResult = {
  name: string;
  category: (typeof CATEGORIES)[number];
  confidence: "high" | "medium" | "low";
  reason?: string;
};

export async function handleIdentifyDrawingSymbol(
  uid: string | undefined,
  data: unknown
): Promise<IdentifySymbolResult> {
  if (!uid) throw new Error("Sign in required.");
  const req = requestSchema.parse(data);

  const legendBlock = req.legendEntries?.length
    ? `\nProject legend (this ALWAYS wins over your visual guess):\n${req.legendEntries
        .map((e) => `- ${e.label ? `${e.label}: ` : ""}${e.description}`)
        .join("\n")}`
    : "";

  const langName = req.language === "sk" ? "Slovak" : req.language === "de" ? "German" : "English";

  const prompt = `You see a small crop from an electrical/construction floor plan.
A user marked one symbol in the middle of this crop and wants to know what it is.
${legendBlock}
${req.currentLabel ? `\nThe user currently calls it: "${req.currentLabel}" (verify, may be wrong).` : ""}

Answer in ${langName}. Return JSON only:
{
  "name": "short human name of the symbol in ${langName} (e.g. 'Zásuvka 230V dvojitá')",
  "category": one of ${JSON.stringify(CATEGORIES)},
  "confidence": "high" | "medium" | "low",
  "reason": "one short sentence why (${langName})"
}
If you cannot tell, use category "unknown" and confidence "low". Never invent details.`;

  const text = await generateJsonText({
    prompt,
    attachments: [
      {
        mimeType: req.mimeType,
        fileName: "mark-crop.png",
        bytes: Buffer.from(req.imageBase64, "base64"),
      },
    ],
    maxOutputTokens: 1024,
    temperature: 0.1,
    envModel: "GEMINI_VISION_MODEL",
  });

  const raw = parseLooseJsonObject(
    text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
  );
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "";
  const category = CATEGORIES.includes(raw.category as never)
    ? (raw.category as IdentifySymbolResult["category"])
    : "unknown";
  const confidence =
    raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : "low";
  if (!name) {
    return { name: "Neznáma značka", category: "unknown", confidence: "low" };
  }
  return {
    name,
    category,
    confidence,
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 300) : undefined,
  };
}
