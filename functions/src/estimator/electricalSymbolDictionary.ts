/**
 * Prior mapping for SK/CZ electrical marking-plan legend text → normalizedType.
 *
 * Authoritative source on each drawing is always the project legend.
 * This dictionary is a prior aligned with common architectural installation-plan
 * wording (IEC 60617 / former STN EN 60617 style marking plans), not a licensed
 * glyph database. Prefer legend text; use this when the model leaves type unknown
 * or mis-tags lighting-only.
 */

export type ElectricalSymbolNormalizedType =
  | "pendant_light"
  | "ceiling_light"
  | "wall_light"
  | "led_strip"
  | "lighting_profile"
  | "mirror_light_output"
  | "furniture_light"
  | "socket"
  | "switch"
  | "distribution_board"
  | "cable_route"
  | "unknown";

type DictRule = {
  type: ElectricalSymbolNormalizedType;
  /** Matched against symbolDescription + symbolLabel (case-insensitive). */
  patterns: RegExp[];
};

const RULES: DictRule[] = [
  {
    type: "socket",
    patterns: [
      /\bzásuvk/i,
      /\bzasuvk/i,
      /\bsocket/i,
      /\bschuko\b/i,
      /\bel\.?\s*2?\s*zásuv/i,
      /\b2\s*zásuv/i,
      /\bdvojzásuv/i,
      /\bdvojzasuv/i,
      /\bdatová\s*zásuv/i,
      /\bdata\s*zásuv/i,
    ],
  },
  {
    type: "switch",
    patterns: [
      /\bvypínač/i,
      /\bvypinac/i,
      /\bprepínač/i,
      /\bprepinac/i,
      /\bswitch\b/i,
      /\bdimmer\b/i,
      /\bstmievač/i,
      /\bstmievac/i,
      /\btlačidl/i,
      /\btlacidl/i,
    ],
  },
  {
    type: "distribution_board",
    patterns: [
      /\brozvádzač/i,
      /\brozvadzac/i,
      /\brozvodnic/i,
      /\bdistribution\s*board/i,
      /\bRH\b/,
      /\bRE\b/,
    ],
  },
  {
    type: "cable_route",
    patterns: [
      /\bcable\b/i,
      /\bkábel/i,
      /\bkabel/i,
      /\bcyky\b/i,
      /\bnym\b/i,
      /\btras[ay]\b/i,
      /\bvodič/i,
      /\bvodic/i,
    ],
  },
  {
    type: "led_strip",
    patterns: [/\bled\s*pás/i, /\bled\s*pas/i, /\bled\s*strip/i],
  },
  {
    type: "lighting_profile",
    patterns: [/\blišt/i, /\blist\b/i, /\bprofil/i, /\btrack\s*light/i],
  },
  {
    type: "mirror_light_output",
    patterns: [/\bzrkadl/i, /\bmirror/i],
  },
  {
    type: "furniture_light",
    patterns: [/\bnábyt/i, /\bnabyt/i, /\bfurniture/i, /\bpodsvieten/i],
  },
  {
    type: "pendant_light",
    patterns: [/\bvisiace\b/i, /\bpendant\b/i, /\bzávesn/i, /\bzavesn/i],
  },
  {
    type: "wall_light",
    patterns: [/\bnástenn/i, /\bnastenn/i, /\bwall\s*light/i, /\bappliqu/i],
  },
  {
    type: "ceiling_light",
    patterns: [/\bstropn/i, /\bceiling/i, /\bsvietidl/i, /\blight\s*point/i, /\bvývod\b/i],
  },
];

export function inferNormalizedTypeFromLegendText(
  symbolDescription?: string | null,
  symbolLabel?: string | null
): ElectricalSymbolNormalizedType | null {
  const hay = `${symbolDescription ?? ""} ${symbolLabel ?? ""}`.trim();
  if (!hay) return null;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(hay))) return rule.type;
  }
  return null;
}

/** Prefer model type when not unknown; otherwise dictionary prior. */
export function resolveLegendNormalizedType(
  modelType: string | undefined,
  symbolDescription?: string | null,
  symbolLabel?: string | null
): ElectricalSymbolNormalizedType {
  if (modelType && modelType !== "unknown") {
    return modelType as ElectricalSymbolNormalizedType;
  }
  return inferNormalizedTypeFromLegendText(symbolDescription, symbolLabel) ?? "unknown";
}

/** Official / industry references for prompt grounding (not a licensed glyph dump). */
export const ELECTRICAL_SYMBOL_STANDARD_NOTES = `
Symbol-key grounding (architectural installation plans):
- Prefer the drawing's own legend / legenda / vysvetlivky as the single source of truth for this project.
- Typical EU/SK marking plans follow IEC 60617 / former STN EN 60617 architectural installation symbols (zásuvky, vypínače, svietidlá, rozvádzače). Exact glyphs vary by office — always map via THIS drawing's legend.
- Related practice: STN 33 2000 (LV installations), STN 33 0010 (marking/abbreviations). Do not invent cable lengths from point symbols alone.
`.trim();
