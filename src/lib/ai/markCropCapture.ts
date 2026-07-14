"use client";

/**
 * Render a small crop of a PDF drawing around a marked bbox to a base64 PNG.
 * Used by the "AI: čo je táto značka?" action in the marking checklist —
 * the crop travels to the identifyDrawingSymbol callable.
 */

import { loadPdfJsDocument, pdfJsWorkerSrc } from "@/lib/takeoff/loadPdfJsDocument";
import type { EstimatorPositionBBox } from "@/types/estimatorPositions";

type PdfPageLike = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: number[];
  }) => { promise: Promise<void> };
};
type PdfDocLike = {
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy: () => Promise<void>;
};

/** Crop output size in pixels (square-ish, enough detail for one symbol). */
const CROP_TARGET_PX = 420;
/** The crop covers the mark plus this much context around it. */
const CONTEXT_MULTIPLIER = 3;
/** Minimum crop size as a fraction of page width (tiny point marks). */
const MIN_CROP_FRACTION = 0.06;

export async function captureMarkCrop(input: {
  fileUrl: string;
  page: number;
  bbox: EstimatorPositionBBox;
}): Promise<{ base64: string; mimeType: "image/png" }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfJsWorkerSrc();
  const doc = (await loadPdfJsDocument(pdfjs, input.fileUrl)) as unknown as PdfDocLike;
  try {
    const page = await doc.getPage(input.page > 0 ? input.page : 1);
    const base = page.getViewport({ scale: 1 });

    // Crop region in normalized page coordinates, centered on the mark.
    const cx = input.bbox.x + input.bbox.width / 2;
    const cy = input.bbox.y + input.bbox.height / 2;
    const half = Math.max(
      MIN_CROP_FRACTION / 2,
      (Math.max(input.bbox.width, input.bbox.height) * CONTEXT_MULTIPLIER) / 2
    );
    const x0 = Math.max(0, cx - half);
    const y0 = Math.max(0, cy - half);
    const x1 = Math.min(1, cx + half);
    const y1 = Math.min(1, cy + half);

    const scale = CROP_TARGET_PX / ((x1 - x0) * base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((x1 - x0) * base.width * scale));
    canvas.height = Math.max(1, Math.round((y1 - y0) * base.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Shift the render so only the crop region lands on the canvas.
    await page.render({
      canvasContext: ctx,
      viewport,
      transform: [1, 0, 0, 1, -x0 * base.width * scale, -y0 * base.height * scale],
    }).promise;

    const dataUrl = canvas.toDataURL("image/png");
    return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/png" };
  } finally {
    void doc.destroy();
  }
}
