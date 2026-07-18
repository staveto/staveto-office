/**
 * Takeoff → quote draft bridge.
 *
 * Persists generated takeoff quote lines onto the existing
 * projects/{id}/quoteItems draft model, so the current manual quote editor
 * keeps working: manual items are never touched, prices stay editable and
 * derived lines never carry an invented price (unitPrice = 0 renders as
 * "Cena chýba" in the existing UI).
 */

import { createQuoteDraftItem, listProjectQuoteDraftItems } from "@/lib/projects";
import type { TakeoffQuoteLine } from "@/types/drawingTakeoff";
import { newLinesAgainstExisting } from "@/lib/takeoff/quoteGeneration";
import { updateDrawingOccurrence } from "./drawingOccurrenceService";

export type AddToQuoteResult = {
  added: number;
  skippedExisting: number;
};

/**
 * Adds generated quote lines to the project quote draft (additive only) and
 * marks their source occurrences as used_in_quote.
 * Throws "Quote items can only be edited on draft jobs" for non-draft jobs —
 * the caller shows a friendly message.
 */
export async function addTakeoffLinesToQuoteDraft(
  projectId: string,
  lines: TakeoffQuoteLine[],
  /** Drawing the lines came from — stored for evidence deep links. */
  drawingId?: string
): Promise<AddToQuoteResult> {
  const existing = await listProjectQuoteDraftItems(projectId);
  const fresh = newLinesAgainstExisting(lines, existing);

  for (const line of fresh) {
    const sourceOfQuantity =
      line.sourceOfQuantity ??
      (line.source === "rule_derived"
        ? "estimate_rule"
        : line.source === "legend_only"
          ? "legend_only"
          : line.source === "drawing_detection" || line.source === "symbol_detection"
            ? "symbol_detection"
            : "manual");
    await createQuoteDraftItem(projectId, {
      category: line.category,
      name: line.name,
      qty: line.quantity,
      unit: line.unit,
      unitPrice: line.materialUnitPrice ?? 0,
      note:
        line.source === "rule_derived"
          ? "Odvodená položka z výkresu — skontrolujte."
          : sourceOfQuantity === "legend_only"
            ? "Legenda — neoverené v pôdoryse."
            : "Z výkresu (takeoff).",
      sourceOfQuantity,
      evidenceCount: line.evidenceCount ?? line.sourceOccurrenceIds.length,
      ...(drawingId ? { sourceDrawingId: drawingId } : {}),
      takeoffStatus:
        sourceOfQuantity === "legend_only" ? "legend_only" : line.status === "needs_review" ? "needs_review" : "draft",
    });
  }

  const usedOccurrenceIds = new Set(fresh.flatMap((l) => l.sourceOccurrenceIds));
  for (const occurrenceId of usedOccurrenceIds) {
    await updateDrawingOccurrence(projectId, occurrenceId, { status: "used_in_quote" });
  }

  return { added: fresh.length, skippedExisting: lines.length - fresh.length };
}
