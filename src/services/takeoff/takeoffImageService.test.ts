/**
 * Phase 2.5 resilience — image generation must degrade gracefully so a failed
 * crop/upload never blocks confirmation. In the node test environment there is
 * no DOM canvas and no configured Firebase Storage, which is exactly the
 * "generation fails" scenario: every helper must return null, not throw.
 */

import { describe, expect, it } from "vitest";
import {
  createCandidatePreviewImage,
  createEvidenceImage,
  createTemplateImage,
  cropRaster,
  rasterToPngBlob,
  renderPdfRegionToPng,
  uploadTakeoffImage,
} from "./takeoffImageService";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";

function raster(width: number, height: number): RasterImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
}

describe("takeoffImageService graceful degradation (no DOM / no Storage)", () => {
  it("rasterToPngBlob returns null instead of throwing", async () => {
    await expect(rasterToPngBlob(raster(10, 10))).resolves.toBeNull();
  });

  it("uploadTakeoffImage returns null when Storage is not configured", async () => {
    await expect(
      uploadTakeoffImage({
        projectId: "p1",
        drawingId: "d1",
        kind: "evidence",
        id: "csym_1",
        blob: new Blob(["x"], { type: "image/png" }),
      })
    ).resolves.toBeNull();
  });

  it("uploadTakeoffImage rejects unsafe ids without writing", async () => {
    await expect(
      uploadTakeoffImage({
        projectId: "p1",
        drawingId: "d1",
        kind: "evidence",
        id: "../../escape",
        blob: new Blob(["x"], { type: "image/png" }),
      })
    ).resolves.toBeNull();
  });

  it("createCandidatePreviewImage returns null (confirm/analyze keep working)", async () => {
    await expect(
      createCandidatePreviewImage({
        projectId: "p1",
        drawingId: "d1",
        candidateId: "cand_1",
        pageRaster: raster(100, 100),
        normalizedPosition: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 },
      })
    ).resolves.toBeNull();
  });

  it("createEvidenceImage / createTemplateImage / renderPdfRegionToPng return null", async () => {
    const common = {
      projectId: "p1",
      drawingId: "d1",
      fileUrl: "https://example.com/plan.pdf",
      pageNumber: 1,
      normalizedPosition: { x: 0.1, y: 0.1, width: 0.05, height: 0.05 },
    };
    await expect(
      createEvidenceImage({ ...common, confirmedSymbolId: "csym_1" })
    ).resolves.toBeNull();
    await expect(
      createTemplateImage({ ...common, templateId: "tmpl_1" })
    ).resolves.toBeNull();
    await expect(
      renderPdfRegionToPng({
        fileUrl: common.fileUrl,
        pageNumber: 1,
        normalizedRect: common.normalizedPosition,
      })
    ).resolves.toBeNull();
  });

  it("cropRaster clamps to image bounds and never returns empty crops", () => {
    const img = raster(50, 40);
    const crop = cropRaster(img, [-10, -10, 100, 100]);
    expect(crop.width).toBe(50);
    expect(crop.height).toBe(40);
    const tiny = cropRaster(img, [49.5, 39.5, 49.6, 39.6]);
    expect(tiny.width).toBeGreaterThanOrEqual(1);
    expect(tiny.height).toBeGreaterThanOrEqual(1);
  });
});
