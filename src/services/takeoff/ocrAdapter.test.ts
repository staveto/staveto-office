/**
 * Phase 3B — OCR adapter contract tests (stub adapter, no tesseract).
 * Also verifies graceful degradation in a Node environment.
 */

import { describe, expect, it } from "vitest";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import {
  remapOcrLinesToPage,
  runOcrOnRasterRegion,
  tesseractOcrAdapter,
  type OcrAdapter,
} from "./ocrAdapter";

function blankRaster(width = 200, height = 100): RasterImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
}

const stubAdapter: OcrAdapter = {
  async recognizeRaster() {
    return {
      fullText: "Zásuvka 230V",
      lines: [
        {
          text: "Zásuvka 230V",
          confidence: 0.92,
          // Center of the region raster.
          bbox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        },
      ],
    };
  },
};

describe("remapOcrLinesToPage", () => {
  it("maps raster-relative bboxes into page-normalized coordinates", () => {
    const region = { x: 0.4, y: 0.2, width: 0.2, height: 0.1 };
    const out = remapOcrLinesToPage(
      {
        fullText: "t",
        lines: [{ text: "t", confidence: 1, bbox: { x: 0.5, y: 0.5, width: 0.25, height: 0.2 } }],
      },
      region
    );
    expect(out.lines[0]!.bbox.x).toBeCloseTo(0.4 + 0.5 * 0.2);
    expect(out.lines[0]!.bbox.y).toBeCloseTo(0.2 + 0.5 * 0.1);
    expect(out.lines[0]!.bbox.width).toBeCloseTo(0.25 * 0.2);
    expect(out.lines[0]!.bbox.height).toBeCloseTo(0.2 * 0.1);
  });
});

describe("runOcrOnRasterRegion", () => {
  it("returns page-normalized lines from the injected adapter", async () => {
    const region = { x: 0.5, y: 0.5, width: 0.25, height: 0.25 };
    const result = await runOcrOnRasterRegion({
      pageRaster: blankRaster(400, 400),
      regionOnPage: region,
      adapter: stubAdapter,
    });
    expect(result).not.toBeNull();
    expect(result!.fullText).toBe("Zásuvka 230V");
    const b = result!.lines[0]!.bbox;
    // Region center → page-normalized center of the region.
    expect(b.x).toBeCloseTo(0.5 + 0.25 * 0.25);
    expect(b.y).toBeCloseTo(0.5 + 0.25 * 0.25);
  });

  it("returns null when the adapter fails", async () => {
    const failing: OcrAdapter = {
      async recognizeRaster() {
        return null;
      },
    };
    const result = await runOcrOnRasterRegion({
      pageRaster: blankRaster(),
      regionOnPage: { x: 0, y: 0, width: 1, height: 1 },
      adapter: failing,
    });
    expect(result).toBeNull();
  });
});

describe("tesseractOcrAdapter (Node)", () => {
  it("degrades to null without DOM — candidates stay valid upstream", async () => {
    const result = await tesseractOcrAdapter.recognizeRaster(blankRaster());
    expect(result).toBeNull();
  });
});
