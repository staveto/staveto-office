/**
 * "Skenovať AI (Gemini)" whole-page vision scan — wiring test.
 *
 * Verifies: Gemini detections map to review-only symbolCandidates
 * (source: "gemini"), duplicates of already-known items are skipped and
 * never re-saved, confirmed/rejected rows are never created or touched,
 * and PDF render / AI call failures surface as AiScanUnavailableError
 * without ever saving anything.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import type { AiDetectedSymbol } from "@/lib/ai/aiSymbolDetection";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";

vi.mock("@/services/takeoff/pdfTakeoffRegionService", () => ({
  createDrawingRegion: vi.fn(),
  saveSymbolCandidates: vi.fn(),
  updateDrawingRegionStatus: vi.fn(),
}));

vi.mock("@/services/takeoff/takeoffImageService", () => ({
  renderPageRaster: vi.fn(),
}));

vi.mock("@/services/ai/detectPlanSymbolsService", () => ({
  detectAllSymbolsOnCanvas: vi.fn(),
  detectSymbolAtCanvasPoint: vi.fn(),
}));

vi.mock("@/services/takeoff/ocrAdapter", () => ({
  runOcrOnRasterRegion: vi.fn(),
}));

import {
  createDrawingRegion,
  saveSymbolCandidates,
  updateDrawingRegionStatus,
} from "@/services/takeoff/pdfTakeoffRegionService";
import { renderPageRaster } from "@/services/takeoff/takeoffImageService";
import {
  detectAllSymbolsOnCanvas,
  detectSymbolAtCanvasPoint,
} from "@/services/ai/detectPlanSymbolsService";
import { runOcrOnRasterRegion } from "@/services/takeoff/ocrAdapter";
import {
  AiScanUnavailableError,
  identifySymbolWithAi,
  scanWholeDrawingPageWithAi,
} from "./aiSymbolScanService";

function fakeRaster(width = 300, height = 200): RasterImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
}

function detection(overrides: Partial<AiDetectedSymbol> = {}): AiDetectedSymbol {
  return {
    bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
    name: "svetlo",
    category: "lighting",
    confidence: "high",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDrawingRegion).mockImplementation(async (input) => ({
    id: "reg_ai_1",
    projectId: input.projectId,
    drawingId: input.drawingId,
    pageNumber: input.pageNumber,
    bboxPdf: input.bboxPdf,
    normalizedBbox: input.normalizedBbox,
    profession: input.profession,
    status: input.status ?? "pending",
    createdAt: "",
    updatedAt: "",
  }));
  vi.mocked(saveSymbolCandidates).mockImplementation(async () => []);
  vi.mocked(updateDrawingRegionStatus).mockResolvedValue(undefined);
  vi.mocked(renderPageRaster).mockResolvedValue({
    raster: fakeRaster(),
    pageWidthPt: 300,
    pageHeightPt: 200,
  });
  // No OCR available by default (matches Node test env / OCR failure) — most
  // tests care about detection mapping/dedupe, not the text-overlap guard.
  vi.mocked(runOcrOnRasterRegion).mockResolvedValue(null);
});

const BASE_PARAMS = {
  projectId: "p1",
  drawingId: "d1",
  fileUrl: "https://example.com/plan.pdf",
  pageNumber: 1,
};

describe("scanWholeDrawingPageWithAi", () => {
  it("maps Gemini detections to review-only symbolCandidates (source: gemini, never confirmed)", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([detection()]);

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.source).toBe("gemini");
    expect(result.candidates[0]!.status).not.toBe("confirmed");
    expect(["candidate", "probable"]).toContain(result.candidates[0]!.status);
    expect(saveSymbolCandidates).toHaveBeenCalledTimes(1);
    expect(updateDrawingRegionStatus).toHaveBeenCalledWith("p1", "reg_ai_1", "analyzed");
  });

  it("skips a Gemini detection that overlaps an already-known candidate on the same page", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([
      detection({ bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 } }),
    ]);
    const existing: AnalyzeRegionCandidateDto[] = [
      {
        id: "cand_existing",
        page_number: 1,
        bbox_pdf: [0, 0, 1, 1],
        bbox_px: [0, 0, 0, 0],
        color_layer: "orange",
        kind: "symbol_candidate",
        label_suggestions: [{ label: "svetlo", confidence: 0.9 }],
        nearby_text: null,
        confidence: 0.9,
        source: "opencv",
        status: "probable",
        preview_image_url: null,
        // Same spot as the Gemini detection above → should be treated as a duplicate.
        normalized_position: { x: 0.101, y: 0.101, width: 0.02, height: 0.02 },
      },
    ];

    const result = await scanWholeDrawingPageWithAi({
      ...BASE_PARAMS,
      existingCandidates: existing,
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.duplicates_skipped).toBe(1);
    expect(result.detections_found).toBe(1);
    // Nothing new to save — never writes an empty save call needlessly.
    expect(saveSymbolCandidates).not.toHaveBeenCalled();
    expect(updateDrawingRegionStatus).toHaveBeenCalledWith("p1", "reg_ai_1", "analyzed");
  });

  it("dedupes two Gemini detections that overlap each other, keeping only one", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([
      detection({ bbox: { x: 0.3, y: 0.3, width: 0.02, height: 0.02 }, confidence: "high" }),
      detection({ bbox: { x: 0.301, y: 0.301, width: 0.02, height: 0.02 }, confidence: "medium" }),
    ]);

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    expect(result.candidates).toHaveLength(1);
    expect(result.duplicates_skipped).toBe(1);
  });

  it("does not skip two genuinely separate detections far apart on the page", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([
      detection({ bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 } }),
      detection({ bbox: { x: 0.8, y: 0.8, width: 0.02, height: 0.02 } }),
    ]);

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    expect(result.candidates).toHaveLength(2);
    expect(result.duplicates_skipped).toBe(0);
  });

  it("maps low-confidence Gemini detections to status 'candidate', not 'probable'", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([detection({ confidence: "low" })]);

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    expect(result.candidates[0]!.status).toBe("candidate");
  });

  it("throws AiScanUnavailableError('pdf_render_failed') and never saves when the page fails to render", async () => {
    vi.mocked(renderPageRaster).mockResolvedValue(null);

    await expect(scanWholeDrawingPageWithAi(BASE_PARAMS)).rejects.toThrow(AiScanUnavailableError);
    expect(saveSymbolCandidates).not.toHaveBeenCalled();
    expect(createDrawingRegion).not.toHaveBeenCalled();
  });

  it("throws AiScanUnavailableError('ai_call_failed'), marks the region failed, and never saves when Gemini errors", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockRejectedValue(new Error("quota exceeded"));

    await expect(scanWholeDrawingPageWithAi(BASE_PARAMS)).rejects.toThrow(AiScanUnavailableError);
    expect(saveSymbolCandidates).not.toHaveBeenCalled();
    expect(updateDrawingRegionStatus).toHaveBeenCalledWith("p1", "reg_ai_1", "failed");
  });

  it("passes the requested language through to detectAllSymbolsOnCanvas", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([]);

    await scanWholeDrawingPageWithAi({ ...BASE_PARAMS, language: "en" });

    expect(detectAllSymbolsOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en" })
    );
  });

  // --- "found the legend as numbers" regression coverage -------------------

  it("drops a wide, short box (legend/schedule text row) even though Gemini labeled it as a symbol", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([
      // A real light symbol...
      detection({ bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 } }),
      // ...and a much-wider-than-tall box, the shape of a text line like
      // "04  Visiace svietidlo" rather than a compact drawn icon.
      detection({
        bbox: { x: 0.4, y: 0.4, width: 0.18, height: 0.015 },
        name: "Visiace svietidlo",
      }),
    ]);

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.normalized_position.x).toBeCloseTo(0.1);
    expect(result.text_like_filtered).toBe(1);
  });

  it("keeps an elongated 'led_strip' detection despite its wide aspect ratio", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([
      detection({
        bbox: { x: 0.2, y: 0.5, width: 0.25, height: 0.01 },
        category: "led_strip",
        name: "LED pás",
      }),
    ]);

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    expect(result.candidates).toHaveLength(1);
    expect(result.text_like_filtered).toBe(0);
  });

  it("drops a detection that OCR shows sits mostly inside a real recognized legend description", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([
      detection({ bbox: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 } }), // real symbol, kept
      detection({ bbox: { x: 0.6, y: 0.6, width: 0.03, height: 0.03 }, name: "Visiace svietidlo" }),
    ]);
    vi.mocked(runOcrOnRasterRegion).mockResolvedValue({
      fullText: "Visiace svietidlo",
      lines: [
        {
          text: "Visiace svietidlo",
          confidence: 0.9,
          bbox: { x: 0.6, y: 0.6, width: 0.03, height: 0.03 },
        },
      ],
    });

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.normalized_position.x).toBeCloseTo(0.1);
    expect(result.text_like_filtered).toBe(1);
  });

  it("leaves a bare-digit OCR line (no letters) to the geometric/prompt guards, not the text-overlap guard", async () => {
    vi.mocked(detectAllSymbolsOnCanvas).mockResolvedValue([
      detection({ bbox: { x: 0.6, y: 0.6, width: 0.03, height: 0.03 }, name: "16" }),
    ]);
    vi.mocked(runOcrOnRasterRegion).mockResolvedValue({
      fullText: "16",
      lines: [{ text: "16", confidence: 0.9, bbox: { x: 0.6, y: 0.6, width: 0.03, height: 0.03 } }],
    });

    const result = await scanWholeDrawingPageWithAi(BASE_PARAMS);

    // Square box, no letters in the overlapping OCR line → the text-overlap
    // guard alone does not remove it (bare index numbers next to a real
    // icon are handled by the Gemini prompt itself, which is told never to
    // box a number on its own).
    expect(result.candidates).toHaveLength(1);
    expect(result.text_like_filtered).toBe(0);
  });
});

describe("identifySymbolWithAi", () => {
  const IDENTIFY_PARAMS = {
    fileUrl: "https://example.com/plan.pdf",
    pageNumber: 1,
    normalizedPosition: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
  };

  it("asks click-mode detection at the mark's center and returns name/category/confidence", async () => {
    vi.mocked(detectSymbolAtCanvasPoint).mockResolvedValue({
      bbox: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
      name: "Sériový vypínač",
      category: "switch",
      confidence: "high",
    });

    const result = await identifySymbolWithAi(IDENTIFY_PARAMS);

    expect(result).toEqual({
      name: "Sériový vypínač",
      category: "switch",
      confidence: "high",
      // AI's tight bbox of the whole symbol — used by identify-before-marking
      // to create a correctly-sized mark.
      normalizedPosition: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
    });
    // Raster is 300x200 (fakeRaster) → mark center (0.41, 0.41) in canvas px.
    expect(detectSymbolAtCanvasPoint).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(detectSymbolAtCanvasPoint).mock.calls[0]![0];
    expect(callArg.clickCanvasPx.x).toBeCloseTo(0.41 * 300, 6);
    expect(callArg.clickCanvasPx.y).toBeCloseTo(0.41 * 200, 6);
    expect(callArg.language).toBe("sk");
    // Read-only: identification never persists anything.
    expect(saveSymbolCandidates).not.toHaveBeenCalled();
    expect(createDrawingRegion).not.toHaveBeenCalled();
  });

  it("returns null when the model sees no symbol near the mark", async () => {
    vi.mocked(detectSymbolAtCanvasPoint).mockResolvedValue(null);

    await expect(identifySymbolWithAi(IDENTIFY_PARAMS)).resolves.toBeNull();
  });

  it("throws AiScanUnavailableError when the page fails to render", async () => {
    vi.mocked(renderPageRaster).mockResolvedValue(null);

    await expect(identifySymbolWithAi(IDENTIFY_PARAMS)).rejects.toThrow(AiScanUnavailableError);
    expect(detectSymbolAtCanvasPoint).not.toHaveBeenCalled();
  });

  it("throws AiScanUnavailableError when the AI call fails", async () => {
    vi.mocked(detectSymbolAtCanvasPoint).mockRejectedValue(new Error("quota exceeded"));

    await expect(identifySymbolWithAi(IDENTIFY_PARAMS)).rejects.toThrow(AiScanUnavailableError);
  });
});
