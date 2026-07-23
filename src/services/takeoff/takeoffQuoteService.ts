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
  deleteQuoteDraftItem,
  listProjectQuoteDraftItems,
  updateQuoteDraftItem,
} from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import type { TakeoffQuoteLine } from "@/types/drawingTakeoff";
import { newLinesAgainstExisting } from "@/lib/takeoff/quoteGeneration";
import { categoryKeyForLabel } from "@/lib/takeoff/takeoffCategories";
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

function isTakeoffLinkedQuoteItem(item: QuoteDraftItemDoc): boolean {
  return (
    item.sourceOfQuantity === "symbol_detection" ||
    Boolean(item.sourceDrawingId?.trim())
  );
}

async function findQuoteItemForTakeoffMark(params: {
  projectId: string;
  name: string;
  unit: string;
  quoteItemId?: string;
}): Promise<QuoteDraftItemDoc | null> {
  const existing = await listProjectQuoteDraftItems(params.projectId);
  if (params.quoteItemId) {
    const byId = existing.find((e) => e.id === params.quoteItemId);
    if (byId) return byId;
  }
  const nameKey = params.name.trim().toLowerCase();
  const unitKey = params.unit.toLowerCase();
  return (
    existing.find(
      (e) =>
        e.name.trim().toLowerCase() === nameKey &&
        e.unit.trim().toLowerCase() === unitKey &&
        isTakeoffLinkedQuoteItem(e)
    ) ??
    existing.find(
      (e) =>
        e.name.trim().toLowerCase() === nameKey && e.unit.trim().toLowerCase() === unitKey
    ) ??
    null
  );
}

/**
 * Keep a quote draft line in sync with PDF marking.
 * Creates the line on first mark; later marks update qty; qty 0 deletes a
 * takeoff-linked line so deleted marks do not stay orphaned in the quote.
 * Returns the quoteItems document id, or null when the line was removed.
 */
export async function syncCatalogMarkedQtyToQuote(params: {
  projectId: string;
  drawingId?: string;
  name: string;
  qty: number;
  /** When omitted on update, existing unitPrice is preserved. */
  unitPrice?: number;
  unit?: string;
  note?: string;
  quoteItemId?: string;
}): Promise<string | null> {
  const unit = params.unit?.trim() || "ks";
  const qty = Math.max(0, Math.round(params.qty));

  if (qty <= 0) {
    const match = await findQuoteItemForTakeoffMark({
      projectId: params.projectId,
      name: params.name,
      unit,
      quoteItemId: params.quoteItemId,
    });
    if (!match) return null;
    if (!isTakeoffLinkedQuoteItem(match)) return match.id;
    await deleteQuoteDraftItem(params.projectId, match.id);
    return null;
  }

  const unitPrice =
    typeof params.unitPrice === "number" && params.unitPrice >= 0
      ? params.unitPrice
      : undefined;

  const match = await findQuoteItemForTakeoffMark({
    projectId: params.projectId,
    name: params.name,
    unit,
    quoteItemId: params.quoteItemId,
  });

  if (match) {
    await updateQuoteDraftItem(params.projectId, match.id, {
      qty,
      evidenceCount: qty,
      ...(unitPrice !== undefined ? { unitPrice } : {}),
      ...(params.drawingId ? { sourceDrawingId: params.drawingId } : {}),
      sourceOfQuantity: match.sourceOfQuantity ?? "symbol_detection",
    });
    return match.id;
  }

  return createQuoteDraftItem(params.projectId, {
    category: "material",
    name: params.name.trim(),
    qty,
    unit,
    unitPrice: unitPrice ?? 0,
    note: params.note,
    sourceOfQuantity: "symbol_detection",
    evidenceCount: qty,
    ...(params.drawingId ? { sourceDrawingId: params.drawingId } : {}),
    takeoffStatus: "draft",
  });
}

function quoteItemNameKey(item: Pick<QuoteDraftItemDoc, "name" | "unit">): string {
  return `${categoryKeyForLabel(item.name)}|${(item.unit || "ks").trim().toLowerCase()}`;
}

/**
 * Prefer the row that already carries price / takeoff linkage when merging.
 */
