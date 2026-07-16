/**
 * "Find similar symbols" — client-side template matching on a PDF.
 *
 * Reuses the existing normalized cross-correlation matcher from
 * visualSymbolCounter. The reference bbox (normalized 0..1) is cropped from
 * an offscreen render of the page and matched across the page (or all pages).
 *
 * Results are candidates by default; the estimator UI may auto-confirm them
 * when the user asks to bump quantity immediately.
 */

import {
  classifyPixelColor,
  detectSymbolsByColor,
  matchVisualTemplate,
  bboxIoU,
  type RasterImage,
} from "@/lib/ai/visualSymbolCounter";
import type { VisualColorHint, VisualSymbolTemplate } from "@/types/visualSymbols";
import type { NormalizedRect } from "@/types/drawingTakeoff";

export type SimilarSymbolCandidate = {
  /** Normalized (0..1) position on the page. */
  normalizedPosition: NormalizedRect;
  pageNumber: number;
  /** NCC score 0..1. */
  matchScore: number;
};

export type FindSimilarSymbolsParams = {
  projectId: string;
  drawingId: string;
  /** Resolved download URL of the PDF. */
  fileUrl: string;
  pageNumber: number;
  /** Normalized (0..1) bbox of the reference symbol. */
  referenceBbox: NormalizedRect;
  /** NCC threshold 0..1 (default 0.78). */
  threshold?: number;
  /**
   * When true, scan every page of the PDF with the same reference template.
   * Default false (single page) for takeoff compatibility.
   */
  scanAllPages?: boolean;
};

export type FindSimilarSymbolsResult = {
  candidates: SimilarSymbolCandidate[];
  /** Pages that were actually scanned. */
  pagesScanned?: number;
  /** Set when matching could not run — manual flow must continue. */
  unavailableReason?: "no_dom" | "render_failed" | "reference_too_small";
};

// ---------------------------------------------------------------------------
// Pure raster helpers (testable without DOM)
// ---------------------------------------------------------------------------

export function cropRaster(image: RasterImage, rect: NormalizedRect): RasterImage {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const w = Math.min(image.width - x0, Math.max(1, Math.round(rect.width)));
  const h = Math.min(image.height - y0, Math.max(1, Math.round(rect.height)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * image.width + x0) * 4;
    out.set(image.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

/** Box-filter downscale by an integer factor (keeps matching fast). */
export function downscaleRaster(image: RasterImage, factor: number): RasterImage {
  if (factor <= 1) return image;
  const w = Math.max(1, Math.floor(image.width / factor));
  const h = Math.max(1, Math.floor(image.height / factor));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const sx = x * factor + dx;
          const sy = y * factor + dy;
          if (sx >= image.width || sy >= image.height) continue;
          const o = (sy * image.width + sx) * 4;
          r += image.data[o];
          g += image.data[o + 1];
          b += image.data[o + 2];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// ---------------------------------------------------------------------------
// Component-based "exactly the same symbol" matching
// ---------------------------------------------------------------------------

type SymbolColor = Extract<VisualColorHint, "red" | "orange" | "green">;

/** Dominant symbol ink color inside a crop (null when mostly dark/uncolored). */
export function dominantSymbolColor(crop: RasterImage): SymbolColor | null {
  const counts: Record<SymbolColor, number> = { red: 0, orange: 0, green: 0 };
  for (let i = 0; i < crop.width * crop.height; i++) {
    const o = i * 4;
    const c = classifyPixelColor(crop.data[o]!, crop.data[o + 1]!, crop.data[o + 2]!);
    if (c === "red" || c === "orange" || c === "green") counts[c]++;
  }
  const best = (Object.entries(counts) as Array<[SymbolColor, number]>).sort(
    (a, b) => b[1] - a[1]
  )[0]!;
  return best[1] >= 8 ? best[0] : null;
}

/** Tight binary mask of one color's ink inside a crop. Null when no ink. */
export function colorInkMask(
  crop: RasterImage,
  color: SymbolColor
): { mask: Uint8Array; width: number; height: number } | null {
  const { width, height, data } = crop;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const full = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (classifyPixelColor(data[o]!, data[o + 1]!, data[o + 2]!) !== color) continue;
      full[y * width + x] = 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      mask[y * w + x] = full[(minY + y) * width + (minX + x)]!;
    }
  }
  return { mask, width: w, height: h };
}

const SHAPE_GRID = 24;

/** Nearest-neighbour resample of a binary mask to SHAPE_GRID². */
export function resampleMaskToGrid(
  mask: Uint8Array,
  width: number,
  height: number,
  size = SHAPE_GRID
): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, Math.floor((x / size) * width));
      const sy = Math.min(height - 1, Math.floor((y / size) * height));
      out[y * size + x] = mask[sy * width + sx]!;
    }
  }
  return out;
}

