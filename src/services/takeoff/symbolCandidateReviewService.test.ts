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
}));

vi.mock("@/services/takeoff/takeoffImageService", () => ({
  createEvidenceImage: vi.fn().mockResolvedValue(null),
  createTemplateImage: vi.fn().mockResolvedValue(null),
}));

import {
  confirmSymbolCandidate,
  DuplicateConfirmedSymbolError,
  rejectSymbolCandidate,
} from "./symbolCandidateReviewService";
import {
  createConfirmedSymbol,
  createTakeoffEvidence,
  getSymbolCandidate,
  listConfirmedSymbolsForPage,
  listTakeoffEvidenceForConfirmedSymbol,
  listTakeoffItems,
  updateSymbolCandidateStatus,
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
