/**
 * Takeoff → quote draft bridge.
 *
 * Persists generated takeoff quote lines onto the existing
 * projects/{id}/quoteItems draft model, so the current manual quote editor
 * keeps working: manual items are never touched, prices stay editable and
 * derived lines never carry an invented price (unitPrice = 0 renders as
 * "Cena chýba" in the existing UI).
 */

import {
  createQuoteDraftItem,
  listProjectQuoteDraftItems,
  updateQuoteDraftItem,
} from "@/lib/projects";
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

/**
 * Keep a quote draft line in sync with catalog-backed PDF marking.
 * Creates the line on first mark; later marks update qty (+ price from catalog).
 * Returns the quoteItems document id for the binding cache.
 */
export async function syncCatalogMarkedQtyToQuote(params: {
  projectId: string;
  drawingId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  unit?: string;
  note?: string;
  quoteItemId?: string;
}): Promise<string> {
  const unit = params.unit?.trim() || "ks";
  const qty = Math.max(1, Math.round(params.qty));
  const unitPrice =
    typeof params.unitPrice === "number" && params.unitPrice >= 0
      ? params.unitPrice
      : 0;

  if (params.quoteItemId) {
    await updateQuoteDraftItem(params.projectId, params.quoteItemId, {
      qty,
      unitPrice,
    });
    return params.quoteItemId;
  }

  const existing = await listProjectQuoteDraftItems(params.projectId);
  const nameKey = params.name.trim().toLowerCase();
  const unitKey = unit.toLowerCase();
  const match = existing.find(
    (e) => e.name.trim().toLowerCase() === nameKey && e.unit.trim().toLowerCase() === unitKey
  );
  if (match) {
    await updateQuoteDraftItem(params.projectId, match.id, { qty, unitPrice });
    return match.id;
  }

  return createQuoteDraftItem(params.projectId, {
    category: "material",
    name: params.name.trim(),
    qty,
    unit,
    unitPrice,
    note: params.note,
    sourceOfQuantity: "symbol_detection",
    evidenceCount: qty,
    ...(params.drawingId ? { sourceDrawingId: params.drawingId } : {}),
    takeoffStatus: "draft",
  });
}
