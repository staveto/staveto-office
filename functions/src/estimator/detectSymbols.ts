/**
 * detectPlanSymbols — AI vision detection of drawing symbols with bounding boxes.
 *
 * Two modes:
 *  - "click": the client sends a crop around a user click; Gemini returns the ONE
 *    complete symbol at/nearest the marked point with a tight box around ALL of
 *    its strokes (never wall/dimension linework, never text labels).
 *  - "all": the client sends a page image (or tile); Gemini returns every
 *    installation symbol it can see so the client can highlight them as proposals.
 *
 * Boxes come back as box_2d [ymin, xmin, ymax, xmax] in 0–1000 (Gemini's native
 * detection format) and are converted to normalized {x, y, width, height} here.
 */

import { z } from "zod";
import { generateJsonText } from "./estimatorGemini";

const requestSchema = z.object({
  /** Base64 PNG/JPEG (no data: prefix). Crop for click mode, page/tile for all mode. */
  imageBase64: z.string().min(100).max(4_000_000),
  mimeType: z.enum(["image/png", "image/jpeg"]).default("image/png"),
  mode: z.enum(["click", "all"]).default("click"),
  /** Click position normalized 0..1 within the sent image (click mode). */
  click: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  language: z.enum(["sk", "de", "en"]).default("sk"),
  /** Optional legend rows from the same drawing — highest-priority context. */
  legendEntries: z
    .array(z.object({ label: z.string().optional(), description: z.string() }))
    .max(80)
    .optional(),
  maxSymbols: z.number().int().min(1).max(200).default(120),
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

export type DetectedPlanSymbol = {
  /** Normalized 0..1 bbox relative to the sent image. */
  bbox: { x: number; y: number; width: number; height: number };
  name: string;
  category: (typeof CATEGORIES)[number];
  confidence: "high" | "medium" | "low";
};

export type DetectPlanSymbolsResult = {
  symbols: DetectedPlanSymbol[];
};

const SYMBOL_RULES = `What counts as ONE symbol:
- A drawing symbol is a compact graphic mark: circle with cross/strokes (light),
  semicircle with pins (socket), small shape with hooks/arrows (switch), rectangle
  with hatch (distribution board), etc.
- A symbol often consists of SEVERAL strokes and can mix colors (e.g. a colored
  cross + a dark circle). Always return the box around the COMPLETE symbol,
  including its connection stub, never a single line of it.
NOT symbols (never box these):
- walls, room outlines, furniture, doors/windows
- dimension lines, dimension arrows and dimension numbers
- room names, area labels, mounting-height texts (e.g. "v-560mm"), any plain text
- the legend table, title block or drawing frame
- hatching or fills`;

function legendBlock(entries?: Array<{ label?: string; description: string }>): string {
  if (!entries?.length) return "";
  return `\nProject legend (helps you name symbols):\n${entries
    .map((e) => `- ${e.label ? `${e.label}: ` : ""}${e.description}`)
    .join("\n")}`;
}

type RawDetection = {
  box_2d?: unknown;
  name?: unknown;
  category?: unknown;
  confidence?: unknown;
};

function toDetection(raw: RawDetection): DetectedPlanSymbol | null {
  const box = raw.box_2d;
  if (!Array.isArray(box) || box.length !== 4) return null;
  const nums = box.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [ymin, xmin, ymax, xmax] = nums as [number, number, number, number];
  const x = Math.max(0, Math.min(1, xmin / 1000));
  const y = Math.max(0, Math.min(1, ymin / 1000));
  const x2 = Math.max(0, Math.min(1, xmax / 1000));
  const y2 = Math.max(0, Math.min(1, ymax / 1000));
  const width = x2 - x;
  const height = y2 - y;
  if (width <= 0 || height <= 0) return null;
  const category = CATEGORIES.includes(raw.category as never)
    ? (raw.category as DetectedPlanSymbol["category"])
    : "unknown";
  const confidence =
    raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : "low";
  return {
    bbox: { x, y, width, height },
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : "",
    category,
    confidence,
  };
}

function parseDetections(text: string): DetectedPlanSymbol[] {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Model sometimes truncates the trailing bracket on long lists — recover rows.
    const lastComplete = cleaned.lastIndexOf("}");
    if (lastComplete < 0) return [];
    try {
      parsed = JSON.parse(`${cleaned.slice(0, lastComplete + 1)}]`.replace(/^\[?/, "["));
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { symbols?: unknown[] })?.symbols)
      ? (parsed as { symbols: unknown[] }).symbols
      : [];
  const out: DetectedPlanSymbol[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const det = toDetection(item as RawDetection);
    if (det) out.push(det);
  }
  return out;
}

export async function handleDetectPlanSymbols(
  uid: string | undefined,
  data: unknown
): Promise<DetectPlanSymbolsResult> {
  if (!uid) throw new Error("Sign in required.");
  const req = requestSchema.parse(data);
  const langName = req.language === "sk" ? "Slovak" : req.language === "de" ? "German" : "English";

  let prompt: string;
  if (req.mode === "click") {
    const cx = Math.round((req.click?.x ?? 0.5) * 1000);
    const cy = Math.round((req.click?.y ?? 0.5) * 1000);
    prompt = `You see a crop from an electrical/construction floor plan.
The user clicked at point (x=${cx}, y=${cy}) in a 0-1000 coordinate system
(x grows right, y grows down).

${SYMBOL_RULES}
${legendBlock(req.legendEntries)}

Task: find the ONE complete drawing symbol that contains or is nearest to the
clicked point. Return a TIGHT bounding box around the WHOLE symbol (all strokes
that belong to it), excluding surrounding walls, dimension lines and text.

Return JSON array with exactly one element (or [] when there is no symbol near
the point, only walls/text/dimensions):
[{"box_2d": [ymin, xmin, ymax, xmax], "name": "short name in ${langName}", "category": one of ${JSON.stringify(
      CATEGORIES
    )}, "confidence": "high"|"medium"|"low"}]
Coordinates are 0-1000 relative to the image. JSON only.`;
  } else {
    prompt = `You see an electrical/construction floor plan (or a part of one).

${SYMBOL_RULES}
${legendBlock(req.legendEntries)}

Task: detect EVERY installation symbol on the plan (sockets, switches, lights,
LED outlets, junction/installation boxes, distribution boards, ...). One entry
per symbol occurrence. Do NOT include symbols drawn inside the legend table or
title block. Maximum ${req.maxSymbols} entries, most confident first.

Return JSON array:
[{"box_2d": [ymin, xmin, ymax, xmax], "name": "short name in ${langName}", "category": one of ${JSON.stringify(
      CATEGORIES
    )}, "confidence": "high"|"medium"|"low"}, ...]
Coordinates are 0-1000 relative to the image. Boxes must be TIGHT around each
symbol. JSON only.`;
  }

  const text = await generateJsonText({
    prompt,
    attachments: [
      {
        mimeType: req.mimeType,
        fileName: "plan.png",
        bytes: Buffer.from(req.imageBase64, "base64"),
      },
    ],
    maxOutputTokens: req.mode === "click" ? 1024 : 8192,
    temperature: 0,
    envModel: "GEMINI_VISION_MODEL",
  });

  const symbols = parseDetections(text).slice(0, req.maxSymbols);
  return { symbols };
}
