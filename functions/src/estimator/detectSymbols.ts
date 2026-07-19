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
  // NOTE: optional fields are .nullish() — the Firebase callable client SDK
  // serializes `undefined` as null, so a strict .optional() would reject
  // requests from clients that include an unset key.
  /** Click position normalized 0..1 within the sent image (click mode). */
  click: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .nullish(),
  language: z.enum(["sk", "de", "en"]).default("sk"),
  /** Optional legend rows from the same drawing — highest-priority context. */
  legendEntries: z
    .array(z.object({ label: z.string().optional(), description: z.string() }))
    .max(80)
    .nullish(),
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

const SYMBOL_RULES = `What counts as ONE symbol (STN/electrical drawing convention):
- A drawing symbol is a compact GRAPHICAL ICON drawn with lines/curves — NOT
  letters, NOT words, NOT digits. Examples: circle with cross/strokes (light),
  semicircle with pins/hooks (socket), small shape with hooks/arrows (switch),
  zigzag/coil (LED strip cross-section), rectangle with hatch (distribution
  board).
- A symbol often consists of SEVERAL strokes and can mix colors (e.g. a colored
  cross + a dark circle). Always return the box around the COMPLETE icon,
  including its connection stub, but ONLY the icon itself — never a single
  line of it, and never any text next to it.
- A real symbol's box is roughly square/compact (width ≈ height). A box that
  is much wider than it is tall (or vice versa) is almost always a TEXT LABEL
  or a line, not a symbol — reject it, EXCEPT for genuinely drawn LED-strip
  lines, which are legitimately elongated.

STRICTLY NEVER box any of the following, even if they sit right next to,
overlap, or touch a real symbol icon:
- ANY readable text: single words, short phrases, room names, item
  descriptions (e.g. "Zásuvky v nábytku", "Visiace svietidlo", "LED pás"),
  full sentences, notes, or labels of any language.
- ANY number or digit on its own — dimension numbers, mounting-height texts
  (e.g. "v-560mm"), reference/index numbers used to link a symbol to a
  legend row (e.g. a small "04", "16", "37" printed near or inside a circle).
  A bare number is NEVER a symbol, no matter how it is styled or colored.
- An itemized schedule/legend embedded IN or NEXT TO the floor plan — a list
  of numbered rows grouped under room-name headers (e.g. "04 Visiace
  svietidlo", "05 LED pás v svietidle...") describing installed items. This
  is a TABLE, not a set of symbols — skip EVERY row of it entirely, even
  though it looks similar to a legend and is spread across multiple areas.
- walls, room outlines, furniture, doors/windows, appliance outlines
- dimension lines, dimension arrows, leader lines and their labels
- the legend table, title block or drawing frame
- hatching or fills

Self-check before returning each box: "Is this a drawn graphical icon made of
lines/curves, or is it text/digits I can read?" If you can read it as words or
numbers, DO NOT include it — no exceptions.`;

/**
 * STN reference catalog — Slovak installation drawings use STN 33 2130 +
 * STN EN 60617 symbol graphics. Naming per this catalog is what electricians
 * order material by ("radenie" of switches), so exact names matter.
 */
const STN_CATALOG = `STN symbol reference (Slovak drawings follow STN 33 2130 / STN EN 60617).
When the graphics match, use the EXACT type name — electricians buy material
by these designations:

Switches — the "radenie" number is read from the strokes/hooks on the circle:
- "Vypínač č.1 (jednopólový)": circle with ONE stroke ending in ONE hook.
- "Vypínač č.2 (dvojpólový)": circle with one stroke, TWO parallel hooks/ticks.
- "Prepínač č.5 (sériový)": circle with TWO strokes/hooks on the same side
  (controls two circuits from one place, a.k.a. lustrový).
- "Prepínač č.6 (striedavý)": circle with one stroke whose end has a hook AND
  a second tick across it (stairs — one circuit from two places).
- "Prepínač č.7 (krížový)": circle with strokes/hooks on BOTH sides (cross
  switch — one circuit from three or more places).
- "Tlačidlo": small filled dot / circle-in-circle, often with "T".
- Combined variants exist (e.g. č.6+6, č.5A dvojitý) — name what you see.

Sockets (semicircle on a stub):
- "Zásuvka 230V jednoduchá": ONE semicircle with one stroke.
- "Zásuvka 230V dvojitá": doubled semicircle or two strokes (2× under one
  cover; drawings often label it "2x pod sebou" / "vedľa seba").
- "Zásuvka 400V (trojfázová)": semicircle with three strokes or "3f/400V".
- IP44/wet-room variants may add a small roof/hatch over the semicircle.

Lights:
- "Svietidlo stropné": circle with an inscribed × cross.
- "Svietidlo nástenné": circle with × on a short wall stub / half circle.
- "Žiarivkové svietidlo": elongated rectangle with a center line.
- "LED pás": elongated drawn line/zigzag along a wall or ceiling detail.
- "Visiace svietidlo": circle-cross with a hanging mark.

Other:
- "Rozvádzač": hatched/filled rectangle.
- "Inštalačná krabica": small circle/dot on a wiring route.
- "Vývod (káblový)": short stub with an open end / arrow.

Rules for using this catalog:
- COUNT the hooks/strokes before naming a switch — never answer just
  "vypínač" when the radenie is readable from the icon.
- If the strokes are NOT clearly countable (small/blurry crop), return the
  generic type ("Vypínač — radenie nečitateľné") with confidence "low" —
  do NOT guess a specific radenie.
- A number printed NEXT TO a symbol is usually a legend index, NOT the
  radenie — read the radenie only from the icon's own strokes/hooks.`;

function legendBlock(
  entries?: Array<{ label?: string; description: string }> | null
): string {
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

${STN_CATALOG}
${legendBlock(req.legendEntries)}

Task: find the ONE complete drawing symbol that contains or is nearest to the
clicked point. Return a TIGHT bounding box around the WHOLE symbol (all strokes
that belong to it), excluding surrounding walls, dimension lines and text.

Name the symbol as PRECISELY as the graphics allow, using the STN reference
above (e.g. "Prepínač č.6 (striedavý)", "Zásuvka 230V dvojitá") — a generic
name like "vypínač" is only acceptable with confidence "low" when the
distinguishing strokes are unreadable.

Return JSON array with exactly one element (or [] when there is no symbol near
the point, only walls/text/dimensions):
[{"box_2d": [ymin, xmin, ymax, xmax], "name": "precise STN type name in ${langName}", "category": one of ${JSON.stringify(
      CATEGORIES
    )}, "confidence": "high"|"medium"|"low"}]
Coordinates are 0-1000 relative to the image. JSON only.`;
  } else {
    prompt = `You see an electrical/construction floor plan (or a part of one).

${SYMBOL_RULES}

${STN_CATALOG}
${legendBlock(req.legendEntries)}

Task: detect EVERY installation symbol on the plan (sockets, switches, lights,
LED outlets, junction/installation boxes, distribution boards, ...). One entry
per symbol occurrence — a drawn graphical icon only. Do NOT include anything
from a legend table, item schedule, title block or drawing frame, and do NOT
include any text, word, or number by itself (see rules above). When in doubt
whether something is a symbol icon or text/a number, SKIP it — a missed
symbol is far better than a false one. Maximum ${req.maxSymbols} entries,
most confident first.

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
