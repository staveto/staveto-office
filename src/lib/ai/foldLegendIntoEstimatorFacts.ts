import type {
  AiEstimatorFacts,
  AiExtractedItem,
  AiItemCategory,
  AiLegendEntry,
  AiSymbolType,
} from "@/types/aiEstimator";

const SYMBOL_TO_CATEGORY: Record<AiSymbolType, AiItemCategory> = {
  pendant_light: "lighting",
  ceiling_light: "lighting",
  wall_light: "lighting",
  mirror_light_output: "lighting",
  furniture_light: "lighting",
  led_strip: "led_strip",
  lighting_profile: "led_strip",
  socket: "socket",
  switch: "switch",
  distribution_board: "distribution_board",
  cable_route: "cable",
  unknown: "other",
};

/** Client prior — keep in sync with functions electricalSymbolDictionary.ts */
function resolveLegendType(
  modelType: AiSymbolType,
  description?: string,
  label?: string
): AiSymbolType {
  if (modelType && modelType !== "unknown") return modelType;
  const hay = `${description ?? ""} ${label ?? ""}`;
  if (/\bzásuvk|\bzasuvk|\bsocket|\bschuko|\bdvojzásuv|\bel\.?\s*2?\s*zásuv/i.test(hay)) {
    return "socket";
  }
  if (/\bvypínač|\bvypinac|\bprepínač|\bswitch\b|\bstmieva/i.test(hay)) return "switch";
  if (/\brozvádzač|\brozvadzac|\bdistribution/i.test(hay)) return "distribution_board";
  if (/\bkábel|\bkabel|\bcyky|\bnym|\bcable/i.test(hay)) return "cable_route";
  if (/\bled\s*pás|\bled\s*pas|\bled\s*strip/i.test(hay)) return "led_strip";
  if (/\bnábyt|\bpodsvieten/i.test(hay)) return "furniture_light";
  if (/\bvisiace|\bpendant/i.test(hay)) return "pendant_light";
  if (/\bnástenn|\bwall\s*light/i.test(hay)) return "wall_light";
  if (/\bstropn|\bsvietidl|\bceiling/i.test(hay)) return "ceiling_light";
  return "unknown";
}

function itemKey(
  room: string | undefined,
  title: string,
  qty: unknown,
  unit: unknown
): string {
  return [
    (room ?? "").trim().toLowerCase(),
    title.trim().toLowerCase(),
    qty == null ? "" : String(qty),
    (unit == null ? "" : String(unit)).toLowerCase(),
  ].join("|");
}

function legendEntryToItem(l: AiLegendEntry): AiExtractedItem {
  const normalizedType = resolveLegendType(l.normalizedType, l.symbolDescription, l.symbolLabel);
  const title =
    (l.symbolDescription || "").trim() ||
    (l.symbolLabel || "").trim() ||
    "Značka z legendy";
  const labelNote = l.symbolLabel?.trim()
    ? `Označenie v legende: ${l.symbolLabel.trim()}.`
    : "";
  return {
    id: `legend_item_${l.id}`,
    category: SYMBOL_TO_CATEGORY[normalizedType] ?? "other",
    title,
    description: [
      "Z legendy výkresu — počet výskytov vo výkrese ešte nie je spočítaný.",
      labelNote,
    ]
      .filter(Boolean)
      .join(" "),
    unit: l.unit ?? "ks",
    origin: "from_document",
    evidence: l.evidence ?? [],
    confidence: l.confidence === "high" ? "medium" : l.confidence,
    needsReview: true,
    reviewReason:
      "Položka z legendy bez spočítaných výskytov. Doplňte počet kusov / metrov pred pevnou cenou.",
  };
}

function coveredTypesFromFacts(facts: AiEstimatorFacts): Set<string> {
  const covered = new Set<string>();
  for (const s of facts.symbolOccurrences ?? []) {
    if (s.normalizedType !== "unknown") covered.add(s.normalizedType);
  }
  for (const i of facts.extractedItems) {
    if (i.category === "socket") covered.add("socket");
    if (i.category === "switch") covered.add("switch");
    if (i.category === "distribution_board") covered.add("distribution_board");
    if (i.category === "cable") covered.add("cable_route");
    if (i.category === "lighting") {
      for (const t of [
        "pendant_light",
        "ceiling_light",
        "wall_light",
        "furniture_light",
        "mirror_light_output",
      ]) {
        covered.add(t);
      }
    }
    if (i.category === "led_strip") {
      covered.add("led_strip");
      covered.add("lighting_profile");
    }
  }
  return covered;
}

/**
 * Client-side mirror of server legend promotion so review UI still shows
 * missing legend mark types (zásuvky/vypínače) even when lighting was counted.
 */
export function foldLegendIntoEstimatorFacts(facts: AiEstimatorFacts): AiEstimatorFacts {
  const legendEntries = facts.legendEntries ?? [];
  if (legendEntries.length === 0) return facts;

  const existing = [...facts.extractedItems];
  const existingKeys = new Set(
    existing.map((i) =>
      itemKey(i.roomName, i.title, i.computedQuantity ?? i.quantity, i.unit)
    )
  );
  const covered = coveredTypesFromFacts(facts);
  const folded = [...existing];
  let promoted = 0;

  for (const l of legendEntries) {
    const type = resolveLegendType(l.normalizedType, l.symbolDescription, l.symbolLabel);
    if (type === "unknown") continue;
    if (covered.has(type)) continue;
    const item = legendEntryToItem({ ...l, normalizedType: type });
    const key = itemKey(item.roomName, item.title, item.quantity, item.unit);
    if (existingKeys.has(key)) continue;
    const titleLower = item.title.trim().toLowerCase();
    if ([...existingKeys].some((k) => k.includes(`|${titleLower}|`))) continue;
    existingKeys.add(key);
    folded.push(item);
    covered.add(type);
    promoted++;
  }

  if (promoted === 0) return facts;

  const warning =
    `Do výkazu boli doplnené značky z legendy, ktoré ešte neboli spočítané na pláne (${promoted}). Overte počty pred pevnou cenou.`;
  const warnings = facts.warnings.includes(warning)
    ? facts.warnings
    : [...facts.warnings, warning];

  const hasCountQ = facts.missingQuestions.some((q) =>
    /počet|pocet|count|výskyt|vyskyt|legende|zásuv|vypína/i.test(`${q.question} ${q.reason}`)
  );
  const missingQuestions = hasCountQ
    ? facts.missingQuestions
    : [
        {
          id: "q_legend_counts",
          question:
            "Koľko kusov / bodov je na výkrese pre každú značku z legendy (zásuvky, vypínače, svietidlá)?",
          reason:
            "AI doplnila typy z legendy, ale niektoré počty ešte nie sú spočítané.",
          importance: "critical" as const,
          blocksFixedQuote: true,
        },
        ...facts.missingQuestions,
      ];

  return {
    ...facts,
    extractedItems: folded,
    warnings,
    missingQuestions,
  };
}
