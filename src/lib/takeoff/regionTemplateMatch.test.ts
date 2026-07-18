import { describe, expect, it } from "vitest";
import { matchTemplatesAgainstRegion, type TemplateShapeRef } from "./regionTemplateMatch";
import { colorInkMask, resampleMaskToGrid } from "@/services/takeoff/similarSymbolDetectionService";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";

type Rgb = [number, number, number];
const RED: Rgb = [200, 30, 30];

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

/** Half-circle "socket" stroke — same shape used in similarSymbolDetectionService tests. */
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

function buildTemplateRef(
  templateId: string,
  raster: RasterImage
): TemplateShapeRef {
  const ink = colorInkMask(raster, "red")!;
  return {
    templateId,
    symbolType: "switch",
    colorLayer: "red",
    refShape: resampleMaskToGrid(ink.mask, ink.width, ink.height),
    refPxW: ink.width,
    refPxH: ink.height,
  };
}

describe("matchTemplatesAgainstRegion", () => {
  it("returns a probable template_match candidate for a matching symbol in the region", () => {
    const templateRaster = makeColorRaster(16, 16, (set) => drawSocket(set, 2, 2, RED));
    const template = buildTemplateRef("tmpl_switch_1", templateRaster);

    // Region raster with the SAME shape drawn twice — the template's own
    // pixels plus a second occurrence elsewhere in the crop.
    const regionRaster = makeColorRaster(200, 80, (set) => {
      drawSocket(set, 10, 10, RED);
      drawSocket(set, 100, 40, RED);
    });

    const candidates = matchTemplatesAgainstRegion({
      regionRaster,
      templates: [template],
      regionBboxPx: [50, 40, 200, 80],
      pageWidthPx: 400,
      pageHeightPx: 300,
      pageNumber: 2,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    for (const c of candidates) {
      expect(c.source).toBe("template_match");
      expect(c.color_layer).toBe("red");
      expect(c.kind).toBe("symbol_candidate");
      expect(["candidate", "probable"]).toContain(c.status);
      expect(c.page_number).toBe(2);
      // Page-normalized position must sit inside the region's placement.
      expect(c.normalized_position.x).toBeGreaterThanOrEqual(50 / 400 - 0.01);
      expect(c.normalized_position.y).toBeGreaterThanOrEqual(40 / 300 - 0.01);
    }
    // At least the strong (near-identical) matches are marked probable.
    expect(candidates.some((c) => c.status === "probable")).toBe(true);
  });

  it("never creates confirmedSymbols/takeoffItems/takeoffEvidence — DTOs only", () => {
    const templateRaster = makeColorRaster(16, 16, (set) => drawSocket(set, 2, 2, RED));
    const template = buildTemplateRef("tmpl_switch_1", templateRaster);
    const regionRaster = makeColorRaster(120, 60, (set) => drawSocket(set, 10, 10, RED));

    const candidates = matchTemplatesAgainstRegion({
      regionRaster,
      templates: [template],
      regionBboxPx: [0, 0, 120, 60],
      pageWidthPx: 120,
      pageHeightPx: 60,
      pageNumber: 1,
    });

    expect(candidates.every((c) => c.status !== "confirmed")).toBe(true);
  });

  it("returns no candidates when no template is provided", () => {
    const regionRaster = makeColorRaster(120, 60, (set) => drawSocket(set, 10, 10, RED));
    const candidates = matchTemplatesAgainstRegion({
      regionRaster,
      templates: [],
      regionBboxPx: [0, 0, 120, 60],
      pageWidthPx: 120,
      pageHeightPx: 60,
      pageNumber: 1,
    });
    expect(candidates).toHaveLength(0);
  });
});
