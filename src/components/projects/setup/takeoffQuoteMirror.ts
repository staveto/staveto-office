/**
 * Takeoff ↔ quote mirror ("Výkaz je zrkadlový nástroj k ponuke").
 *
 * While the quote is a draft, the components + quantities the user confirmed
 * on the PDF (projects/{id}/takeoffItems, keyed by the canonical drawingId)
 * must show up in the quote's material rows (Súhrn / Detailný výkaz /
 * Náhľad ponuky) — live, without a manual "add to quote" step.
 *
 * Ownership rules (kept deliberately asymmetric to avoid sync fights):
 *  - PDF výkaz owns QUANTITY + UNIT of linked rows (marks are the evidence).
 *  - The quote owns PRICE, INCLUDED and CUSTOMER VISIBILITY — never touched.
 *  - NAME is taken from the takeoff item at link time; a later rename in the
 *    quote sticks (the link is by id, not by name).
 *  - Rows are never deleted by the mirror; when a takeoff category drops to
 *    0 marks the row's qty simply follows to 0.
 */

import type { TakeoffItem } from "@/types/pdfTakeoff";
import { isCustomerVisibleItemName } from "@/lib/quoteCustomerItems";
import {
  inferMaterialGroup,
  newLocalId,
  normalizeSetupUnit,
} from "./aiSetupHelpers";
import type { AiSetupMaterialRow } from "./aiSetupTypes";

function normName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Takeoff items that belong in the quote mirror (excluded ones don't). */
export function mirrorableTakeoffItems(items: TakeoffItem[]): TakeoffItem[] {
  return items.filter(
    (i) => i.name.trim() !== "" && i.status !== "excluded" && i.status !== "legend_only"
  );
}

export type MirrorMergeResult = {
  rows: AiSetupMaterialRow[];
  /** False when every row already matched — callers skip the state update. */
  changed: boolean;
};

/**
 * Merge the live takeoff items into the quote material rows.
 *
 * - Rows already linked (takeoffItemId) get quantity/unit refreshed.
 * - Unlinked rows with the same normalized name adopt the link — this also
 *   re-links rows recreated from persisted quoteItems after a reload.
 * - Items with no row yet become new rows (price 0 → shows up in "Ceny"
 *   as missing, which is exactly the reviewer's cue to price them).
 */
export function mergeTakeoffItemsIntoMaterialRows(params: {
  rows: AiSetupMaterialRow[];
  items: TakeoffItem[];
  /** Human note for rows created by the mirror (e.g. "PDF výkaz"). */
  sourceNote?: string;
  /**
   * Takeoff item ids whose local qty edit hasn't been written back yet —
   * the snapshot echo must not revert what the user is typing right now.
   */
  preserveQtyItemIds?: ReadonlySet<string>;
}): MirrorMergeResult {
  const { rows, sourceNote, preserveQtyItemIds } = params;
  const items = mirrorableTakeoffItems(params.items);
  if (items.length === 0) return { rows, changed: false };

  const byItemId = new Map(
    rows.filter((r) => r.takeoffItemId).map((r) => [r.takeoffItemId!, r])
  );
  // Name adoption considers only unlinked rows — a linked row keeps its id.
  const byName = new Map<string, AiSetupMaterialRow>();
  for (const r of rows) {
    if (!r.takeoffItemId && r.name.trim()) {
      const key = normName(r.name);
      if (!byName.has(key)) byName.set(key, r);
    }
  }

  let changed = false;
  const patched = new Map<string, AiSetupMaterialRow>();
  const appended: AiSetupMaterialRow[] = [];

  for (const item of items) {
    const unit = normalizeSetupUnit(item.unit);
    // Round to 2 decimals — summed meter segments otherwise leak float
    // artifacts like 121.80000000000001 into the quote.
    const qty = item.quantity >= 0 ? Math.round(item.quantity * 100) / 100 : 0;
    let existing = byItemId.get(item.id) ?? byName.get(normName(item.name));
    // Name-only adoption: do not hijack a catalog/manual pcs row with a
    // meter takeoff (or vice versa) — that produced nonsense like
    // "Osadenie rozvádzača" jumping to 79.76 pcs from a length sum.
    // Fall through to creating a separate takeoff row instead.
    if (
      existing &&
      existing.takeoffItemId !== item.id &&
      !existing.takeoffItemId &&
      normalizeSetupUnit(existing.unit) !== unit
    ) {
      existing = undefined;
    }

    if (existing) {
      const keepLocalQty = preserveQtyItemIds?.has(item.id) ?? false;
      const nextQty = keepLocalQty ? existing.qty : qty;
      const needsPatch =
        existing.takeoffItemId !== item.id ||
        existing.qty !== nextQty ||
        normalizeSetupUnit(existing.unit) !== unit;
      if (needsPatch) {
        patched.set(existing.id, {
          ...existing,
          takeoffItemId: item.id,
          qty: nextQty,
          unit,
        });
        changed = true;
      }
      continue;
    }

    appended.push({
      id: newLocalId(),
      takeoffItemId: item.id,
      name: item.name.trim(),
      qty,
      unit,
      price: 0,
      included: true,
      customerVisible: isCustomerVisibleItemName(item.name),
      sourceNote,
      confidence: "high",
      group: inferMaterialGroup(item.name),
    });
    changed = true;
  }

  if (!changed) return { rows, changed: false };
  return {
    rows: [...rows.map((r) => patched.get(r.id) ?? r), ...appended],
    changed: true,
  };
}
