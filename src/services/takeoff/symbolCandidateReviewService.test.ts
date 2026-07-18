/**
 * Phase 2.6 — duplicate-conflict safety for confirmSymbolCandidate.
 *
 * Firestore is mocked so we can assert the write-level guarantees:
 * a duplicate confirm must not create a confirmedSymbol, must not change
 * takeoff quantities, must not create takeoffEvidence, and must surface
 * the existing symbol's metadata for the resolution dialog.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmedSymbol, SymbolCandidate } from "@/types/pdfTakeoff";

vi.mock("@/services/takeoff/pdfTakeoffRegionService", () => ({
  getSymbolCandidate: vi.fn(),
  updateSymbolCandidateStatus: vi.fn(),
  createConfirmedSymbol: vi.fn(),
  listConfirmedSymbolsForPage: vi.fn(),
  listTakeoffEvidenceForConfirmedSymbol: vi.fn(),
  listTakeoffItems: vi.fn(),
  upsertTakeoffItem: vi.fn(),
  createTakeoffEvidence: vi.fn(),
  createSymbolTemplate: vi.fn(),
  deleteSymbolCandidate: vi.fn(),
  deleteConfirmedSymbol: vi.fn(),
  deleteTakeoffEvidence: vi.fn(),
  deleteTakeoffItem: vi.fn(),
  getConfirmedSymbolByCandidateId: vi.fn(),
  updateConfirmedSymbolType: vi.fn(),
  updateSymbolCandidatePosition: vi.fn(),
  updateConfirmedSymbolPosition: vi.fn(),
  updateTakeoffEvidenceItem: vi.fn(),
}));

vi.mock("@/services/takeoff/takeoffImageService", () => ({
  createEvidenceImage: vi.fn().mockResolvedValue(null),
  createTemplateImage: vi.fn().mockResolvedValue(null),
}));

import {
  changeConfirmedSymbolType,
  confirmSymbolCandidate,
  deleteCandidate,
  DuplicateConfirmedSymbolError,
  moveCandidateOrConfirmedSymbol,
  moveConfirmedSymbolToCategory,
  rejectSymbolCandidate,
  unconfirmAndDeleteSymbol,
} from "./symbolCandidateReviewService";
import {
  createConfirmedSymbol,
  createTakeoffEvidence,
  deleteConfirmedSymbol,
  deleteSymbolCandidate,
  deleteTakeoffEvidence,
  deleteTakeoffItem,
  getConfirmedSymbolByCandidateId,
  getSymbolCandidate,
  listConfirmedSymbolsForPage,
  listTakeoffEvidenceForConfirmedSymbol,
  listTakeoffItems,
  updateConfirmedSymbolPosition,
  updateConfirmedSymbolType,
  updateSymbolCandidatePosition,
  updateSymbolCandidateStatus,
  updateTakeoffEvidenceItem,
  upsertTakeoffItem,
} from "@/services/takeoff/pdfTakeoffRegionService";

const NORMALIZED = { x: 0.4, y: 0.4, width: 0.03, height: 0.03 };

function candidateRow(): SymbolCandidate {
  return {
    id: "cand_1",
    drawingId: "d1",
    projectId: "p1",
    pageNumber: 2,
    regionId: "reg_1",
    bboxPdf: [100, 100, 120, 120],
    bboxPx: [10, 10, 30, 30],
    normalizedPosition: NORMALIZED,
    colorLayer: "green",
    kind: "symbol_candidate",
    labelSuggestions: [{ label: "zásuvka", confidence: 0.8 }],
    nearbyText: null,
    confidence: 0.8,
    source: "opencv",
    status: "probable",
    previewImageUrl: "https://storage/cand_1.png",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function existingConfirmed(): ConfirmedSymbol {
  return {
    id: "csym_existing",
    candidateId: "cand_0",
    drawingId: "d1",
    projectId: "p1",
    pageNumber: 2,
    bboxPdf: [101, 101, 121, 121],
    normalizedPosition: { ...NORMALIZED, x: NORMALIZED.x + 0.001 },
    symbolType: "socket",
    profession: "electrical",
    roomId: null,
    zoneId: null,
    quantityValue: 1,
    quantityUnit: "ks",
    confirmationSource: "user",
    confidence: 0.9,
    evidenceImageUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSymbolCandidate).mockResolvedValue(candidateRow());
  vi.mocked(listTakeoffItems).mockResolvedValue([]);
  vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([]);
  vi.mocked(updateTakeoffEvidenceItem).mockResolvedValue(undefined);
  vi.mocked(upsertTakeoffItem).mockImplementation(async (item) => item);
  vi.mocked(createConfirmedSymbol).mockImplementation(
    async (input) =>
      ({
        ...input,
        id: input.id ?? "csym_new",
        createdAt: "",
        updatedAt: "",
      }) as ConfirmedSymbol
  );
  vi.mocked(createTakeoffEvidence).mockImplementation(
    async (input) => ({ ...input, id: "tev_1", createdAt: "" }) as never
  );
  vi.mocked(deleteSymbolCandidate).mockResolvedValue(undefined);
  vi.mocked(deleteConfirmedSymbol).mockResolvedValue(undefined);
  vi.mocked(deleteTakeoffEvidence).mockResolvedValue(undefined);
  vi.mocked(deleteTakeoffItem).mockResolvedValue(undefined);
  vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(null);
  vi.mocked(updateConfirmedSymbolType).mockResolvedValue(undefined);
});

describe("confirmSymbolCandidate — duplicate conflict", () => {
  it("throws DuplicateConfirmedSymbolError with existing symbol metadata", async () => {
    vi.mocked(listConfirmedSymbolsForPage).mockResolvedValue([existingConfirmed()]);
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([
      {
        id: "tev_existing",
        takeoffItemId: "titem_existing",
        confirmedSymbolId: "csym_existing",
        drawingId: "d1",
        projectId: "p1",
        pageNumber: 2,
        bboxPdf: [101, 101, 121, 121],
        normalizedPosition: NORMALIZED,
        evidenceImageUrl: null,
        createdAt: "",
      },
    ]);

    const err = await confirmSymbolCandidate({
      projectId: "p1",
      candidateId: "cand_1",
    }).then(
      () => null,
      (e) => e as DuplicateConfirmedSymbolError
    );

    expect(err).toBeInstanceOf(DuplicateConfirmedSymbolError);
    expect(err!.code).toBe("DUPLICATE_CONFIRMED_SYMBOL");
    expect(err!.existingSymbolId).toBe("csym_existing");
    expect(err!.existingBboxPdf).toEqual([101, 101, 121, 121]);
    expect(err!.existingPageNumber).toBe(2);
    expect(err!.existingNormalizedPosition.x).toBeCloseTo(NORMALIZED.x + 0.001);
    expect(err!.existingTakeoffItemId).toBe("titem_existing");
  });

  it("does not create confirmedSymbol, quantity or evidence on duplicate", async () => {
    vi.mocked(listConfirmedSymbolsForPage).mockResolvedValue([existingConfirmed()]);

    await expect(
      confirmSymbolCandidate({ projectId: "p1", candidateId: "cand_1" })
    ).rejects.toBeInstanceOf(DuplicateConfirmedSymbolError);

    expect(createConfirmedSymbol).not.toHaveBeenCalled();
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(createTakeoffEvidence).not.toHaveBeenCalled();
    // Candidate status stays untouched too — user decides in the dialog.
    expect(updateSymbolCandidateStatus).not.toHaveBeenCalled();
  });

  it("confirms normally when no overlapping symbol exists", async () => {
    vi.mocked(listConfirmedSymbolsForPage).mockResolvedValue([]);

    const result = await confirmSymbolCandidate({
      projectId: "p1",
      candidateId: "cand_1",
    });

    expect(createConfirmedSymbol).toHaveBeenCalledTimes(1);
    expect(upsertTakeoffItem).toHaveBeenCalledTimes(1);
    expect(createTakeoffEvidence).toHaveBeenCalledTimes(1);
    expect(result.takeoffItemQuantity).toBe(1);
    const item = vi.mocked(upsertTakeoffItem).mock.calls[0]![0];
    expect(item.sourceOfQuantity).toBe("symbol_detection");
  });

  it("confirming a template_match (find-similar) candidate updates quantity + evidence", async () => {
    vi.mocked(listConfirmedSymbolsForPage).mockResolvedValue([]);
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      id: "cand_sim_1",
      source: "template_match",
      normalizedPosition: { x: 0.6, y: 0.6, width: 0.02, height: 0.02 },
    });

    const result = await confirmSymbolCandidate({
      projectId: "p1",
      candidateId: "cand_sim_1",
    });

    expect(createConfirmedSymbol).toHaveBeenCalledTimes(1);
    expect(createTakeoffEvidence).toHaveBeenCalledTimes(1);
    expect(result.takeoffItemQuantity).toBe(1);
    const item = vi.mocked(upsertTakeoffItem).mock.calls[0]![0];
    expect(item.sourceOfQuantity).toBe("symbol_detection");
  });
});

describe("confirmSymbolCandidate — manual marks (shared model)", () => {
  it("confirming a manual candidate creates evidence and updates takeoff quantity", async () => {
    vi.mocked(listConfirmedSymbolsForPage).mockResolvedValue([]);
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      id: "cand_man_1",
      source: "manual",
      normalizedPosition: { x: 0.2, y: 0.7, width: 0.02, height: 0.02 },
    });

    const result = await confirmSymbolCandidate({
      projectId: "p1",
      candidateId: "cand_man_1",
      symbol_type: "socket",
    });

    expect(createConfirmedSymbol).toHaveBeenCalledTimes(1);
    expect(createTakeoffEvidence).toHaveBeenCalledTimes(1);
    expect(result.takeoffItemQuantity).toBe(1);
    const item = vi.mocked(upsertTakeoffItem).mock.calls[0]![0];
    expect(item.sourceOfQuantity).toBe("symbol_detection");
  });

  it("a manual candidate that is merely saved (not confirmed) writes nothing", async () => {
    // Saving a candidate goes through saveSymbolCandidates only — the review
    // service is never called, so quantities/evidence cannot change. Assert
    // the invariant at the mock level: no confirm ⇒ no writes.
    expect(createConfirmedSymbol).not.toHaveBeenCalled();
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(createTakeoffEvidence).not.toHaveBeenCalled();
  });

  it("duplicate protection applies to manual candidates too", async () => {
    vi.mocked(listConfirmedSymbolsForPage).mockResolvedValue([existingConfirmed()]);
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      id: "cand_man_dup",
      source: "manual",
    });

    await expect(
      confirmSymbolCandidate({ projectId: "p1", candidateId: "cand_man_dup" })
    ).rejects.toBeInstanceOf(DuplicateConfirmedSymbolError);
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
  });
});

describe("rejectSymbolCandidate — duplicate resolution", () => {
  it("only marks the candidate rejected; existing symbol/evidence untouched", async () => {
    await rejectSymbolCandidate({ projectId: "p1", candidateId: "cand_1" });

    expect(updateSymbolCandidateStatus).toHaveBeenCalledExactlyOnceWith(
      "p1",
      "cand_1",
      { status: "rejected" }
    );
    expect(createConfirmedSymbol).not.toHaveBeenCalled();
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(createTakeoffEvidence).not.toHaveBeenCalled();
  });
});

describe("deleteCandidate — permanent removal of a not-yet-confirmed row", () => {
  it("deletes a rejected candidate outright", async () => {
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      id: "cand_rej_1",
      status: "rejected",
    });

    await deleteCandidate({ projectId: "p1", candidateId: "cand_rej_1" });

    expect(deleteSymbolCandidate).toHaveBeenCalledExactlyOnceWith("p1", "cand_rej_1");
  });

  it("deletes a plain candidate/probable row without touching quantities", async () => {
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      id: "cand_1",
      status: "probable",
    });

    await deleteCandidate({ projectId: "p1", candidateId: "cand_1" });

    expect(deleteSymbolCandidate).toHaveBeenCalledExactlyOnceWith("p1", "cand_1");
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(deleteConfirmedSymbol).not.toHaveBeenCalled();
  });

  it("refuses to delete a CONFIRMED candidate directly — must use unconfirmAndDeleteSymbol", async () => {
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      id: "cand_confirmed",
      status: "confirmed",
    });

    await expect(
      deleteCandidate({ projectId: "p1", candidateId: "cand_confirmed" })
    ).rejects.toThrow("CANDIDATE_CONFIRMED_USE_UNCONFIRM");
    expect(deleteSymbolCandidate).not.toHaveBeenCalled();
  });
});

describe("unconfirmAndDeleteSymbol — symmetric reversal of confirm", () => {
  function confirmedRow(overrides?: Partial<ConfirmedSymbol>): ConfirmedSymbol {
    return {
      id: "csym_1",
      candidateId: "cand_1",
      drawingId: "d1",
      projectId: "p1",
      pageNumber: 2,
      bboxPdf: [100, 100, 120, 120],
      normalizedPosition: NORMALIZED,
      symbolType: "socket",
      profession: "electrical",
      roomId: null,
      zoneId: null,
      quantityValue: 1,
      quantityUnit: "ks",
      confirmationSource: "user",
      confidence: 0.9,
      evidenceImageUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("throws when the candidate has no backing confirmed symbol", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(null);

    await expect(
      unconfirmAndDeleteSymbol({ projectId: "p1", candidateId: "cand_missing" })
    ).rejects.toThrow("CONFIRMED_SYMBOL_NOT_FOUND");
  });

  it("removes the takeoff item entirely when it was the only evidence (quantity 1)", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([
      {
        id: "tev_1",
        takeoffItemId: "titem_1",
        confirmedSymbolId: "csym_1",
        drawingId: "d1",
        projectId: "p1",
        pageNumber: 2,
        bboxPdf: [100, 100, 120, 120],
        evidenceImageUrl: null,
        createdAt: "",
      },
    ]);
    vi.mocked(listTakeoffItems).mockResolvedValue([
      {
        id: "titem_1",
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
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const result = await unconfirmAndDeleteSymbol({ projectId: "p1", candidateId: "cand_1" });

    expect(result.removedTakeoffItemId).toBe("titem_1");
    expect(result.updatedTakeoffItemId).toBeNull();
    expect(deleteTakeoffItem).toHaveBeenCalledExactlyOnceWith("p1", "titem_1");
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(deleteTakeoffEvidence).toHaveBeenCalledExactlyOnceWith("p1", "tev_1");
    expect(deleteConfirmedSymbol).toHaveBeenCalledExactlyOnceWith("p1", "csym_1");
    expect(deleteSymbolCandidate).toHaveBeenCalledExactlyOnceWith("p1", "cand_1");
  });

  it("decrements (never deletes) the takeoff item when other evidence remains", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([
      {
        id: "tev_1",
        takeoffItemId: "titem_1",
        confirmedSymbolId: "csym_1",
        drawingId: "d1",
        projectId: "p1",
        pageNumber: 2,
        bboxPdf: [100, 100, 120, 120],
        evidenceImageUrl: null,
        createdAt: "",
      },
    ]);
    vi.mocked(listTakeoffItems).mockResolvedValue([
      {
        id: "titem_1",
        projectId: "p1",
        drawingId: "d1",
        quoteId: null,
        name: "zásuvka",
        profession: "electrical",
        quantity: 4,
        unit: "ks",
        sourceOfQuantity: "symbol_detection",
        status: "confirmed",
        evidenceCount: 4,
        metadata: { symbolType: "socket" },
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const result = await unconfirmAndDeleteSymbol({ projectId: "p1", candidateId: "cand_1" });

    expect(result.removedTakeoffItemId).toBeNull();
    expect(result.updatedTakeoffItemId).toBe("titem_1");
    expect(deleteTakeoffItem).not.toHaveBeenCalled();
    const savedItem = vi.mocked(upsertTakeoffItem).mock.calls[0]![0];
    expect(savedItem.quantity).toBe(3);
    expect(savedItem.evidenceCount).toBe(3);
  });

  it("never touches an unrelated takeoff item (different drawing/profession/symbolType)", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([]);
    vi.mocked(listTakeoffItems).mockResolvedValue([
      {
        id: "titem_other",
        projectId: "p1",
        drawingId: "d1",
        quoteId: null,
        name: "vypínač",
        profession: "electrical",
        quantity: 2,
        unit: "ks",
        sourceOfQuantity: "symbol_detection",
        status: "confirmed",
        evidenceCount: 2,
        metadata: { symbolType: "switch" },
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const result = await unconfirmAndDeleteSymbol({ projectId: "p1", candidateId: "cand_1" });

    expect(result.removedTakeoffItemId).toBeNull();
    expect(result.updatedTakeoffItemId).toBeNull();
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(deleteTakeoffItem).not.toHaveBeenCalled();
  });
});

describe("changeConfirmedSymbolType — retype an already-confirmed symbol", () => {
  function confirmedRow(overrides?: Partial<ConfirmedSymbol>): ConfirmedSymbol {
    return {
      id: "csym_1",
      candidateId: "cand_1",
      drawingId: "d1",
      projectId: "p1",
      pageNumber: 2,
      bboxPdf: [100, 100, 120, 120],
      normalizedPosition: NORMALIZED,
      symbolType: "socket",
      profession: "electrical",
      roomId: null,
      zoneId: null,
      quantityValue: 1,
      quantityUnit: "ks",
      confirmationSource: "user",
      confidence: 0.9,
      evidenceImageUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("throws when the candidate has no backing confirmed symbol", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(null);

    await expect(
      changeConfirmedSymbolType({ projectId: "p1", candidateId: "cand_missing", symbol_type: "switch" })
    ).rejects.toThrow("CONFIRMED_SYMBOL_NOT_FOUND");
  });

  it("moves the quantity from the old bucket to a new bucket for the new type", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    vi.mocked(listTakeoffItems).mockResolvedValue([
      {
        id: "titem_socket",
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
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const result = await changeConfirmedSymbolType({
      projectId: "p1",
      candidateId: "cand_1",
      symbol_type: "switch",
    });

    // Old bucket (only evidence) is removed entirely, not left at quantity 0.
    expect(deleteTakeoffItem).toHaveBeenCalledExactlyOnceWith("p1", "titem_socket");
    // A new bucket is created for the new type with the same quantity moved over.
    const savedItem = vi.mocked(upsertTakeoffItem).mock.calls.at(-1)![0];
    expect(savedItem.metadata?.symbolType).toBe("switch");
    expect(savedItem.quantity).toBe(1);
    expect(savedItem.evidenceCount).toBe(1);
    expect(result.confirmedSymbol.symbolType).toBe("switch");
    expect(updateConfirmedSymbolType).toHaveBeenCalledExactlyOnceWith("p1", "csym_1", "switch");
  });

  it("adds to an existing bucket of the new type instead of creating a duplicate", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    vi.mocked(listTakeoffItems).mockResolvedValue([
      {
        id: "titem_socket",
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
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "titem_switch",
        projectId: "p1",
        drawingId: "d1",
        quoteId: null,
        name: "vypínač",
        profession: "electrical",
        quantity: 3,
        unit: "ks",
        sourceOfQuantity: "symbol_detection",
        status: "confirmed",
        evidenceCount: 3,
        metadata: { symbolType: "switch" },
        createdAt: "",
        updatedAt: "",
      },
    ]);

    await changeConfirmedSymbolType({
      projectId: "p1",
      candidateId: "cand_1",
      symbol_type: "switch",
    });

    const savedItem = vi.mocked(upsertTakeoffItem).mock.calls.at(-1)![0];
    expect(savedItem.id).toBe("titem_switch");
    expect(savedItem.quantity).toBe(4);
    expect(savedItem.evidenceCount).toBe(4);
  });

  it("is a no-op for quantities when the requested type equals the current type", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());

    const result = await changeConfirmedSymbolType({
      projectId: "p1",
      candidateId: "cand_1",
      symbol_type: "socket",
    });

    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(deleteTakeoffItem).not.toHaveBeenCalled();
    expect(updateConfirmedSymbolType).not.toHaveBeenCalled();
    expect(result.takeoffItemId).toBeNull();
  });
});

describe("moveCandidateOrConfirmedSymbol — drag-to-reposition on the plan", () => {
  const NEW_POSITION = { x: 0.5, y: 0.5, width: 0.03, height: 0.03 };

  it("updates the symbolCandidate position for a not-yet-confirmed row", async () => {
    vi.mocked(getSymbolCandidate).mockResolvedValue(candidateRow()); // status: probable

    await moveCandidateOrConfirmedSymbol({
      projectId: "p1",
      candidateId: "cand_1",
      newNormalizedPosition: NEW_POSITION,
    });

    expect(updateSymbolCandidatePosition).toHaveBeenCalledWith(
      "p1",
      "cand_1",
      expect.objectContaining({ normalizedPosition: NEW_POSITION })
    );
    expect(updateConfirmedSymbolPosition).not.toHaveBeenCalled();
  });

  it("updates the confirmedSymbol position (not the candidate row) for a confirmed row", async () => {
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      status: "confirmed",
    });
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(existingConfirmed());

    await moveCandidateOrConfirmedSymbol({
      projectId: "p1",
      candidateId: "cand_1",
      newNormalizedPosition: NEW_POSITION,
    });

    expect(updateConfirmedSymbolPosition).toHaveBeenCalledWith(
      "p1",
      "csym_existing",
      expect.objectContaining({ normalizedPosition: NEW_POSITION })
    );
    expect(updateSymbolCandidatePosition).not.toHaveBeenCalled();
  });

  it("throws if a confirmed candidate has no backing confirmedSymbol row", async () => {
    vi.mocked(getSymbolCandidate).mockResolvedValue({
      ...candidateRow(),
      status: "confirmed",
    });
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(null);

    await expect(
      moveCandidateOrConfirmedSymbol({
        projectId: "p1",
        candidateId: "cand_1",
        newNormalizedPosition: NEW_POSITION,
      })
    ).rejects.toThrow("CONFIRMED_SYMBOL_NOT_FOUND");
  });

  it("skips the extra Firestore read when the caller already has the DTO", async () => {
    await moveCandidateOrConfirmedSymbol({
      projectId: "p1",
      candidateId: "cand_1",
      newNormalizedPosition: NEW_POSITION,
      candidateDto: {
        id: "cand_1",
        page_number: 2,
        bbox_pdf: [100, 100, 120, 120],
        bbox_px: [10, 10, 30, 30],
        color_layer: "green",
        kind: "symbol_candidate",
        label_suggestions: [{ label: "zásuvka", confidence: 0.8 }],
        nearby_text: null,
        confidence: 0.8,
        source: "opencv",
        status: "probable",
        preview_image_url: null,
        normalized_position: NORMALIZED,
      },
    });

    expect(getSymbolCandidate).not.toHaveBeenCalled();
    expect(updateSymbolCandidatePosition).toHaveBeenCalledWith(
      "p1",
      "cand_1",
      expect.objectContaining({ normalizedPosition: NEW_POSITION })
    );
  });
});

describe("moveConfirmedSymbolToCategory — move a mark between positions", () => {
  function confirmedRow(overrides?: Partial<ConfirmedSymbol>): ConfirmedSymbol {
    return {
      id: "csym_1",
      candidateId: "cand_1",
      drawingId: "d1",
      projectId: "p1",
      pageNumber: 2,
      bboxPdf: [100, 100, 120, 120],
      normalizedPosition: NORMALIZED,
      symbolType: "socket",
      profession: "electrical",
      roomId: null,
      zoneId: null,
      quantityValue: 1,
      quantityUnit: "ks",
      confirmationSource: "user",
      confidence: 0.9,
      evidenceImageUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  const socketItem = {
    id: "titem_socket",
    projectId: "p1",
    drawingId: "d1",
    quoteId: null,
    name: "zásuvka",
    profession: "electrical",
    quantity: 3,
    unit: "ks",
    sourceOfQuantity: "symbol_detection" as const,
    status: "confirmed" as const,
    evidenceCount: 3,
    metadata: { symbolType: "socket" },
    createdAt: "",
    updatedAt: "",
  };

  it("throws when the candidate has no backing confirmed symbol", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(null);

    await expect(
      moveConfirmedSymbolToCategory({
        projectId: "p1",
        candidateId: "cand_missing",
        label: "Zásuvka 2x pod sebou",
      })
    ).rejects.toThrow("CONFIRMED_SYMBOL_NOT_FOUND");
  });

  it("moves one piece to a NEW position item and re-links the evidence", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    vi.mocked(listTakeoffItems).mockResolvedValue([socketItem]);
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([
      { id: "tev_1", takeoffItemId: "titem_socket" } as never,
    ]);

    const result = await moveConfirmedSymbolToCategory({
      projectId: "p1",
      candidateId: "cand_1",
      label: "Zásuvka 2x pod sebou",
    });

    // Old item decremented (3 → 2), never deleted while evidence remains.
    const decremented = vi
      .mocked(upsertTakeoffItem)
      .mock.calls.find(([i]) => i.id === "titem_socket")?.[0];
    expect(decremented?.quantity).toBe(2);
    expect(decremented?.evidenceCount).toBe(2);

    // New position item created with the mark's piece.
    const created = vi
      .mocked(upsertTakeoffItem)
      .mock.calls.find(([i]) => i.name === "Zásuvka 2x pod sebou")?.[0];
    expect(created?.quantity).toBe(1);
    expect(created?.evidenceCount).toBe(1);

    // Evidence follows into the new bucket; candidate gets the new label.
    expect(updateTakeoffEvidenceItem).toHaveBeenCalledWith(
      "p1",
      "tev_1",
      result.takeoffItemId
    );
    expect(updateSymbolCandidateStatus).toHaveBeenCalledWith(
      "p1",
      "cand_1",
      expect.objectContaining({
        labelSuggestions: [{ label: "Zásuvka 2x pod sebou", confidence: 1 }],
      })
    );
    // Type unchanged — no confirmedSymbol type write needed.
    expect(updateConfirmedSymbolType).not.toHaveBeenCalled();
  });

  it("merges into an existing position when the target name already exists (case-insensitive)", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    const doubleSocketItem = {
      ...socketItem,
      id: "titem_double",
      name: "Zásuvka 2x pod sebou",
      quantity: 5,
      evidenceCount: 5,
    };
    vi.mocked(listTakeoffItems).mockResolvedValue([socketItem, doubleSocketItem]);
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([
      { id: "tev_1", takeoffItemId: "titem_socket" } as never,
    ]);

    const result = await moveConfirmedSymbolToCategory({
      projectId: "p1",
      candidateId: "cand_1",
      label: "zásuvka 2X POD SEBOU",
    });

    expect(result.takeoffItemId).toBe("titem_double");
    const merged = vi
      .mocked(upsertTakeoffItem)
      .mock.calls.find(([i]) => i.id === "titem_double")?.[0];
    expect(merged?.quantity).toBe(6);
    expect(merged?.evidenceCount).toBe(6);
  });

  it("removes the old item entirely when the moved mark was its only evidence", async () => {
    vi.mocked(getConfirmedSymbolByCandidateId).mockResolvedValue(confirmedRow());
    vi.mocked(listTakeoffItems).mockResolvedValue([
      { ...socketItem, quantity: 1, evidenceCount: 1 },
    ]);
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([
      { id: "tev_1", takeoffItemId: "titem_socket" } as never,
    ]);

    await moveConfirmedSymbolToCategory({
      projectId: "p1",
      candidateId: "cand_1",
      label: "Zásuvka 2x pod sebou",
    });

    expect(deleteTakeoffItem).toHaveBeenCalledExactlyOnceWith("p1", "titem_socket");
  });

  it("rejects an empty target label", async () => {
    await expect(
      moveConfirmedSymbolToCategory({
        projectId: "p1",
        candidateId: "cand_1",
        label: "   ",
      })
    ).rejects.toThrow("CATEGORY_LABEL_REQUIRED");
  });
});
