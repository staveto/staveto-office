import type { AiEstimatorFacts, AiExtractedItem } from "@/types/aiEstimator";
import type { AiMaterialSuggestion, AiProjectPlan } from "@/lib/aiProjectSchema";
import { foldLegendIntoEstimatorFacts } from "@/lib/ai/foldLegendIntoEstimatorFacts";
import type { AiProjectDraftLocal, DraftMaterialSuggestion } from "@/lib/aiProjectDraftLocal";

function mapOriginToMaterialSource(
  origin: AiExtractedItem["origin"],
  needsReview: boolean
): AiMaterialSuggestion["materialSource"] {
  if (needsReview) return "needs_confirmation";
  if (origin === "from_document" || origin === "from_photo") return "attachment";
  return "inferred";
}

function newMaterialId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function estimatorItemsToMaterialSuggestions(
  facts: AiEstimatorFacts
): AiMaterialSuggestion[] {
  const folded = foldLegendIntoEstimatorFacts(facts);
  const rows = [...folded.extractedItems, ...folded.inferredItems].filter(
    (i) => i.included !== false && i.origin !== "missing"
  );
  return rows.map((item) => ({
    name: item.roomName ? `${item.title} (${item.roomName})` : item.title,
    category: item.category,
    description: item.description,
    suggestedQuantity: item.computedQuantity ?? item.quantity ?? undefined,
    unit: item.unit && item.unit !== "unknown" ? item.unit : undefined,
    confidence: item.confidence,
    materialSource: mapOriginToMaterialSource(item.origin, item.needsReview),
    sourceNote: [
      item.evidence?.[0]?.fileName
        ? `${item.evidence[0].fileName}${item.evidence[0].page != null ? ` p.${item.evidence[0].page}` : ""}`
        : null,
      `origin=${item.origin}`,
      item.needsReview ? "needsReview" : null,
      item.reviewReason,
    ]
      .filter(Boolean)
      .join(" · "),
    phaseName: item.roomName,
  }));
}

/** Prefer legend/takeoff materials over sparse classic draft categories. */
export function syncDraftMaterialsFromEstimatorFacts(
  draft: AiProjectDraftLocal,
  facts: AiEstimatorFacts
): AiProjectDraftLocal {
  const suggestions = estimatorItemsToMaterialSuggestions(facts);
  if (suggestions.length === 0) return draft;
  const existing = draft.materialSuggestions ?? [];
  if (suggestions.length < Math.max(5, existing.length)) return draft;

  const materials: DraftMaterialSuggestion[] = suggestions.map((m) => ({
    ...m,
    id: newMaterialId(),
    selected: m.confidence !== "low",
  }));

  return {
    ...draft,
    summary: draft.summary || facts.inputSummary,
    materialSuggestions: materials,
  };
}

/** Merge estimator materials into an existing AI plan without dropping phases/tasks. */
export function enrichAiPlanWithEstimatorFacts(
  plan: AiProjectPlan,
  facts: AiEstimatorFacts
): AiProjectPlan {
  const suggestions = estimatorItemsToMaterialSuggestions(facts);
  if (suggestions.length === 0) return plan;

  const existing = plan.materialSuggestions ?? [];
  // Prefer detailed takeoff from legend/facts over sparse classic AI categories.
  if (suggestions.length >= Math.max(5, existing.length)) {
    return {
      ...plan,
      summary: plan.summary || facts.inputSummary,
      materialSuggestions: suggestions,
    };
  }

  const seen = new Set(
    existing.map(
      (m) =>
        `${m.name.trim().toLowerCase()}|${m.suggestedQuantity ?? ""}|${m.unit ?? ""}`
    )
  );
  const merged = [...existing];
  for (const s of suggestions) {
    const key = `${s.name.trim().toLowerCase()}|${s.suggestedQuantity ?? ""}|${s.unit ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
  }

  return {
    ...plan,
    summary: plan.summary || facts.inputSummary,
    materialSuggestions: merged,
  };
}
