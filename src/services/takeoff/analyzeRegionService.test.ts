/**
 * Analyze Region v2 A1 — wiring test for analyzeDrawingRegion.
 *
 * Verifies the client orchestrator actually loads project symbolTemplates,
 * runs the component matcher against the analyzed region, and merges the
 * result with the raster/color candidates (deduping overlapping detections
 * into "mixed"). Firestore/Storage/OCR are mocked; only the pure raster
 * pipeline runs for real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import type { SymbolTemplate } from "@/types/pdfTakeoff";

vi.mock("@/services/takeoff/pdfTakeoffRegionService", () => ({
  createDrawingRegion: vi.fn(),
  saveSymbolCandidates: vi.fn(),
  updateDrawingRegionStatus: vi.fn(),
  listSymbolTemplatesForProject: vi.fn(),
}));

vi.mock("@/services/takeoff/ocrAdapter", () => ({
  runOcrOnRasterRegion: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/services/takeoff/takeoffImageService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./takeoffImageService")>();
  return {
    ...actual,
    renderPageRaster: vi.fn(),
    createCandidatePreviewImage: vi.fn().mockResolvedValue(null),
    createRegionImage: vi.fn().mockResolvedValue(null),
    loadImageUrlAsRaster: vi.fn(),
  };
});

import { analyzeDrawingRegion } from "./analyzeRegionService";
import {
  createDrawingRegion,
  listSymbolTemplatesForProject,
  saveSymbolCandidates,
} from "@/services/takeoff/pdfTakeoffRegionService";
import {
  loadImageUrlAsRaster,
  renderPageRaster,
} from "@/services/takeoff/takeoffImageService";

type Rgb = [number, number, number];
const GREEN: Rgb = [30, 160, 60];

function makeColorRaster(
  width: number,
  height: number,
  draw: (set: (x: number, y: number, c: Rgb) => void) => void
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  draw((x, y, c) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 4;
    data[o] = c[0];
    data[o + 1] = c[1];
    data[o + 2] = c[2];
  });
  return { width, height, data };
}

/** Half-circle "socket" stroke — same shape used across takeoff matcher tests. */
function drawSocket(set: (x: number, y: number, c: Rgb) => void, ox: number, oy: number, c: Rgb) {
  for (let a = 0; a <= 180; a += 6) {
    const rad = (a * Math.PI) / 180;
    const x = ox + 6 + Math.round(6 * Math.cos(rad));
    const y = oy + 6 - Math.round(6 * Math.sin(rad));
    set(x, y, c);
    set(x, y + 1, c);
  }
  for (let y = oy + 6; y < oy + 12; y++) {
    set(ox + 6, y, c);
    set(ox + 7, y, c);
  }
}

function templateRow(): SymbolTemplate {
  return {
    id: "tmpl_1",
    projectId: "p1",
    companyId: null,
    profession: "electrical",
    symbolType: "socket",
    label: "zásuvka",
    colorLayer: "green",
    templateImageUrl: "https://storage.example/tmpl_1.png",
    maskImageUrl: null,
    createdFromSymbolId: null,
    usageCount: 1,
    createdAt: "",
    updatedAt: "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createDrawingRegion).mockImplementation(async (input) => ({
    id: "reg_1",
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

  // Page raster: two identical green "socket" shapes, far apart.
  const pageRaster = makeColorRaster(300, 200, (set) => {
    drawSocket(set, 20, 20, GREEN);
    drawSocket(set, 220, 140, GREEN);
  });
  vi.mocked(renderPageRaster).mockResolvedValue({
    raster: pageRaster,
    pageWidthPt: pageRaster.width,
    pageHeightPt: pageRaster.height,
  });

  // Isolated template crop: the same socket shape, decoded from its stored URL.
  const templateRaster = makeColorRaster(16, 16, (set) => drawSocket(set, 2, 2, GREEN));
  vi.mocked(loadImageUrlAsRaster).mockResolvedValue(templateRaster);
});

const BASE_PARAMS = {
  projectId: "p1",
  drawingId: "d1",
  fileUrl: "https://example.com/plan.pdf",
  pageNumber: 1,
  normalizedBbox: { x: 0, y: 0, width: 1, height: 1 },
};

describe("analyzeDrawingRegion — Analyze Region v2 A1 template wiring", () => {
  it("merges template matches into the raster candidates (no duplicates) when templates exist", async () => {
    vi.mocked(listSymbolTemplatesForProject).mockResolvedValue([templateRow()]);

    const result = await analyzeDrawingRegion(BASE_PARAMS);

    // Two sockets on the page → two final candidates, not four (raster +
    // template) — the merge step deduped the overlapping detections.
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => c.color_layer === "green")).toBe(true);
    // At least one candidate reflects the template confirmation ("mixed").
    expect(result.candidates.some((c) => c.source === "mixed")).toBe(true);
    expect(result.debug?.templateMatchesBeforeDedupe?.length ?? 0).toBeGreaterThan(0);
    expect(saveSymbolCandidates).toHaveBeenCalledTimes(1);
  });

  it("falls back to raster-only candidates when the project has no templates", async () => {
    vi.mocked(listSymbolTemplatesForProject).mockResolvedValue([]);

    const result = await analyzeDrawingRegion(BASE_PARAMS);

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => c.source === "opencv")).toBe(true);
  });

  it("never leaves confirmed candidates — analyze-region output stays review-only", async () => {
    vi.mocked(listSymbolTemplatesForProject).mockResolvedValue([templateRow()]);

    const result = await analyzeDrawingRegion(BASE_PARAMS);

    expect(result.candidates.every((c) => c.status !== "confirmed")).toBe(true);
  });

  it("proceeds with raster-only candidates when template loading fails", async () => {
    vi.mocked(listSymbolTemplatesForProject).mockRejectedValue(new Error("firestore down"));

    const result = await analyzeDrawingRegion(BASE_PARAMS);

    expect(result.candidates).toHaveLength(2);
    expect(saveSymbolCandidates).toHaveBeenCalledTimes(1);
  });
});
