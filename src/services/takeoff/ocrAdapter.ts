/**
 * Phase 3B — OCR adapter for nearby-text context on symbol candidates.
 *
 * Default implementation uses tesseract.js in the browser (worker + language
 * data load lazily on first use and are cached for the session). Everything
 * is best-effort: any failure returns null and candidates stay valid with
 * nearby_text = null.
 *
 * OCR is CONTEXT ONLY — this module never writes Firestore and never touches
 * quantities, confirmedSymbols or takeoffEvidence.
 */

import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import type { OcrRegionResult, OcrTextLine } from "@/lib/takeoff/ocrNearbyText";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type { BBoxPdf } from "@/types/pdfTakeoff";
import { bboxPdfToNormalizedRect } from "@/lib/takeoff/regionAnalyzer";
import { cropRaster, renderPageRaster } from "@/services/takeoff/takeoffImageService";

export type OcrAdapter = {
  /**
   * Recognize text on an RGBA raster. Returned line bboxes are normalized
   * (0..1) RELATIVE TO THE GIVEN RASTER.
   */
  recognizeRaster(
    raster: RasterImage,
    opts?: { languageHints?: string[] }
  ): Promise<OcrRegionResult | null>;
};

// ---------------------------------------------------------------------------
// tesseract.js implementation (browser only)
// ---------------------------------------------------------------------------

/** Minimal structural types for the tesseract.js v6/v7 output we consume. */
type TessLine = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
type TessBlock = { paragraphs?: Array<{ lines?: TessLine[] }> };
type TessData = { text?: string; lines?: TessLine[]; blocks?: TessBlock[] | null };
type TessWorker = {
  recognize: (
    image: unknown,
    options?: Record<string, unknown>,
    output?: Record<string, unknown>
  ) => Promise<{ data: TessData }>;
};

let workerPromise: Promise<TessWorker | null> | null = null;
let workerLangKey = "";

async function getTesseractWorker(languageHints?: string[]): Promise<TessWorker | null> {
  if (typeof document === "undefined") return null;
  const langs = languageHints?.length ? languageHints : ["eng"];
  const key = langs.join("+");
  if (!workerPromise || workerLangKey !== key) {
    workerLangKey = key;
    workerPromise = (async () => {
      try {
        const { createWorker } = await import("tesseract.js");
        return (await createWorker(langs)) as unknown as TessWorker;
      } catch {
        return null;
      }
    })();
  }
  return workerPromise;
}

function rasterToCanvas(raster: RasterImage): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height),
    0,
    0
  );
  return canvas;
}

/** Flatten v6/v7 blocks (or legacy data.lines) into a single line list. */
function collectLines(data: TessData): TessLine[] {
  if (Array.isArray(data.lines) && data.lines.length > 0) return data.lines;
  const out: TessLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) out.push(line);
    }
  }
  return out;
}

export const tesseractOcrAdapter: OcrAdapter = {
  async recognizeRaster(raster, opts) {
    try {
      const worker = await getTesseractWorker(opts?.languageHints);
      if (!worker) return null;
      const canvas = rasterToCanvas(raster);
      if (!canvas) return null;
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const lines: OcrTextLine[] = collectLines(data)
        .filter((l) => l.text.trim().length > 0)
        .map((l) => ({
          text: l.text.trim(),
          confidence: Math.max(0, Math.min(1, (l.confidence ?? 0) / 100)),
          bbox: {
            x: l.bbox.x0 / raster.width,
            y: l.bbox.y0 / raster.height,
            width: Math.max(0, (l.bbox.x1 - l.bbox.x0) / raster.width),
            height: Math.max(0, (l.bbox.y1 - l.bbox.y0) / raster.height),
          },
        }));
      return { fullText: (data.text ?? "").trim(), lines };
    } catch (err) {
      console.warn("[ocrAdapter] recognize failed", err);
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Region-level entry point (spec contract)
// ---------------------------------------------------------------------------

/** Map raster-relative line bboxes into page-normalized coordinates. */
export function remapOcrLinesToPage(
  result: OcrRegionResult,
  regionOnPage: NormalizedRect
): OcrRegionResult {
  return {
    fullText: result.fullText,
    lines: result.lines.map((l) => ({
      ...l,
      bbox: {
        x: regionOnPage.x + l.bbox.x * regionOnPage.width,
        y: regionOnPage.y + l.bbox.y * regionOnPage.height,
        width: l.bbox.width * regionOnPage.width,
        height: l.bbox.height * regionOnPage.height,
      },
    })),
  };
}

export type RunOcrOnRegionParams = {
  projectId: string;
  drawingId: string;
  /** Resolved download URL of the drawing PDF. */
  fileUrl: string;
  pageNumber: number;
  /** Region in PDF points; alternatively pass normalizedBbox directly. */
  bboxPdf?: BBoxPdf;
  normalizedBbox?: NormalizedRect;
  languageHints?: string[];
  adapter?: OcrAdapter;
};

/**
 * OCR one region of a drawing page. Renders the page, crops the region and
 * returns text lines in page-normalized coordinates. Null on any failure.
 */
export async function runOcrOnRegion(
  params: RunOcrOnRegionParams
): Promise<OcrRegionResult | null> {
  const adapter = params.adapter ?? tesseractOcrAdapter;
  try {
    const rendered = await renderPageRaster(params.fileUrl, params.pageNumber, 2200);
    if (!rendered) return null;
    const { raster, pageWidthPt, pageHeightPt } = rendered;
    const normalized =
      params.normalizedBbox ??
      (params.bboxPdf
        ? bboxPdfToNormalizedRect(params.bboxPdf, pageWidthPt, pageHeightPt)
        : { x: 0, y: 0, width: 1, height: 1 });
    const regionRaster = cropRaster(raster, [
      normalized.x * raster.width,
      normalized.y * raster.height,
      (normalized.x + normalized.width) * raster.width,
      (normalized.y + normalized.height) * raster.height,
    ]);
    const result = await adapter.recognizeRaster(regionRaster, {
      languageHints: params.languageHints,
    });
    if (!result) return null;
    return remapOcrLinesToPage(result, normalized);
  } catch (err) {
    console.warn("[ocrAdapter] runOcrOnRegion failed", err);
    return null;
  }
}

/**
 * OCR an already-rendered raster region (client flows that hold the page
 * raster avoid a second render). Lines come back page-normalized.
 */
export async function runOcrOnRasterRegion(params: {
  pageRaster: RasterImage;
  regionOnPage: NormalizedRect;
  languageHints?: string[];
  adapter?: OcrAdapter;
}): Promise<OcrRegionResult | null> {
  const adapter = params.adapter ?? tesseractOcrAdapter;
  try {
    const { pageRaster, regionOnPage } = params;
    const regionRaster = cropRaster(pageRaster, [
      regionOnPage.x * pageRaster.width,
      regionOnPage.y * pageRaster.height,
      (regionOnPage.x + regionOnPage.width) * pageRaster.width,
      (regionOnPage.y + regionOnPage.height) * pageRaster.height,
    ]);
    const result = await adapter.recognizeRaster(regionRaster, {
      languageHints: params.languageHints,
    });
    if (!result) return null;
    return remapOcrLinesToPage(result, regionOnPage);
  } catch (err) {
    console.warn("[ocrAdapter] runOcrOnRasterRegion failed", err);
    return null;
  }
}
