/**
 * Phase 2.5 — preview/evidence/template image generation + Firebase Storage
 * upload for the PDF Takeoff Region Analyzer.
 *
 * Client-side only (pdf.js + canvas). Every function here is best-effort:
 * failures log a warning and return null so callers can proceed with
 * bbox-only evidence. Storage paths follow existing project conventions:
 *
 *   projects/{projectId}/drawings/{drawingId}/takeoff/candidates/{candidateId}.png
 *   projects/{projectId}/drawings/{drawingId}/takeoff/evidence/{confirmedSymbolId}.png
 *   projects/{projectId}/drawings/{drawingId}/takeoff/templates/{templateId}.png
 *   projects/{projectId}/drawings/{drawingId}/takeoff/regions/{regionId}.png
 */

import {
  getDownloadURL,
  getStorageInstance,
  ref,
  uploadBytes,
} from "@/lib/firebase";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import { loadPdfJsDocument, pdfJsWorkerSrc } from "@/lib/takeoff/loadPdfJsDocument";
import {
  CANDIDATE_PREVIEW_PADDING,
  EVIDENCE_CONTEXT_PADDING,
  TEMPLATE_PADDING,
  expandNormalizedRect,
  normalizedRectToPixelCrop,
  takeoffImageStoragePath,
  type TakeoffImageKind,
} from "@/lib/takeoff/takeoffImages";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type { BBoxPx } from "@/types/pdfTakeoff";

// ---------------------------------------------------------------------------
// PDF page rendering + raster cropping (shared with analyzeRegionService)
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
  getPage: (n: number) => Promise<PdfJsPage>;
  destroy: () => Promise<void>;
};

export async function renderPageRaster(
  fileUrl: string,
  pageNumber: number,
  targetWidth: number
): Promise<{ raster: RasterImage; pageWidthPt: number; pageHeightPt: number } | null> {
  if (typeof document === "undefined") return null;
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfJsWorkerSrc();
    const pdf = (await loadPdfJsDocument(pdfjs, fileUrl)) as unknown as PdfJsDoc;
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
      return {
        raster: { width: data.width, height: data.height, data: data.data },
        pageWidthPt: probe.width,
        pageHeightPt: probe.height,
      };
    } finally {
      void pdf.destroy();
    }
  } catch {
    return null;
  }
}

/**
 * Decode an arbitrary image URL (e.g. a stored symbolTemplate PNG) to an RGBA
 * raster. Browser only; best-effort — returns null on any failure so callers
 * (template matching) can skip that template instead of blocking analysis.
 */
export async function loadImageUrlAsRaster(url: string): Promise<RasterImage | null> {
  if (typeof document === "undefined") return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image_load_failed"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (canvas.width <= 0 || canvas.height <= 0) return null;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: data.width, height: data.height, data: data.data };
  } catch {
    return null;
  }
}

export function cropRaster(image: RasterImage, rectPx: BBoxPx): RasterImage {
  const x0 = Math.max(0, Math.floor(rectPx[0]));
  const y0 = Math.max(0, Math.floor(rectPx[1]));
  const x1 = Math.min(image.width, Math.ceil(rectPx[2]));
  const y1 = Math.min(image.height, Math.ceil(rectPx[3]));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * image.width + x0) * 4;
    out.set(image.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

// ---------------------------------------------------------------------------
// Raster → PNG + Storage upload
// ---------------------------------------------------------------------------

/** RGBA raster → PNG Blob via canvas; null on any failure (SSR, tainted ctx…). */
export async function rasterToPngBlob(raster: RasterImage): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = raster.width;
    canvas.height = raster.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Fresh copy — RasterImage.data may be a Uint8Array or backed by a shared buffer.
    const rgba = new Uint8ClampedArray(raster.data);
    ctx.putImageData(new ImageData(rgba, raster.width, raster.height), 0, 0);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png")
    );
  } catch {
    return null;
  }
}

/**
 * Upload a takeoff PNG and return its download URL, or null on failure.
 * Path segments are validated inside takeoffImageStoragePath — callers can
 * never write outside projects/{projectId}/drawings/{drawingId}/takeoff/.
 */
export async function uploadTakeoffImage(params: {
  projectId: string;
  drawingId: string;
  kind: TakeoffImageKind;
  id: string;
  blob: Blob;
}): Promise<string | null> {
  try {
    const storage = getStorageInstance();
    if (!storage) return null;
    const path = takeoffImageStoragePath(params);
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, params.blob, { contentType: "image/png" });
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.warn("[takeoffImageService] upload failed", params.kind, params.id, err);
    return null;
  }
}

/** Crop a padded region from a rendered page raster and upload it as PNG. */
async function cropAndUpload(params: {
  projectId: string;
  drawingId: string;
  kind: TakeoffImageKind;
  id: string;
  pageRaster: RasterImage;
  normalizedRect: NormalizedRect;
  paddingRatio: number;
}): Promise<string | null> {
  try {
    const padded = expandNormalizedRect(params.normalizedRect, params.paddingRatio);
    const cropPx = normalizedRectToPixelCrop(
      padded,
      params.pageRaster.width,
      params.pageRaster.height
    );
    const crop = cropRaster(params.pageRaster, cropPx);
    const blob = await rasterToPngBlob(crop);
    if (!blob) return null;
    return await uploadTakeoffImage({
      projectId: params.projectId,
      drawingId: params.drawingId,
      kind: params.kind,
      id: params.id,
      blob,
    });
  } catch (err) {
    console.warn("[takeoffImageService] crop failed", params.kind, params.id, err);
    return null;
  }
}

