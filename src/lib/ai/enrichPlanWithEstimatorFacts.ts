import type { AiEstimatorFacts, AiExtractedItem } from "@/types/aiEstimator";
import type { AiMaterialSuggestion, AiProjectPlan } from "@/lib/aiProjectSchema";
import { foldLegendIntoEstimatorFacts } from "@/lib/ai/foldLegendIntoEstimatorFacts";
import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";

function mapOriginToMaterialSource(
  origin: AiExtractedItem["origin"],
  needsReview: boolean
): AiMaterialSuggestion["materialSource"] {
  if (needsReview) return "needs_confirmation";
  if (origin === "from_document" || origin === "from_photo") return "attachment";
  return "inferred";
}

/**
 * Map estimator items → material *suggestions for review*.
 * Callers must NOT treat these as trusted takeoff / auto-selected materials.
 */
export function estimatorItemsToMaterialSuggestions(
  facts: AiEstimatorFacts
): AiMaterialSuggestion[] {
  const folded = foldLegendIntoEstimatorFacts(facts);
  // Exclude legend-promoted rows (ids from foldLegend) and raw legend-only noise.
  // Keep AI extracted/inferred for "AI návrhy na kontrolu" only.
  const rows = [...folded.extractedItems, ...folded.inferredItems].filter(
    (i) =>
      i.included !== false &&
      i.origin !== "missing" &&
      !i.id.startsWith("legend_item_")
  );
  return rows.map((item) => ({
    name: item.roomName ? `${item.title} (${item.roomName})` : item.title,
    category: item.category,
    description: item.description,
    suggestedQuantity: item.computedQuantity ?? item.quantity ?? undefined,
    unit: item.unit && item.unit !== "unknown" ? item.unit : undefined,
    confidence: item.confidence,
    materialSource: mapOriginToMaterialSource(item.origin, item.needsReview || true),
    sourceNote: [
      item.evidence?.[0]?.fileName
        ? `${item.evidence[0].fileName}${item.evidence[0].page != null ? ` p.${item.evidence[0].page}` : ""}`
        : null,
      `origin=${item.origin}`,
      "needsReview",
      "mvp_review_only",
      item.reviewReason,
    ]
      .filter(Boolean)
      .join(" · "),
    phaseName: item.roomName,
  }));
}

/**
 * MVP safety: do NOT auto-replace draft materials from AI/legend facts.
 * Suggestions stay on the review screen under "AI návrhy na kontrolu".
 */
export function syncDraftMaterialsFromEstimatorFacts(
  draft: AiProjectDraftLocal,
  _facts: AiEstimatorFacts
): AiProjectDraftLocal {
  return draft;
}

/**
 * MVP safety: do NOT auto-enrich plan.materialSuggestions from legend/AI takeoff.
 * Keeps classic draft materials if any; estimator items are review-only in UI.
 */
export function enrichAiPlanWithEstimatorFacts(
  plan: AiProjectPlan,
  facts: AiEstimatorFacts
): AiProjectPlan {
  return {
    ...plan,
    summary: plan.summary || facts.inputSummary,
    // Intentionally leave materialSuggestions unchanged — no legend dump into quote.
  };
}
