/**
 * Plan trade + country profile — detected from file name, legend and position
 * texts already extracted from the document. Pure heuristics, no AI tokens.
 *
 * Constrains which symbol categories the picker/classifier offers, so an
 * electrical plan never suggests plumbing symbols (and vice versa) and the
 * norm context (STN/ČSN/DIN…) is explicit for the user.
 */

export type PlanTrade = "electrical" | "plumbing" | "hvac" | "general" | "unknown";

export type PlanLanguage = "sk" | "cs" | "de" | "en";

export type PlanTradeProfile = {
  trade: PlanTrade;
  countryCode: string;
  language: PlanLanguage;
  /** Norm family shown to the user, e.g. "STN (SK)". Metadata only — no glyphs. */
  standardHint: string;
  /** Estimator categories allowed for this trade; null = unrestricted. */
  allowedCategories: string[] | null;
  confidence: "high" | "medium" | "low";
  /** Unknown trade → user must classify marks manually. */
  needsUserConfirm: boolean;
  matchedKeywords: string[];
};

const ELECTRICAL_CATEGORIES = [
  "socket",
  "double_socket",
  "switch",
  "lighting",
  "led_strip",
  "cable",
  "distribution_board",
  "other",
];

const TRADE_KEYWORDS: Record<Exclude<PlanTrade, "unknown" | "general">, RegExp[]> = {
  electrical: [
    /elektr/i,
    /zn[aá]čenie\s+elektr/i,
    /z[aá]suvk/i,
    /vyp[ií]na[čc]/i,
    /svietidl|sv[ií]tidl/i,
    /led\s*p[aá]s|led\s*strip/i,
    /rozv[aá]dza[čc]|rozvad[eě]c/i,
    /steckdose|schalter|leuchte|elektro/i,
    /\bsocket\b|\bswitch\b|lighting/i,
  ],
  plumbing: [
    /vodovod|kanaliz[aá]c|zdravotechnik|\bzti\b|sanita/i,
    /abwasser|sanit[aä]r|wasserleitung/i,
    /plumbing|sewage|drainage/i,
  ],
  hvac: [
    /k[uú]renie|vykurovan|radi[aá]tor(?!\s*(zn|:))|podlahov[eé]\s*k[uú]ren/i,
    /vzduchotechnik|\bvzt\b|rekuper[aá]c|klimatiz[aá]c/i,
    /heizung|l[uü]ftung|klimaanlage/i,
    /\bhvac\b|heating|ventilation/i,
  ],
};

const LANGUAGE_KEYWORDS: Record<PlanLanguage, RegExp[]> = {
  sk: [/zn[aá]čenie|p[oô]dorys|z[aá]suvka|vyp[ií]nač|svietidlo|m[ie]stnos[tť]|k[uú]renie/i],
  cs: [/v[yý]kres|p[uů]dorys|sv[ií]tidlo|vyp[ií]nač[e]?\b|m[ií]stnost|topen[ií]/i],
  de: [/grundriss|steckdose|schalter|leuchte|zeichnung|heizung/i],
  en: [/floor\s*plan|\bsocket\b|\bswitch\b|drawing|legend/i],
};

const LANGUAGE_TO_COUNTRY: Record<PlanLanguage, string> = {
  sk: "SK",
  cs: "CZ",
  de: "DE",
  en: "SK",
};

const COUNTRY_STANDARD: Record<string, string> = {
  SK: "STN (SK)",
  CZ: "ČSN (CZ)",
  DE: "DIN (DE)",
  AT: "ÖNORM (AT)",
  CH: "SN (CH)",
};

export function allowedCategoriesForTrade(trade: PlanTrade): string[] | null {
  if (trade === "electrical") return ELECTRICAL_CATEGORIES;
  // Other trades have no symbol categories in the estimator yet — unrestricted,
  // user confirms manually.
  return null;
}

export function standardHintForCountry(countryCode: string): string {
  return COUNTRY_STANDARD[countryCode.toUpperCase()] ?? countryCode.toUpperCase();
}

export type DetectPlanTradeInput = {
  fileName?: string | null;
  /** Any texts already extracted: legend titles/descriptions, position labels. */
  texts?: Array<string | null | undefined>;
  /** Workspace country wins over language-detected country. */
  workspaceCountryCode?: string | null;
};

export function detectPlanTradeProfile(input: DetectPlanTradeInput): PlanTradeProfile {
  const corpus = [input.fileName ?? "", ...(input.texts ?? [])]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join("\n");

  const matched: string[] = [];
  const scores: Record<string, number> = { electrical: 0, plumbing: 0, hvac: 0 };
  for (const [trade, patterns] of Object.entries(TRADE_KEYWORDS)) {
    for (const re of patterns) {
      const m = corpus.match(re);
      if (m) {
        scores[trade] = (scores[trade] ?? 0) + 1;
        matched.push(m[0].toLowerCase());
      }
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topTrade, topScore] = ranked[0]!;
  const secondScore = ranked[1]?.[1] ?? 0;

  let trade: PlanTrade = "unknown";
  let confidence: PlanTradeProfile["confidence"] = "low";
  if (topScore >= 3 && topScore - secondScore >= 2) {
    trade = topTrade as PlanTrade;
    confidence = "high";
  } else if (topScore >= 1 && topScore > secondScore) {
    trade = topTrade as PlanTrade;
    confidence = "medium";
  }

  let language: PlanLanguage = "sk";
  let bestLangScore = 0;
  for (const [lang, patterns] of Object.entries(LANGUAGE_KEYWORDS)) {
    const score = patterns.reduce((s, re) => s + (re.test(corpus) ? 1 : 0), 0);
    if (score > bestLangScore) {
      bestLangScore = score;
      language = lang as PlanLanguage;
    }
  }

  const countryCode =
    input.workspaceCountryCode?.trim().toUpperCase() ||
    LANGUAGE_TO_COUNTRY[language];

  return {
    trade,
    countryCode,
    language,
    standardHint: standardHintForCountry(countryCode),
    allowedCategories: allowedCategoriesForTrade(trade),
    confidence,
    needsUserConfirm: trade === "unknown" || confidence === "low",
    matchedKeywords: [...new Set(matched)].slice(0, 8),
  };
}

/** Filter suggested categories to the detected trade (keeps order). */
export function filterCategoriesByProfile(
  categories: string[],
  profile: PlanTradeProfile | null | undefined
): string[] {
  if (!profile?.allowedCategories) return categories;
  const allowed = new Set(profile.allowedCategories);
  const filtered = categories.filter((c) => allowed.has(c));
  return filtered.length > 0 ? filtered : categories;
}
