import { describe, expect, it } from "vitest";
import {
  applyConfirmToTakeoffItems,
  applyUnconfirmToTakeoffItems,
  buildManualCandidateDto,
  defaultSymbolTypeForCandidate,
  findDuplicateConfirmedSymbol,
  groupCandidatesForReview,
  isActiveReviewCandidate,
  normalizedRectOverlapRatio,
  sanitizeTakeoffItemForWrite,
  translateBboxPdfForMove,
} from "./candidateReview";
import type { AnalyzeRegionCandidateDto, TakeoffItem } from "@/types/pdfTakeoff";

function cand(
  partial: Partial<AnalyzeRegionCandidateDto> & Pick<AnalyzeRegionCandidateDto, "id">
): AnalyzeRegionCandidateDto {
  return {
    page_number: 1,
    bbox_pdf: [0.1, 0.1, 0.12, 0.12],
    bbox_px: [10, 10, 30, 30],
    color_layer: "green",
    kind: "symbol_candidate",
    label_suggestions: [{ label: "zásuvka", confidence: 0.8 }],
    nearby_text: null,
    confidence: 0.8,
    source: "opencv",
    status: "probable",
    preview_image_url: null,
    normalized_position: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
    ...partial,
  };
}

describe("candidateReview grouping", () => {
  it("groups by sockets / switches / lights / uncertain and hides rejected", () => {
    const groups = groupCandidatesForReview([
      cand({ id: "g1", color_layer: "green" }),
      cand({ id: "r1", color_layer: "red", label_suggestions: [{ label: "vypínač", confidence: 0.7 }] }),
      cand({
        id: "o1",
        color_layer: "orange",
        label_suggestions: [{ label: "svetlo", confidence: 0.7 }],
      }),
      cand({ id: "u1", color_layer: "unknown", confidence: 0.3, status: "candidate" }),
      cand({ id: "x1", status: "rejected" }),
      cand({ id: "c1", status: "confirmed" }),
    ]);
    const ids = Object.fromEntries(groups.map((g) => [g.id, g.candidates.map((c) => c.id)]));
    expect(ids.sockets).toContain("g1");
    expect(ids.switches).toContain("r1");
    expect(ids.lights).toContain("o1");
    expect(ids.uncertain).toContain("u1");
    expect(groups.every((g) => !g.candidates.some((c) => c.id === "x1" || c.id === "c1"))).toBe(
      true
    );
  });

  it("defaultSymbolTypeForCandidate maps color layers", () => {
    expect(defaultSymbolTypeForCandidate(cand({ id: "a", color_layer: "green" }))).toBe("socket");
    expect(defaultSymbolTypeForCandidate(cand({ id: "b", color_layer: "red" }))).toBe("switch");
    expect(
      defaultSymbolTypeForCandidate(
        cand({
          id: "c",
          color_layer: "orange",
          label_suggestions: [{ label: "LED pás", confidence: 0.6 }],
        })
      )
    ).toBe("led_strip");
  });
});