function preferQuoteDraftItem(a: QuoteDraftItemDoc, b: QuoteDraftItemDoc): QuoteDraftItemDoc {
  if ((a.unitPrice ?? 0) !== (b.unitPrice ?? 0)) {
    return (a.unitPrice ?? 0) > (b.unitPrice ?? 0) ? a : b;
  }
  const aLinked = a.sourceOfQuantity === "symbol_detection" ? 1 : 0;
  const bLinked = b.sourceOfQuantity === "symbol_detection" ? 1 : 0;
  if (aLinked !== bLinked) return aLinked > bLinked ? a : b;
  if ((a.qty ?? 0) !== (b.qty ?? 0)) return (a.qty ?? 0) > (b.qty ?? 0) ? a : b;
  return a;
}

/**
 * Collapse duplicate quote draft rows with the same name+unit (keep best price).
 * Fixes accidental doubles after restore + takeoff reconcile.
 */
export async function dedupeProjectQuoteDraftItems(
  projectId: string
): Promise<{ removed: number }> {
  const existing = await listProjectQuoteDraftItems(projectId);
  const groups = new Map<string, QuoteDraftItemDoc[]>();
  for (const item of existing) {
    const key = quoteItemNameKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  let removed = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const winner = group.reduce(preferQuoteDraftItem);
    for (const item of group) {
      if (item.id === winner.id) continue;
      await deleteQuoteDraftItem(projectId, item.id);
      removed += 1;
    }
  }
  return { removed };
}

/**
 * Sync takeoff-linked quote lines for one drawing from confirmed mark counts.
 *
 * - Upserts a quote row per confirmed category (restores missing lines).
 * - Matches by name even when the row was restored without takeoff fields
 *   (avoids creating a second zero-price duplicate).
 * - Updates qty when the mark count changed.
 * - Removes a linked row only when that category has 0 marks AND we still
 *   see other confirmed marks on the drawing (so an empty candidate load
 *   never wipes the whole quote).
 *
 * Explicit mark/category delete still calls syncCatalogMarkedQtyToQuote(qty:0).
 */
export async function reconcileDrawingQuoteItemsFromConfirmedMarks(params: {
  projectId: string;
  drawingId: string;
  /** Confirmed mark labels on this drawing (one entry per mark). */
  confirmedLabels: string[];
}): Promise<{ updated: number; removed: number; created: number }> {
  const counts = new Map<string, { label: string; qty: number }>();
  for (const raw of params.confirmedLabels) {
    const label = raw.trim();
    if (!label) continue;
    const key = categoryKeyForLabel(label);
    const prev = counts.get(key);
    if (prev) prev.qty += 1;
    else counts.set(key, { label, qty: 1 });
  }

  const existing = await listProjectQuoteDraftItems(params.projectId);
  const linked = existing.filter(
    (item) =>
      item.sourceDrawingId === params.drawingId &&
      item.sourceOfQuantity === "symbol_detection"
  );
  const byKey = new Map<string, QuoteDraftItemDoc>();
  // Prefer drawing-linked rows; fall back to any same-name material row.
  for (const item of existing) {
    const key = categoryKeyForLabel(item.name);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    byKey.set(key, preferQuoteDraftItem(prev, item));
  }
  for (const item of linked) {
    byKey.set(categoryKeyForLabel(item.name), item);
  }

  let updated = 0;
  let removed = 0;
  let created = 0;

  for (const [key, { label, qty }] of counts) {
    const match = byKey.get(key);
    if (match) {
      const needsLink =
        match.sourceOfQuantity !== "symbol_detection" ||
        match.sourceDrawingId !== params.drawingId;
      const needsQty = match.qty !== qty || match.evidenceCount !== qty;
      if (needsLink || needsQty) {
        await updateQuoteDraftItem(params.projectId, match.id, {
          qty,
          evidenceCount: qty,
          sourceOfQuantity: "symbol_detection",
          sourceDrawingId: params.drawingId,
          ...(match.note?.trim()
            ? {}
            : { note: "Z výkresu (takeoff)." }),
        });
        updated += 1;
      }
      continue;
    }
    await createQuoteDraftItem(params.projectId, {
      category: "material",
      name: label,
      qty,
      unit: "ks",
      unitPrice: 0,
      note: "Z výkresu (takeoff).",
      sourceOfQuantity: "symbol_detection",
      evidenceCount: qty,
      sourceDrawingId: params.drawingId,
      takeoffStatus: "draft",
    });
    created += 1;
  }

  // Only drop orphans when we successfully observed at least one confirmed
  // mark — an empty load must never erase the quote.
  if (counts.size > 0) {
    for (const item of linked) {
      const key = categoryKeyForLabel(item.name);
      if (counts.has(key)) continue;
      await deleteQuoteDraftItem(params.projectId, item.id);
      removed += 1;
    }
  }

  return { updated, removed, created };
}