/** 1-cell dilation of a square binary mask. */
export function dilateMask(mask: Uint8Array, size = SHAPE_GRID): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) out[ny * size + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Shape similarity tolerant to 1-cell stroke jitter: geometric mean of
 * mutual ink coverage against the dilated counterpart. Identical symbols
 * score near 1; a missing/extra stroke half drops the score sharply.
 */
export function tolerantShapeScore(a: Uint8Array, b: Uint8Array, size = SHAPE_GRID): number {
  const da = dilateMask(a, size);
  const db = dilateMask(b, size);
  let sa = 0;
  let sb = 0;
  let aInB = 0;
  let bInA = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]) {
      sa++;
      if (db[i]) aInB++;
    }
    if (b[i]) {
      sb++;
      if (da[i]) bInA++;
    }
  }
  if (sa === 0 || sb === 0) return 0;
  return Math.sqrt((aInB / sa) * (bInA / sb));
}

/**
 * Find components on a page that have the SAME color, size and ink shape as
 * the reference symbol. Per-component alignment — no stride artifacts.
 */
export function matchPageByComponents(params: {
  pageRaster: RasterImage;
  refShape: Uint8Array;
  refPxW: number;
  refPxH: number;
  color: SymbolColor;
  pageNumber: number;
  excludeRefPx?: NormalizedRect;
}): SimilarSymbolCandidate[] {
  const { pageRaster, refShape, refPxW, refPxH, color, pageNumber, excludeRefPx } =
    params;
  const mergeGapPx = Math.max(3, Math.round(Math.min(refPxW, refPxH) * 0.35));
  const detections = detectSymbolsByColor(pageRaster, {
    page: pageNumber,
    minSymbolSizePx: Math.max(4, Math.floor(Math.min(refPxW, refPxH) * 0.55)),
    maxSymbolSizePx: Math.ceil(Math.max(refPxW, refPxH) * 2),
    mergeGapPx,
    maxAspectRatio: 8,
  });

  const out: SimilarSymbolCandidate[] = [];
  for (const det of detections) {
    const { x, y, width: w, height: h } = det.bbox;
    // Size gate — "exactly the same" symbols render at the same scale.
    if (w < refPxW * 0.6 || w > refPxW * 1.6) continue;
    if (h < refPxH * 0.6 || h > refPxH * 1.6) continue;
    if (excludeRefPx && bboxIoU(det.bbox, excludeRefPx) >= 0.4) continue;

    const crop = cropRaster(pageRaster, { x, y, width: w, height: h });
    if (dominantSymbolColor(crop) !== color) continue;
    const ink = colorInkMask(crop, color);
    if (!ink) continue;
    const shape = resampleMaskToGrid(ink.mask, ink.width, ink.height);
    const score = tolerantShapeScore(refShape, shape);
    if (score < 0.5) continue;

    out.push({
      pageNumber,
      matchScore: Number(score.toFixed(3)),
      normalizedPosition: {
        x: x / pageRaster.width,
        y: y / pageRaster.height,
        width: w / pageRaster.width,
        height: h / pageRaster.height,
      },
    });
  }

  return out
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, MAX_CANDIDATES_PER_PAGE);
}

// ---------------------------------------------------------------------------
// PDF page rendering (browser only)
// ---------------------------------------------------------------------------

type PdfJsPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

type PdfJsDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
  destroy: () => Promise<void>;
};

async function loadPdfDocument(fileUrl: string): Promise<PdfJsDoc | null> {
  if (typeof document === "undefined") return null;
  try {
    const pdfjs = await import("pdfjs-dist");
    const { loadPdfJsDocument, pdfJsWorkerSrc } = await import(
      "@/lib/takeoff/loadPdfJsDocument"
    );
    pdfjs.GlobalWorkerOptions.workerSrc = pdfJsWorkerSrc();
    return (await loadPdfJsDocument(pdfjs, fileUrl)) as PdfJsDoc;
  } catch {
    return null;
  }
}

