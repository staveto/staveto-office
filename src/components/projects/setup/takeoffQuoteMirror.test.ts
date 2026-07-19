/**
 * Takeoff ↔ quote mirror — merge rules.
 *
 * The quote's material rows must reflect the components + counts confirmed
 * on the PDF (takeoffItems) while the quote is a draft: linked rows follow
 * the takeoff quantity, unlinked rows with the same name adopt the link,
 * new takeoff items become new rows — and the quote-owned fields (price,
 * included, customer visibility) are never touched.
 */

import { describe, expect, it } from "vitest";
import type { TakeoffItem } from "@/types/pdfTakeoff";
import type { AiSetupMaterialRow } from "./aiSetupTypes";
import {
  mergeTakeoffItemsIntoMaterialRows,
  mirrorableTakeoffItems,
} from "./takeoffQuoteMirror";

function item(overrides: Partial<TakeoffItem> = {}): TakeoffItem {
  return {
    id: "ti_1",
    projectId: "p1",
    drawingId: "d1",
    quoteId: null,
    name: "Zásuvka 230V",
    profession: "electrical",
    quantity: 12,
    unit: "ks",
    sourceOfQuantity: "symbol_detection",
    status: "confirmed",
    evidenceCount: 12,
    metadata: {},
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function row(overrides: Partial<AiSetupMaterialRow> = {}): AiSetupMaterialRow {
  return {
    id: "row_1",
    name: "Zásuvka 230V",
    qty: 5,
    unit: "pcs",
    price: 3.2,
    included: true,
    ...overrides,
  };
}

describe("mirrorableTakeoffItems", () => {
  it("keeps confirmed/manual items and drops excluded + legend_only ones", () => {
    const items = [
      item({ id: "a", status: "confirmed" }),
      item({ id: "b", status: "excluded" }),
      item({ id: "c", status: "legend_only" }),
      item({ id: "d", status: "needs_review" }),
    ];
    expect(mirrorableTakeoffItems(items).map((i) => i.id)).toEqual(["a", "d"]);
  });
});

describe("mergeTakeoffItemsIntoMaterialRows", () => {
  it("creates a new row (price 0, included) for a takeoff item with no matching row", () => {
    const { rows, changed } = mergeTakeoffItemsIntoMaterialRows({
      rows: [],
      items: [item()],
      sourceNote: "PDF",
    });
    expect(changed).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      takeoffItemId: "ti_1",
      name: "Zásuvka 230V",
      qty: 12,
      unit: "pcs", // "ks" normalized
      price: 0,
      included: true,
      sourceNote: "PDF",
    });
  });

  it("updates qty of an already-linked row but never touches price/included/visibility", () => {
    const existing = row({
      takeoffItemId: "ti_1",
      qty: 5,
      price: 3.2,
      included: false,
      customerVisible: false,
    });
    const { rows, changed } = mergeTakeoffItemsIntoMaterialRows({
      rows: [existing],
      items: [item({ quantity: 12 })],
    });
    expect(changed).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      qty: 12,
      price: 3.2,
      included: false,
      customerVisible: false,
    });
  });

  it("adopts the link on an unlinked row with the same normalized name (relink after reload)", () => {
    const existing = row({ name: "  zásuvka 230v ", qty: 5 });
    const { rows } = mergeTakeoffItemsIntoMaterialRows({
      rows: [existing],
      items: [item({ name: "Zásuvka 230V", quantity: 9 })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ takeoffItemId: "ti_1", qty: 9 });
  });

  it("does not adopt by name when units disagree (catalog pcs vs takeoff meters)", () => {
    const catalog = row({
      name: "Osadenie rozvádzača pod omietku",
      qty: 1,
      unit: "pcs",
      price: 50,
    });
    const { rows, changed } = mergeTakeoffItemsIntoMaterialRows({
      rows: [catalog],
      items: [
        item({
          name: "Osadenie rozvádzača pod omietku",
          quantity: 79.76,
          unit: "m",
        }),
      ],
    });
    // Catalog row stays untouched; takeoff becomes its own new row.
    expect(changed).toBe(true);
    expect(rows).toHaveLength(2);
    const kept = rows.find((r) => r.id === catalog.id);
    expect(kept?.takeoffItemId).toBeUndefined();
    expect(kept).toMatchObject({ qty: 1, unit: "pcs", price: 50 });
    expect(rows.find((r) => r.takeoffItemId === "ti_1")).toMatchObject({
      qty: 79.76,
      unit: "m",
    });
  });

  it("keeps a renamed linked row's name — link is by id, not by name", () => {
    const existing = row({
      takeoffItemId: "ti_1",
      name: "Zásuvka 230V dvojitá (skontrolované)",
      qty: 5,
    });
    const { rows } = mergeTakeoffItemsIntoMaterialRows({
      rows: [existing],
      items: [item({ quantity: 7 })],
    });
    expect(rows[0]).toMatchObject({
      name: "Zásuvka 230V dvojitá (skontrolované)",
      qty: 7,
    });
  });

  it("reports changed: false when everything already matches (no state churn)", () => {
    const existing = row({ takeoffItemId: "ti_1", qty: 12, unit: "pcs" });
    const { rows, changed } = mergeTakeoffItemsIntoMaterialRows({
      rows: [existing],
      items: [item({ quantity: 12 })],
    });
    expect(changed).toBe(false);
    expect(rows[0]).toBe(existing);
  });

  it("follows the takeoff quantity down to 0 when marks are unconfirmed, without deleting the row", () => {
    const existing = row({ takeoffItemId: "ti_1", qty: 12 });
    const { rows } = mergeTakeoffItemsIntoMaterialRows({
      rows: [existing],
      items: [item({ quantity: 0 })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(0);
  });

  it("preserves the local qty for items with a pending write-back (typing must not be reverted)", () => {
    const existing = row({ takeoffItemId: "ti_1", qty: 15 });
    const { rows, changed } = mergeTakeoffItemsIntoMaterialRows({
      rows: [existing],
      items: [item({ quantity: 12 })],
      preserveQtyItemIds: new Set(["ti_1"]),
    });
    expect(changed).toBe(false);
    expect(rows[0]!.qty).toBe(15);
  });

  it("never removes quote-only rows (AI suggestions, manual extras)", () => {
    const manualRow = row({ id: "row_manual", name: "Kábel CYKY 3x2,5", qty: 100, unit: "m" });
    const { rows } = mergeTakeoffItemsIntoMaterialRows({
      rows: [manualRow],
      items: [item()],
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === "row_manual")).toBeDefined();
  });

  it("re-merges after parent load wiped links — appends missing PDF categories", () => {
    // Stale quote rows (no takeoffItemId) after setMaterials(quoteRows).
    const stale = [
      row({ id: "ai1", name: "Zásuvka dvojitá", qty: 1, suggestionId: "s1" }),
      row({ id: "q1", name: "Zásuvka 230V Jedno", qty: 22 }),
    ];
    const takeoff = [
      item({ id: "t1", name: "Zásuvka 230V Jedno", quantity: 22 }),
      item({ id: "t2", name: "Zásuvka 230V dvojitá", quantity: 18 }),
      item({ id: "t3", name: "Podsvietenie vývod", quantity: 15 }),
      item({ id: "t4", name: "Zásuvka 400V", quantity: 1 }),
    ];
    const { rows, changed } = mergeTakeoffItemsIntoMaterialRows({
      rows: stale,
      items: takeoff,
    });
    expect(changed).toBe(true);
    expect(rows.find((r) => r.takeoffItemId === "t1")).toMatchObject({ qty: 22 });
    expect(rows.find((r) => r.takeoffItemId === "t2")).toMatchObject({
      name: "Zásuvka 230V dvojitá",
      qty: 18,
    });
    expect(rows.find((r) => r.takeoffItemId === "t3")).toMatchObject({ qty: 15 });
    expect(rows.find((r) => r.takeoffItemId === "t4")).toMatchObject({ qty: 1 });
    // Near-miss AI orphan stays (summary UI hides it when PDF rows exist).
    expect(rows.find((r) => r.id === "ai1")).toMatchObject({ qty: 1 });
  });
});
