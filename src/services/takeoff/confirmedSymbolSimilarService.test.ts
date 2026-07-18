/**
 * Phase 3A safety — findSimilarForConfirmedSymbol must only create
 * review candidates: no confirmedSymbols, no takeoffItems, no takeoffEvidence.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmedSymbol } from "@/types/pdfTakeoff";

vi.mock("@/services/takeoff/pdfTakeoffRegionService", () => ({
  getConfirmedSymbol: vi.fn(),
  listConfirmedSymbolsForDrawing: vi.fn(),
  listSymbolCandidatesForDrawing: vi.fn(),
  saveSymbolCandidates: vi.fn(),
  createConfirmedSymbol: vi.fn(),
  upsertTakeoffItem: vi.fn(),
  createTakeoffEvidence: vi.fn(),
}));

vi.mock("@/services/takeoff/similarSymbolDetectionService", () => ({
  findSimilarSymbols: vi.fn(),
}));

vi.mock("@/services/takeoff/takeoffImageService", () => ({
  renderPageRaster: vi.fn().mockResolvedValue(null),
  createCandidatePreviewImage: vi.fn().mockResolvedValue(null),
  cropRaster: vi.fn(),
}));

import { findSimilarForCandidate, findSimilarForConfirmedSymbol } from "./confirmedSymbolSimilarService";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";
import {
  createConfirmedSymbol,
  createTakeoffEvidence,
  getConfirmedSymbol,
  listConfirmedSymbolsForDrawing,
  listSymbolCandidatesForDrawing,
  saveSymbolCandidates,
  upsertTakeoffItem,
} from "@/services/takeoff/pdfTakeoffRegionService";
import { findSimilarSymbols } from "@/services/takeoff/similarSymbolDetectionService";

function confirmedSymbol(): ConfirmedSymbol {
  return {
    id: "csym_src",
    candidateId: "cand_0",
    drawingId: "d1",
    projectId: "p1",
    pageNumber: 1,
    bboxPdf: [80, 80, 100, 100],
    normalizedPosition: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
    symbolType: "socket",
    profession: "electrical",
    roomId: null,
    zoneId: null,
    quantityValue: 1,
    quantityUnit: "ks",
    confirmationSource: "user",
    confidence: 0.9,
    evidenceImageUrl: null,
    createdAt: "",
    updatedAt: "",
  };
}

const PARAMS = {
  projectId: "p1",
  drawingId: "d1",
  symbolId: "csym_src",
  fileUrl: "https://example.com/plan.pdf",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getConfirmedSymbol).mockResolvedValue(confirmedSymbol());
  vi.mocked(listConfirmedSymbolsForDrawing).mockResolvedValue([confirmedSymbol()]);
  vi.mocked(listSymbolCandidatesForDrawing).mockResolvedValue([]);
  vi.mocked(saveSymbolCandidates).mockImplementation(async () => []);
  vi.mocked(findSimilarSymbols).mockResolvedValue({
    candidates: [
      {
        pageNumber: 1,
        matchScore: 0.9,
        normalizedPosition: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
      },
      {
        pageNumber: 1,
        matchScore: 0.85,
        normalizedPosition: { x: 0.6, y: 0.6, width: 0.02, height: 0.02 },
      },
    ],
    pagesScanned: 1,
  });
});

describe("findSimilarForConfirmedSymbol", () => {
  it("returns probable template_match candidates and persists them for review", async () => {
    const result = await findSimilarForConfirmedSymbol(PARAMS);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => c.status === "probable")).toBe(true);
    expect(result.candidates.every((c) => c.source === "template_match")).toBe(true);
    expect(saveSymbolCandidates).toHaveBeenCalledTimes(1);
    // Persisted without a region (template-match origin), on the right page.
    expect(vi.mocked(saveSymbolCandidates).mock.calls[0]!.slice(0, 4)).toEqual([
      "p1",
      null,
      "d1",
      1,
    ]);
  });

  it("never creates confirmedSymbols, takeoffItems or takeoffEvidence", async () => {
    await findSimilarForConfirmedSymbol(PARAMS);

    expect(createConfirmedSymbol).not.toHaveBeenCalled();
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(createTakeoffEvidence).not.toHaveBeenCalled();
  });

  it("excludes matches overlapping existing confirmed symbols", async () => {
    vi.mocked(listConfirmedSymbolsForDrawing).mockResolvedValue([
      confirmedSymbol(),
      {
        ...confirmedSymbol(),
        id: "csym_other",
        normalizedPosition: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
      },
    ]);

    const result = await findSimilarForConfirmedSymbol(PARAMS);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.normalized_position.x).toBeCloseTo(0.6);
  });

  it("uses drawing scope via scanAllPages", async () => {
    await findSimilarForConfirmedSymbol({ ...PARAMS, scope: "drawing" });
    expect(vi.mocked(findSimilarSymbols).mock.calls[0]![0].scanAllPages).toBe(true);
  });

  it("reports symbol_not_found without matching or writes", async () => {
    vi.mocked(getConfirmedSymbol).mockResolvedValue(null);

    const result = await findSimilarForConfirmedSymbol(PARAMS);

    expect(result.unavailableReason).toBe("symbol_not_found");
    expect(findSimilarSymbols).not.toHaveBeenCalled();
    expect(saveSymbolCandidates).not.toHaveBeenCalled();
  });

  it("does not persist anything when matching finds nothing new", async () => {
    vi.mocked(findSimilarSymbols).mockResolvedValue({
      candidates: [],
      pagesScanned: 1,
    });

    const result = await findSimilarForConfirmedSymbol(PARAMS);

    expect(result.candidates).toHaveLength(0);
    expect(saveSymbolCandidates).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// findSimilarForCandidate — same pipeline, but from a PENDING (unconfirmed)
// candidate. A manual/single mark must be able to search for the same
// symbol elsewhere WITHOUT first being confirmed.
// ---------------------------------------------------------------------------

function pendingCandidate(): AnalyzeRegionCandidateDto {
  return {
    id: "cand_pending_1",
    page_number: 1,
    bbox_pdf: [80, 80, 100, 100],
    bbox_px: [0, 0, 0, 0],
    color_layer: "orange",
    kind: "symbol_candidate",
    label_suggestions: [{ label: "svetlo", confidence: 0.9 }],
    nearby_text: null,
    confidence: 0.9,
    source: "manual",
    status: "probable",
    preview_image_url: null,
    normalized_position: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
  };
}

describe("findSimilarForCandidate", () => {
  it("finds similar candidates from a pending candidate without requiring confirmation first", async () => {
    const result = await findSimilarForCandidate({
      projectId: "p1",
      drawingId: "d1",
      candidate: pendingCandidate(),
      fileUrl: "https://example.com/plan.pdf",
    });

    expect(getConfirmedSymbol).not.toHaveBeenCalled();
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => c.status === "probable")).toBe(true);
    expect(result.candidates.every((c) => c.color_layer === "orange")).toBe(true);
    expect(saveSymbolCandidates).toHaveBeenCalledTimes(1);
  });

  it("never creates confirmedSymbols, takeoffItems or takeoffEvidence", async () => {
    await findSimilarForCandidate({
      projectId: "p1",
      drawingId: "d1",
      candidate: pendingCandidate(),
      fileUrl: "https://example.com/plan.pdf",
    });

    expect(createConfirmedSymbol).not.toHaveBeenCalled();
    expect(upsertTakeoffItem).not.toHaveBeenCalled();
    expect(createTakeoffEvidence).not.toHaveBeenCalled();
  });

  it("excludes matches overlapping the reference candidate itself", async () => {
    vi.mocked(listSymbolCandidatesForDrawing).mockResolvedValue([pendingCandidate()]);
    vi.mocked(findSimilarSymbols).mockResolvedValue({
      candidates: [
        // Overlaps the reference candidate's own bbox — must be excluded.
        { pageNumber: 1, matchScore: 0.95, normalizedPosition: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 } },
        { pageNumber: 1, matchScore: 0.9, normalizedPosition: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 } },
      ],
      pagesScanned: 1,
    });

    const result = await findSimilarForCandidate({
      projectId: "p1",
      drawingId: "d1",
      candidate: pendingCandidate(),
      fileUrl: "https://example.com/plan.pdf",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.normalized_position.x).toBeCloseTo(0.4);
  });

  it("uses drawing scope via scanAllPages", async () => {
    await findSimilarForCandidate({
      projectId: "p1",
      drawingId: "d1",
      candidate: pendingCandidate(),
      fileUrl: "https://example.com/plan.pdf",
      scope: "drawing",
    });
    expect(vi.mocked(findSimilarSymbols).mock.calls[0]![0].scanAllPages).toBe(true);
  });

  it("reports reference_too_small when the candidate has no position/page", async () => {
    const result = await findSimilarForCandidate({
      projectId: "p1",
      drawingId: "d1",
      candidate: { ...pendingCandidate(), page_number: undefined },
      fileUrl: "https://example.com/plan.pdf",
    });

    expect(result.unavailableReason).toBe("reference_too_small");
    expect(findSimilarSymbols).not.toHaveBeenCalled();
    expect(saveSymbolCandidates).not.toHaveBeenCalled();
  });
});