describe("applyConfirmToTakeoffItems", () => {
  it("creates a takeoff item with source_of_quantity = symbol_detection", () => {
    const { updatedItem, created, items } = applyConfirmToTakeoffItems({
      items: [],
      projectId: "p1",
      drawingId: "d1",
      profession: "electrical",
      symbolType: "socket",
      name: "zásuvka",
      unit: "ks",
      quantityValue: 1,
      now: "2026-01-01T00:00:00.000Z",
      newItemId: "t1",
    });
    expect(created).toBe(true);
    expect(updatedItem.sourceOfQuantity).toBe("symbol_detection");
    expect(updatedItem.quantity).toBe(1);
    expect(updatedItem.evidenceCount).toBe(1);
    expect(items).toHaveLength(1);
  });

  it("increments quantity and evidence on the same symbol type", () => {
    const existing: TakeoffItem = {
      id: "t1",
      projectId: "p1",
      drawingId: "d1",
      quoteId: null,
      name: "zásuvka",
      profession: "electrical",
      quantity: 2,
      unit: "ks",
      sourceOfQuantity: "symbol_detection",
      status: "confirmed",
      evidenceCount: 2,
      metadata: { symbolType: "socket" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const { updatedItem, created } = applyConfirmToTakeoffItems({
      items: [existing],
      projectId: "p1",
      drawingId: "d1",
      profession: "electrical",
      symbolType: "socket",
      name: "zásuvka",
      unit: "ks",
      quantityValue: 1,
      now: "2026-01-02T00:00:00.000Z",
      newItemId: "t2",
    });
    expect(created).toBe(false);
    expect(updatedItem.quantity).toBe(3);
    expect(updatedItem.evidenceCount).toBe(3);
  });

  it("rejected candidates are not active for review", () => {
    expect(isActiveReviewCandidate(cand({ id: "x", status: "rejected" }))).toBe(false);
  });
});

describe("applyUnconfirmToTakeoffItems — symmetric reversal of confirm", () => {
  function item(overrides?: Partial<TakeoffItem>): TakeoffItem {
    return {
      id: "t1",
      projectId: "p1",
      drawingId: "d1",
      quoteId: null,
      name: "zásuvka",
      profession: "electrical",
      quantity: 3,
      unit: "ks",
      sourceOfQuantity: "symbol_detection",
      status: "confirmed",
      evidenceCount: 3,
      metadata: { symbolType: "socket" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("decrements quantity/evidence when other confirmations remain", () => {
    const { updatedItem, removeItemId } = applyUnconfirmToTakeoffItems({
      items: [item()],
      drawingId: "d1",
      profession: "electrical",
      symbolType: "socket",
      name: "zásuvka",
      quantityValue: 1,
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(removeItemId).toBeNull();
    expect(updatedItem?.quantity).toBe(2);
    expect(updatedItem?.evidenceCount).toBe(2);
  });

  it("removes the item entirely when quantity would drop to zero or below", () => {
    const { updatedItem, removeItemId } = applyUnconfirmToTakeoffItems({
      items: [item({ quantity: 1, evidenceCount: 1 })],
      drawingId: "d1",
      profession: "electrical",
      symbolType: "socket",
      name: "zásuvka",
      quantityValue: 1,
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(updatedItem).toBeNull();
    expect(removeItemId).toBe("t1");
  });

  it("never touches an item from a different drawing/profession/symbolType", () => {
    const other = item({ id: "t2", drawingId: "d2" });
    const { updatedItem, removeItemId } = applyUnconfirmToTakeoffItems({
      items: [other],
      drawingId: "d1",
      profession: "electrical",
      symbolType: "socket",
      name: "zásuvka",
      quantityValue: 1,
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(updatedItem).toBeNull();
    expect(removeItemId).toBeNull();
  });

  it("round-trips with applyConfirmToTakeoffItems (confirm then unconfirm = no-op)", () => {
    const { items: afterConfirm, updatedItem: confirmedItem } = applyConfirmToTakeoffItems({
      items: [],
      projectId: "p1",
      drawingId: "d1",
      profession: "electrical",
      symbolType: "socket",
      name: "zásuvka",
      unit: "ks",
      quantityValue: 1,
      now: "2026-01-01T00:00:00.000Z",
      newItemId: "t1",
    });
    expect(confirmedItem.quantity).toBe(1);

    const { updatedItem, removeItemId } = applyUnconfirmToTakeoffItems({
      items: afterConfirm,
      drawingId: "d1",
      profession: "electrical",
      symbolType: "socket",
      name: "zásuvka",
      quantityValue: 1,
      now: "2026-01-02T00:00:00.000Z",
    });
    expect(updatedItem).toBeNull();
    expect(removeItemId).toBe("t1");
  });
});

describe("duplicate protection (confirmed symbols)", () => {
  const sym = (
    id: string,
    rect: { x: number; y: number; width: number; height: number },
    drawingId = "d1",
    pageNumber = 1
  ) => ({ id, drawingId, pageNumber, normalizedPosition: rect });

  it("computes IoU: identical = 1, disjoint = 0", () => {
    const a = { x: 0.1, y: 0.1, width: 0.05, height: 0.05 };
    expect(normalizedRectOverlapRatio(a, a)).toBeCloseTo(1);
    expect(
      normalizedRectOverlapRatio(a, { x: 0.5, y: 0.5, width: 0.05, height: 0.05 })
    ).toBe(0);
  });

  it("finds an overlapping confirmed symbol above threshold", () => {
    const existing = [sym("c1", { x: 0.1, y: 0.1, width: 0.04, height: 0.04 })];
    const hit = findDuplicateConfirmedSymbol({
      existing,
      drawingId: "d1",
      pageNumber: 1,
      // Nearly identical box → IoU way above 0.5.
      normalizedPosition: { x: 0.101, y: 0.101, width: 0.04, height: 0.04 },
    });
    expect(hit?.id).toBe("c1");
  });

  it("ignores symbols on other pages/drawings or with small overlap", () => {
    const rect = { x: 0.1, y: 0.1, width: 0.04, height: 0.04 };
    expect(
      findDuplicateConfirmedSymbol({
        existing: [sym("p2", rect, "d1", 2)],
        drawingId: "d1",
        pageNumber: 1,
        normalizedPosition: rect,
      })
    ).toBeNull();
    expect(
      findDuplicateConfirmedSymbol({
        existing: [sym("d2", rect, "d2", 1)],
        drawingId: "d1",
        pageNumber: 1,
        normalizedPosition: rect,
      })
    ).toBeNull();
    expect(
      findDuplicateConfirmedSymbol({
        existing: [sym("far", { x: 0.13, y: 0.13, width: 0.04, height: 0.04 })],
        drawingId: "d1",
        pageNumber: 1,
        normalizedPosition: rect,
      })
    ).toBeNull();
  });
});

describe("takeoff item write invariants", () => {
  const baseItem: TakeoffItem = {
    id: "t1",
    projectId: "p1",
    drawingId: "d1",
    quoteId: null,
    name: "zásuvka",
    profession: "electrical",
    quantity: 1,
    unit: "ks",
    sourceOfQuantity: "symbol_detection",
    status: "confirmed",
    evidenceCount: 1,
    metadata: { symbolType: "socket" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("throws when sourceOfQuantity is missing", () => {
    const broken = { ...baseItem, sourceOfQuantity: undefined } as unknown as TakeoffItem;
    expect(() => sanitizeTakeoffItemForWrite(broken)).toThrow(
      "TAKEOFF_ITEM_MISSING_SOURCE_OF_QUANTITY"
    );
  });

  it("legend_only is never stored as confirmed", () => {
    const sanitized = sanitizeTakeoffItemForWrite({
      ...baseItem,
      sourceOfQuantity: "legend_only",
      status: "confirmed",
    });
    expect(sanitized.status).toBe("legend_only");
  });

  it("passes valid items through unchanged", () => {
    expect(sanitizeTakeoffItemForWrite(baseItem)).toEqual(baseItem);
  });
});

describe("buildManualCandidateDto — manual marks join the shared model", () => {
  const rect = { x: 0.3, y: 0.4, width: 0.02, height: 0.03 };

  it("creates a manual/probable candidate that never carries a quantity", () => {
    const dto = buildManualCandidateDto({
      pageNumber: 2,
      normalizedPosition: rect,
      symbolType: "socket",
      label: "Zásuvka obývačka",
    });
    expect(dto.id.startsWith("cand_")).toBe(true);
    expect(dto.source).toBe("manual");
    expect(dto.status).toBe("probable"); // review needed — not confirmed
    expect(dto.page_number).toBe(2);
    expect(dto.normalized_position).toEqual(rect);
    expect(dto.label_suggestions[0]?.label).toBe("Zásuvka obývačka");
    // Manual candidates are reviewable through the standard grouping.
    expect(isActiveReviewCandidate(dto)).toBe(true);
  });

  it("maps symbol type to the matching color layer", () => {
    const mk = (symbolType: string) =>
      buildManualCandidateDto({ pageNumber: 1, normalizedPosition: rect, symbolType });
    expect(mk("socket").color_layer).toBe("green");
    expect(mk("switch").color_layer).toBe("red");
    expect(mk("light").color_layer).toBe("orange");
    expect(mk("led_strip").color_layer).toBe("orange");
    expect(mk("generic").color_layer).toBe("unknown");
  });

  it("falls back to the default label and keeps the note as nearby text", () => {
    const dto = buildManualCandidateDto({
      pageNumber: 1,
      normalizedPosition: rect,
      symbolType: "switch",
      note: "pri dverách",
    });
    expect(dto.label_suggestions[0]?.label).toBe("vypínač");
    expect(dto.nearby_text).toBe("pri dverách");
  });
});

describe("translateBboxPdfForMove — drag-to-reposition keeps bbox_pdf in sync", () => {
  it("translates bbox_pdf stored in real PDF points by the same real-world delta", () => {
    // 1 normalized unit == 800 pt on this page (a typical A4-ish scale).
    const oldNormalized = { x: 0.1, y: 0.2, width: 0.02, height: 0.02 };
    const oldBboxPdf: [number, number, number, number] = [80, 160, 96, 176]; // *800
    const newNormalized = { x: 0.15, y: 0.22, width: 0.02, height: 0.02 };

    const next = translateBboxPdfForMove(oldBboxPdf, oldNormalized, newNormalized);

    // dx = 0.05 * 800 = 40pt, dy = 0.02 * 800 = 16pt.
    expect(next[0]).toBeCloseTo(120);
    expect(next[1]).toBeCloseTo(176);
    expect(next[2]).toBeCloseTo(136);
    expect(next[3]).toBeCloseTo(192);
    // Size is preserved — this is a translation, not a resize.
    expect(next[2] - next[0]).toBeCloseTo(oldBboxPdf[2] - oldBboxPdf[0]);
    expect(next[3] - next[1]).toBeCloseTo(oldBboxPdf[3] - oldBboxPdf[1]);
  });

  it("translates bbox_pdf stored as a normalized 0..1 fallback the same way", () => {
    const oldNormalized = { x: 0.3, y: 0.4, width: 0.05, height: 0.05 };
    const oldBboxPdf: [number, number, number, number] = [0.3, 0.4, 0.35, 0.45];
    const newNormalized = { x: 0.32, y: 0.41, width: 0.05, height: 0.05 };

    const next = translateBboxPdfForMove(oldBboxPdf, oldNormalized, newNormalized);
    expect(next[0]).toBeCloseTo(0.32);
    expect(next[1]).toBeCloseTo(0.41);
    expect(next[2]).toBeCloseTo(0.37);
    expect(next[3]).toBeCloseTo(0.46);
  });

  it("is a no-op when the position does not actually change", () => {
    const normalized = { x: 0.3, y: 0.4, width: 0.05, height: 0.05 };
    const bboxPdf: [number, number, number, number] = [10, 20, 30, 40];
    expect(translateBboxPdfForMove(bboxPdf, normalized, normalized)).toEqual(bboxPdf);
  });
});
