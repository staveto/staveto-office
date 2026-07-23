import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/projects", () => ({
  createQuoteDraftItem: vi.fn(),
  deleteQuoteDraftItem: vi.fn(),
  listProjectQuoteDraftItems: vi.fn(),
  updateQuoteDraftItem: vi.fn(),
}));

vi.mock("./drawingOccurrenceService", () => ({
  updateDrawingOccurrence: vi.fn(),
}));

import {
  createQuoteDraftItem,
  deleteQuoteDraftItem,
  listProjectQuoteDraftItems,
  updateQuoteDraftItem,
} from "@/lib/projects";
import {
  dedupeProjectQuoteDraftItems,
  reconcileDrawingQuoteItemsFromConfirmedMarks,
} from "./takeoffQuoteService";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";

function item(partial: Partial<QuoteDraftItemDoc> & { id: string; name: string }): QuoteDraftItemDoc {
  return {
    projectId: "p1",
    category: "material",
    qty: 1,
    unit: "ks",
    unitPrice: 0,
    sortOrder: 0,
    createdAt: null,
    updatedAt: null,
    sourceOfQuantity: "symbol_detection",
    sourceDrawingId: "d1",
    ...partial,
  };
}

describe("reconcileDrawingQuoteItemsFromConfirmedMarks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not wipe quote when confirmed labels are empty", async () => {
    vi.mocked(listProjectQuoteDraftItems).mockResolvedValue([
      item({ id: "q1", name: "Zásuvka 230V", qty: 6 }),
    ]);

    const result = await reconcileDrawingQuoteItemsFromConfirmedMarks({
      projectId: "p1",
      drawingId: "d1",
      confirmedLabels: [],
    });

    expect(result).toEqual({ updated: 0, removed: 0, created: 0 });
    expect(deleteQuoteDraftItem).not.toHaveBeenCalled();
  });

  it("recreates missing quote rows from confirmed marks", async () => {
    vi.mocked(listProjectQuoteDraftItems).mockResolvedValue([]);
    vi.mocked(createQuoteDraftItem).mockResolvedValue("q_new");

    const result = await reconcileDrawingQuoteItemsFromConfirmedMarks({
      projectId: "p1",
      drawingId: "d1",
      confirmedLabels: ["Zásuvka 230V", "Zásuvka 230V", "Svetlo"],
    });

    expect(result.created).toBe(2);
    expect(createQuoteDraftItem).toHaveBeenCalledTimes(2);
    expect(createQuoteDraftItem).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "Zásuvka 230V", qty: 2, sourceDrawingId: "d1" })
    );
    expect(createQuoteDraftItem).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ name: "Svetlo", qty: 1 })
    );
  });

  it("removes orphan only when other confirmed marks exist", async () => {
    vi.mocked(listProjectQuoteDraftItems).mockResolvedValue([
      item({ id: "q1", name: "Zásuvka 230V", qty: 2, evidenceCount: 2 }),
      item({ id: "q2", name: "Orphan", qty: 1 }),
    ]);

    const result = await reconcileDrawingQuoteItemsFromConfirmedMarks({
      projectId: "p1",
      drawingId: "d1",
      confirmedLabels: ["Zásuvka 230V", "Zásuvka 230V"],
    });

    expect(result.removed).toBe(1);
    expect(deleteQuoteDraftItem).toHaveBeenCalledWith("p1", "q2");
    expect(updateQuoteDraftItem).not.toHaveBeenCalled();
  });

  it("links an existing same-name row instead of creating a duplicate", async () => {
    vi.mocked(listProjectQuoteDraftItems).mockResolvedValue([
      item({
        id: "q_price",
        name: "Céliane Prístroj Zásuvky 230V",
        qty: 6,
        unitPrice: 4.42,
        sourceOfQuantity: undefined,
        sourceDrawingId: undefined,
      }),
    ]);

    const result = await reconcileDrawingQuoteItemsFromConfirmedMarks({
      projectId: "p1",
      drawingId: "d1",
      confirmedLabels: Array(6).fill("Céliane Prístroj Zásuvky 230V"),
    });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(createQuoteDraftItem).not.toHaveBeenCalled();
    expect(updateQuoteDraftItem).toHaveBeenCalledWith(
      "p1",
      "q_price",
      expect.objectContaining({
        qty: 6,
        sourceOfQuantity: "symbol_detection",
        sourceDrawingId: "d1",
      })
    );
  });
});

describe("dedupeProjectQuoteDraftItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the priced row and deletes the zero-price duplicate", async () => {
    vi.mocked(listProjectQuoteDraftItems).mockResolvedValue([
      item({
        id: "q1",
        name: "Céliane Prístroj Zásuvky 230V",
        qty: 6,
        unitPrice: 4.42,
      }),
      item({
        id: "q2",
        name: "Céliane Prístroj Zásuvky 230V",
        qty: 6,
        unitPrice: 0,
      }),
    ]);

    const result = await dedupeProjectQuoteDraftItems("p1");
    expect(result.removed).toBe(1);
    expect(deleteQuoteDraftItem).toHaveBeenCalledWith("p1", "q2");
    expect(deleteQuoteDraftItem).not.toHaveBeenCalledWith("p1", "q1");
  });
});