/** Render one PDF page to an RGBA raster at roughly targetWidth px. */
async function renderPdfPageFromDoc(
  pdf: PdfJsDoc,
  pageNumber: number,
  targetWidth = 1400
): Promise<RasterImage | null> {
  if (typeof document === "undefined") return null;
  try {
    const page = await pdf.getPage(pageNumber);
    const probe = page.getViewport({ scale: 1 });
    const scale = targetWidth / probe.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: data.width, height: data.height, data: data.data };
  } catch {
    return null;
  }
}

/** Render one PDF page (loads + destroys the document — single-page callers). */
async function renderPdfPageRaster(
  fileUrl: string,
  pageNumber: number,
  targetWidth = 1400
): Promise<RasterImage | null> {
  const pdf = await loadPdfDocument(fileUrl);
  if (!pdf) return null;
  try {
    return await renderPdfPageFromDoc(pdf, pageNumber, targetWidth);
  } finally {
    void pdf.destroy();
  }
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

const MIN_TEMPLATE_PX = 8;
const MAX_TEMPLATE_DIM = 36;
const MAX_CANDIDATES_PER_PAGE = 60;
const MAX_CANDIDATES_TOTAL = 200;

function prepareTemplate(
  pageRaster: RasterImage,
  referenceBbox: NormalizedRect
): {
  template: RasterImage;
  factor: number;
  refPx: NormalizedRect;
} | null {
  const refPx: NormalizedRect = {
    x: referenceBbox.x * pageRaster.width,
    y: referenceBbox.y * pageRaster.height,
    width: referenceBbox.width * pageRaster.width,
    height: referenceBbox.height * pageRaster.height,
  };
  if (refPx.width < MIN_TEMPLATE_PX || refPx.height < MIN_TEMPLATE_PX) {
    return null;
  }
  let template = cropRaster(pageRaster, refPx);
  const maxDim = Math.max(template.width, template.height);
  const factor = Math.ceil(maxDim / MAX_TEMPLATE_DIM);
  if (factor > 1) {
    template = downscaleRaster(template, factor);
  }
  return { template, factor, refPx };
}

function matchPageWithTemplate(params: {
  pageRaster: RasterImage;
  template: RasterImage;
  factor: number;
  pageNumber: number;
  drawingId: string;
  threshold: number;
  /** When set, exclude the reference bbox itself (same page). */
  excludeRefPx?: NormalizedRect;
}): SimilarSymbolCandidate[] {
  const {
    pageRaster,
    template,
    factor,
    pageNumber,
    drawingId,
    threshold,
    excludeRefPx,
  } = params;

  let image = pageRaster;
  if (factor > 1) {
    image = downscaleRaster(pageRaster, factor);
  }

  const templateMeta: VisualSymbolTemplate = {
    id: `similar_ref_${drawingId}_${pageNumber}`,
    source: "user_confirmed",
    trade: "electrical",
    normalizedPoint: "unknown",
    sourcePage: pageNumber,
    confidence: "medium",
  };

  const detections = matchVisualTemplate(image, template, templateMeta, {
    page: pageNumber,
    threshold,
    stride: 2,
  });

  return detections
    .filter((d) => {
      if (!excludeRefPx) return true;
      const refInMatchSpace = {
        x: excludeRefPx.x / factor,
        y: excludeRefPx.y / factor,
        width: excludeRefPx.width / factor,
        height: excludeRefPx.height / factor,
      };
      return bboxIoU(d.bbox, refInMatchSpace) < 0.4;
    })
    .map((d) => ({
      pageNumber,
      matchScore: d.matchScore,
      normalizedPosition: {
        x: d.bbox.x / image.width,
        y: d.bbox.y / image.height,
        width: d.bbox.width / image.width,
        height: d.bbox.height / image.height,
      },
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, MAX_CANDIDATES_PER_PAGE);
}

/**
 * Build the reference shape for component matching. Null when the reference
 * has no dominant symbol color (dark-ink symbols fall back to NCC matching).
 */
export function prepareComponentReference(
  pageRaster: RasterImage,
  referenceBbox: NormalizedRect
): {
  refShape: Uint8Array;
  refPxW: number;
  refPxH: number;
  color: SymbolColor;
  refPx: NormalizedRect;
} | null {
  const refPx: NormalizedRect = {
    x: referenceBbox.x * pageRaster.width,
    y: referenceBbox.y * pageRaster.height,
    width: referenceBbox.width * pageRaster.width,
    height: referenceBbox.height * pageRaster.height,
  };
  if (refPx.width < 4 || refPx.height < 4) return null;
  const crop = cropRaster(pageRaster, refPx);
  const color = dominantSymbolColor(crop);
  if (!color) return null;
  const ink = colorInkMask(crop, color);
  if (!ink || ink.width < 4 || ink.height < 4) return null;
  return {
    refShape: resampleMaskToGrid(ink.mask, ink.width, ink.height),
    refPxW: ink.width,
    refPxH: ink.height,
    color,
    refPx,
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function findSimilarSymbols(
  params: FindSimilarSymbolsParams
): Promise<FindSimilarSymbolsResult> {
  const {
    fileUrl,
    pageNumber,
    referenceBbox,
    threshold = 0.78,
    scanAllPages = false,
    drawingId,
  } = params;
  if (typeof document === "undefined") {
    return { candidates: [], unavailableReason: "no_dom" };
  }

  if (!scanAllPages) {
    const pageRaster = await renderPdfPageRaster(fileUrl, pageNumber);
    if (!pageRaster) return { candidates: [], unavailableReason: "render_failed" };
    const componentRef = prepareComponentReference(pageRaster, referenceBbox);
    if (componentRef) {
      const candidates = matchPageByComponents({
        pageRaster,
        refShape: componentRef.refShape,
        refPxW: componentRef.refPxW,
        refPxH: componentRef.refPxH,
        color: componentRef.color,
        pageNumber,
        excludeRefPx: componentRef.refPx,
      });
      return { candidates, pagesScanned: 1 };
    }
    const prepared = prepareTemplate(pageRaster, referenceBbox);
    if (!prepared) {
      return { candidates: [], unavailableReason: "reference_too_small" };
    }
    const candidates = matchPageWithTemplate({
      pageRaster,
      template: prepared.template,
      factor: prepared.factor,
      pageNumber,
      drawingId,
      threshold,
      excludeRefPx: prepared.refPx,
    });
    return { candidates, pagesScanned: 1 };
  }

  const pdf = await loadPdfDocument(fileUrl);
  if (!pdf) return { candidates: [], unavailableReason: "render_failed" };

  try {
    const refRaster = await renderPdfPageFromDoc(pdf, pageNumber);
    if (!refRaster) return { candidates: [], unavailableReason: "render_failed" };
    const componentRef = prepareComponentReference(refRaster, referenceBbox);
    const prepared = componentRef ? null : prepareTemplate(refRaster, referenceBbox);
    if (!componentRef && !prepared) {
      return { candidates: [], unavailableReason: "reference_too_small" };
    }

    const all: SimilarSymbolCandidate[] = [];
    const totalPages = Math.max(1, pdf.numPages || 1);

    for (let p = 1; p <= totalPages; p++) {
      const pageRaster =
        p === pageNumber ? refRaster : await renderPdfPageFromDoc(pdf, p);
      if (!pageRaster) continue;
      const pageHits = componentRef
        ? matchPageByComponents({
            pageRaster,
            refShape: componentRef.refShape,
            refPxW: componentRef.refPxW,
            refPxH: componentRef.refPxH,
            color: componentRef.color,
            pageNumber: p,
            excludeRefPx: p === pageNumber ? componentRef.refPx : undefined,
          })
        : matchPageWithTemplate({
            pageRaster,
            template: prepared!.template,
            factor: prepared!.factor,
            pageNumber: p,
            drawingId,
            threshold,
            excludeRefPx: p === pageNumber ? prepared!.refPx : undefined,
          });
      all.push(...pageHits);
    }

    const candidates = all
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, MAX_CANDIDATES_TOTAL);

    return { candidates, pagesScanned: totalPages };
  } finally {
    void pdf.destroy();
  }
}
