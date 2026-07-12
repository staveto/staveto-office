/**
 * Split a multi-page PDF into single-page PDFs for Gemini page-level vision.
 * Uses pdf-lib only (no canvas / native renderers) — safe for Cloud Functions.
 */

import { PDFDocument } from "pdf-lib";

export const ESTIMATOR_MAX_PDF_PAGES = 10;
/** Soft per-page limit for Gemini inline data. */
export const ESTIMATOR_MAX_PAGE_BYTES = 6.5 * 1024 * 1024;

export type SplitPdfPage = {
  pageNumber: number;
  bytes: Buffer;
  fileName: string;
};

export type SplitPdfResult =
  | { ok: true; pages: SplitPdfPage[]; pageCount: number; truncated: boolean }
  | { ok: false; reason: string };

/**
 * Returns one PDF buffer per page (1-based page numbers).
 * Caps at ESTIMATOR_MAX_PDF_PAGES. Falls back with ok:false on empty/corrupt input.
 */
export async function splitPdfIntoPages(
  pdfBytes: Buffer,
  originalFileName: string
): Promise<SplitPdfResult> {
  if (!pdfBytes?.length) {
    return { ok: false, reason: "empty_pdf" };
  }

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? `pdf_load_failed:${e.message}` : "pdf_load_failed",
    };
  }

  const pageCount = src.getPageCount();
  if (pageCount <= 0) return { ok: false, reason: "no_pages" };
  if (pageCount === 1) {
    return {
      ok: true,
      pageCount: 1,
      truncated: false,
      pages: [
        {
          pageNumber: 1,
          bytes: pdfBytes,
          fileName: `${stripPdfExt(originalFileName)}_p1.pdf`,
        },
      ],
    };
  }

  const limit = Math.min(pageCount, ESTIMATOR_MAX_PDF_PAGES);
  const pages: SplitPdfPage[] = [];
  const base = stripPdfExt(originalFileName);

  for (let i = 0; i < limit; i++) {
    const pageDoc = await PDFDocument.create();
    const [copied] = await pageDoc.copyPages(src, [i]);
    pageDoc.addPage(copied);
    const bytes = Buffer.from(await pageDoc.save());
    if (bytes.length > ESTIMATOR_MAX_PAGE_BYTES) {
      // Skip oversized page; caller may still fall back to whole-PDF.
      continue;
    }
    pages.push({
      pageNumber: i + 1,
      bytes,
      fileName: `${base}_p${i + 1}.pdf`,
    });
  }

  if (pages.length === 0) {
    return { ok: false, reason: "all_pages_too_large" };
  }

  return {
    ok: true,
    pages,
    pageCount,
    truncated: pageCount > ESTIMATOR_MAX_PDF_PAGES,
  };
}

function stripPdfExt(name: string): string {
  return name.replace(/\.pdf$/i, "") || "document";
}