// Single-entry render cache — confirm-all bursts hit the same page repeatedly.
let lastRender: {
  key: string;
  result: { raster: RasterImage; pageWidthPt: number; pageHeightPt: number };
} | null = null;

async function renderPageRasterCached(
  fileUrl: string,
  pageNumber: number,
  targetWidth: number
): Promise<{ raster: RasterImage; pageWidthPt: number; pageHeightPt: number } | null> {
  const key = `${fileUrl}::${pageNumber}::${targetWidth}`;
  if (lastRender?.key === key) return lastRender.result;
  const result = await renderPageRaster(fileUrl, pageNumber, targetWidth);
  if (result) lastRender = { key, result };
  return result;
}

/**
 * Render a PDF page region to a PNG blob (for callers without a page raster).
 * `targetPageWidthPx` ≈ DPI control (2200px ≈ 300+ DPI for A3-ish pages).
 */
export async function renderPdfRegionToPng(params: {
  fileUrl: string;
  pageNumber: number;
  normalizedRect: NormalizedRect;
  paddingRatio?: number;
  targetPageWidthPx?: number;
}): Promise<{ blob: Blob; pageRaster: RasterImage } | null> {
  const rendered = await renderPageRasterCached(
    params.fileUrl,
    params.pageNumber,
    params.targetPageWidthPx ?? 2200
  );
  if (!rendered) return null;
  const padded = expandNormalizedRect(params.normalizedRect, params.paddingRatio ?? 0);
  const cropPx = normalizedRectToPixelCrop(
    padded,
    rendered.raster.width,
    rendered.raster.height
  );
  const blob = await rasterToPngBlob(cropRaster(rendered.raster, cropPx));
  if (!blob) return null;
  return { blob, pageRaster: rendered.raster };
}

// ---------------------------------------------------------------------------
// High-level generators — all best-effort, never throw
// ---------------------------------------------------------------------------

/** Candidate preview: slight padding around the symbol. */
export function createCandidatePreviewImage(params: {
  projectId: string;
  drawingId: string;
  candidateId: string;
  pageRaster: RasterImage;
  normalizedPosition: NormalizedRect;
}): Promise<string | null> {
  return cropAndUpload({
    projectId: params.projectId,
    drawingId: params.drawingId,
    kind: "candidates",
    id: params.candidateId,
    pageRaster: params.pageRaster,
    normalizedRect: params.normalizedPosition,
    paddingRatio: CANDIDATE_PREVIEW_PADDING,
  });
}

/** Region crop: the whole analyzed rectangle, no padding. */
export function createRegionImage(params: {
  projectId: string;
  drawingId: string;
  regionId: string;
  pageRaster: RasterImage;
  normalizedBbox: NormalizedRect;
}): Promise<string | null> {
  return cropAndUpload({
    projectId: params.projectId,
    drawingId: params.drawingId,
    kind: "regions",
    id: params.regionId,
    pageRaster: params.pageRaster,
    normalizedRect: params.normalizedBbox,
    paddingRatio: 0,
  });
}

/** Evidence image: generous context around the confirmed symbol. */
export async function createEvidenceImage(params: {
  projectId: string;
  drawingId: string;
  confirmedSymbolId: string;
  fileUrl: string;
  pageNumber: number;
  normalizedPosition: NormalizedRect;
}): Promise<string | null> {
  const rendered = await renderPdfRegionToPng({
    fileUrl: params.fileUrl,
    pageNumber: params.pageNumber,
    normalizedRect: params.normalizedPosition,
    paddingRatio: EVIDENCE_CONTEXT_PADDING,
  });
  if (!rendered) return null;
  return uploadTakeoffImage({
    projectId: params.projectId,
    drawingId: params.drawingId,
    kind: "evidence",
    id: params.confirmedSymbolId,
    blob: rendered.blob,
  });
}

/** Template image: as tight as possible around the symbol. */
export async function createTemplateImage(params: {
  projectId: string;
  drawingId: string;
  templateId: string;
  fileUrl: string;
  pageNumber: number;
  normalizedPosition: NormalizedRect;
  /** Reuse an already-rendered page raster when available (confirm flow). */
  pageRaster?: RasterImage;
}): Promise<string | null> {
  if (params.pageRaster) {
    return cropAndUpload({
      projectId: params.projectId,
      drawingId: params.drawingId,
      kind: "templates",
      id: params.templateId,
      pageRaster: params.pageRaster,
      normalizedRect: params.normalizedPosition,
      paddingRatio: TEMPLATE_PADDING,
    });
  }
  const rendered = await renderPdfRegionToPng({
    fileUrl: params.fileUrl,
    pageNumber: params.pageNumber,
    normalizedRect: params.normalizedPosition,
    paddingRatio: TEMPLATE_PADDING,
  });
  if (!rendered) return null;
  return uploadTakeoffImage({
    projectId: params.projectId,
    drawingId: params.drawingId,
    kind: "templates",
    id: params.templateId,
    blob: rendered.blob,
  });
}
