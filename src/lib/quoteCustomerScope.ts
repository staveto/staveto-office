/**
 * Customer-facing quote scope must never include internal AI briefs,
 * drawing-analysis summaries, or wizard metadata used only to create the project.
 */

const INTERNAL_BRIEF_PATTERNS: RegExp[] = [
  /job\s*archetype/i,
  /customer\s+job\s+for\s+a\s+client/i,
  /electrical\s+marking\s+drawing/i,
  /includes\s+legend/i,
  /legend\s+entries|symbol\s+occurrences/i,
  /\|\s*location\s*:/i,
  /from_document|needsReview|symbolOccurrences/i,
  /detectedDocumentTypes/i,
  /inputSummary/i,
  /origin\s*=\s*(from_document|inferred|assumption)/i,
  /confidence\s*=\s*(high|medium|low)/i,
  /AI\s+estimator|estimator\s+session/i,
];

/** True when text looks like internal creation brief / PDF analysis, not customer copy. */
export function looksLikeInternalProjectBrief(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  if (INTERNAL_BRIEF_PATTERNS.some((p) => p.test(raw))) return true;
  // Drawing-analysis openers (EN) that leaked into scope.
  if (
    /^(Electrical|This\s+(PDF|drawing|document)|Technical\s+drawing|PDF\s+contains)/i.test(
      raw
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Keep only customer-safe paragraphs. Returns "" when nothing usable remains
 * (caller should fall back to task list / default scope bullets).
 */
export function sanitizeCustomerScopeOfWork(text: string | null | undefined): string {
  const raw = text?.trim() ?? "";
  if (!raw) return "";
  if (looksLikeInternalProjectBrief(raw) && !raw.includes("\n\n")) return "";

  const parts = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const kept = parts.filter((p) => !looksLikeInternalProjectBrief(p));
  // Also drop single lines that are pure metadata inside a kept block
  const cleaned = kept
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !looksLikeInternalProjectBrief(line))
        .join("\n")
        .trim()
    )
    .filter(Boolean);

  return cleaned.join("\n\n").trim();
}

type ScopeFactsLike = {
  detectedDocumentTypes?: string[];
  extractedItems?: { category?: string }[];
  inferredItems?: { category?: string }[];
};

/** Short professional SK scope for electrical takeoff — safe for the customer PDF. */
export function buildElectricalCustomerScopeSk(facts: ScopeFactsLike): string {
  const items = [...(facts.extractedItems ?? []), ...(facts.inferredItems ?? [])];
  const cats = new Set(items.map((i) => i.category).filter(Boolean));
  const isElectrical =
    (facts.detectedDocumentTypes ?? []).includes("electrical_marking") ||
    ["socket", "switch", "lighting", "led_strip", "cable", "distribution_board"].some((c) =>
      cats.has(c)
    );

  if (!isElectrical) {
    return [
      "Predmetom ponuky sú práce podľa dohodnutého rozsahu a dodanej dokumentácie.",
      "✓ Príprava a plánovanie",
      "✓ Dodanie / zabezpečenie potrebných materiálov",
      "✓ Vykonanie dohodnutých prác",
      "✓ Kontrola a odovzdanie",
    ].join("\n");
  }

  const lines = [
    "Predmetom ponuky je elektroinštalácia podľa dodanej projektovej dokumentácie.",
  ];
  if (cats.has("socket") || cats.has("switch")) {
    lines.push("✓ Montáž a zapojenie zásuviek a vypínačov");
  }
  if (cats.has("lighting") || cats.has("led_strip")) {
    lines.push("✓ Montáž osvetlenia a LED prvkov");
  }
  if (cats.has("cable") || cats.has("installation_material")) {
    lines.push("✓ Príprava trás a kabeláže");
  }
  lines.push("✓ Drážkovanie / príprava trás podľa projektu");
  lines.push("✓ Osadenie a zapojenie rozvádzača");
  lines.push("✓ Skúšky, merania a odovzdanie");
  return lines.join("\n");
}

/** Prefer explicit customer note; otherwise build a clean electrical scope. Never use AI briefs. */
export function resolveCustomerScopeOfWork(params: {
  noteToCustomer?: string | null;
  facts?: ScopeFactsLike | null;
  existingScope?: string | null;
}): string {
  const fromNote = sanitizeCustomerScopeOfWork(params.noteToCustomer);
  if (fromNote) return fromNote;
  const fromExisting = sanitizeCustomerScopeOfWork(params.existingScope);
  if (fromExisting) return fromExisting;
  if (params.facts) return buildElectricalCustomerScopeSk(params.facts);
  return "";
}
