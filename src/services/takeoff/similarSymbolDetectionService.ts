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
import type { VisualColorHint, VisualSymbolDetection, VisualSymbolTemplate } from "@/types/visualSymbols";
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
): { mask: Uint8Array; width: number; height: number; offsetX: number; offsetY: number } | null {
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
  return { mask, width: w, height: h, offsetX: minX, offsetY: minY };
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
 * Rotate a size×size binary grid 90°. Applying it 4 times returns the
 * original grid (a genuine rotation, not just some reshuffle) — used to
 * match the SAME symbol installed at a different rotation, which is the
 * normal case on a floor plan (a socket/switch is rotated to face whichever
 * wall it's mounted on, not redrawn from scratch).
 */
export function rotateMaskGrid90(mask: Uint8Array, size = SHAPE_GRID): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      out[r * size + c] = mask[(size - 1 - c) * size + r]!;
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

/** 1-cell dilation of a rectangular (non-square) binary mask. */
function dilateMaskWH(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
}

/** Rotate a rectangular binary mask 90° — swaps width/height, unlike the fixed-grid rotate. */
export function rotateMaskWH90(
  mask: Uint8Array,
  width: number,
  height: number
): { mask: Uint8Array; width: number; height: number } {
  const outW = height;
  const outH = width;
  const out = new Uint8Array(outW * outH);
  for (let r = 0; r < outH; r++) {
    for (let c = 0; c < outW; c++) {
      out[r * outW + c] = mask[(height - 1 - c) * width + r]!;
    }
  }
  return { mask: out, width: outW, height: outH };
}

type SplitHit = { x: number; y: number; width: number; height: number; score: number };

/** Keep only the best-scoring hit within each cluster of near-overlapping hits. */
function dedupeSplitHitsByDistance(hits: SplitHit[], minDist: number): SplitHit[] {
  const sorted = [...hits].sort((a, b) => b.score - a.score);
  const kept: SplitHit[] = [];
  for (const h of sorted) {
    const cx = h.x + h.width / 2;
    const cy = h.y + h.height / 2;
    const tooClose = kept.some((k) => {
      const kcx = k.x + k.width / 2;
      const kcy = k.y + k.height / 2;
      return Math.hypot(cx - kcx, cy - kcy) < minDist;
    });
    if (!tooClose) kept.push(h);
  }
  return kept;
}

/**
 * Recover individual symbol occurrences from a blob that connected-component
 * analysis merged into one — the normal case when two of the same symbol are
 * installed touching or slightly overlapping (no background gap between
 * them for a component split to find on its own). Slides the reference ink
 * mask over the merged blob's own ink mask at every position and keeps every
 * well-matching, non-overlapping placement — a plain binary NCC pass, tolerant
 * to 1px stroke jitter the same way `tolerantShapeScore` is.
 */
export function splitMergedInkBlob(params: {
  blobMask: Uint8Array;
  blobWidth: number;
  blobHeight: number;
  refMask: Uint8Array;
  refWidth: number;
  refHeight: number;
  stride?: number;
  minScore?: number;
}): SplitHit[] {
  const {
    blobMask,
    blobWidth,
    blobHeight,
    refMask,
    refWidth,
    refHeight,
    stride = 1,
    minScore = 0.55,
  } = params;
  if (refWidth > blobWidth || refHeight > blobHeight) return [];
  let refInk = 0;
  for (let i = 0; i < refMask.length; i++) if (refMask[i]) refInk++;
  if (refInk === 0) return [];

  const dilatedRef = dilateMaskWH(refMask, refWidth, refHeight);
  const dilatedBlob = dilateMaskWH(blobMask, blobWidth, blobHeight);

  const hits: SplitHit[] = [];
  for (let y = 0; y + refHeight <= blobHeight; y += stride) {
    for (let x = 0; x + refWidth <= blobWidth; x += stride) {
      let aInB = 0;
      let winInk = 0;
      let bInA = 0;
      for (let ry = 0; ry < refHeight; ry++) {
        const blobRow = (y + ry) * blobWidth + x;
        const refRow = ry * refWidth;
        for (let rx = 0; rx < refWidth; rx++) {
          const refOn = refMask[refRow + rx];
          const winOn = blobMask[blobRow + rx];
          if (refOn && dilatedBlob[blobRow + rx]) aInB++;
          if (winOn) {
            winInk++;
            if (dilatedRef[refRow + rx]) bInA++;
          }
        }
      }
      if (winInk === 0) continue;
      const score = Math.sqrt((aInB / refInk) * (bInA / winInk));
      if (score >= minScore) hits.push({ x, y, width: refWidth, height: refHeight, score });
    }
  }
  const minDist = Math.min(refWidth, refHeight) * 0.6;
  return dedupeSplitHitsByDistance(hits, minDist);
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
  /**
   * Native-resolution ink mask of the reference (refPxW × refPxH), used to
   * recover individual occurrences from blobs that component analysis
   * merged together — e.g. two of the same symbol installed touching or
   * slightly overlapping. Optional so existing callers keep working; when
   * omitted, oversized/merged blobs are just skipped as before.
   */
  refInkMask?: Uint8Array;
}): SimilarSymbolCandidate[] {
  const { pageRaster, refShape, refPxW, refPxH, color, pageNumber, excludeRefPx, refInkMask } =
    params;
  const mergeGapPx = Math.max(3, Math.round(Math.min(refPxW, refPxH) * 0.35));
  // A fixed cap of 8 rejects the reference's OWN shape outright once it's an
  // elongated symbol (LED strip, wide distribution board) — search at least
  // as elongated as the reference itself (with headroom), so "find similar"
  // can still discover other occurrences of that same elongated symbol.
  const refAspect = Math.max(refPxW, refPxH) / Math.max(1, Math.min(refPxW, refPxH));
  const maxAspectRatio = Math.max(8, Math.min(24, refAspect * 1.5));
  // Allow blobs several times the reference's size through — on a busy
  // plan two or more of the same symbol are often touching/overlapping with
  // no background gap between them, so the component detector reports them
  // as ONE oversized blob. Instead of dropping it, the loop below re-splits
  // it into individual reference-sized occurrences.
  const detections = detectSymbolsByColor(pageRaster, {
    page: pageNumber,
    minSymbolSizePx: Math.max(4, Math.floor(Math.min(refPxW, refPxH) * 0.55)),
    maxSymbolSizePx: Math.ceil(Math.max(refPxW, refPxH) * (refInkMask ? 6 : 2)),
    mergeGapPx,
    maxAspectRatio,
  });

  // The SAME symbol is normally installed at different rotations depending
  // on which wall it's mounted on (a socket facing left vs facing down is
  // still "the same socket", not a different one) — precompute the
  // reference shape at all 4 rotations once, instead of per candidate.
  const rot90 = rotateMaskGrid90(refShape);
  const rot180 = rotateMaskGrid90(rot90);
  const rot270 = rotateMaskGrid90(rot180);
  // Rotations 0°/180° keep width/height on the same axes as the reference;
  // 90°/270° swap them — each candidate is only compared against the
  // rotations whose axis orientation its own bbox size actually matches.
  const directRotations = [refShape, rot180];
  const swappedRotations = [rot90, rot270];

  // Native-resolution rotations of the reference ink, used only for
  // splitting merged/oversized blobs (tolerantShapeScore above works on the
  // resampled square grid, which loses the pixel-accurate geometry needed
  // to slide the reference across a bigger blob).
  const nativeDirect = refInkMask ? { mask: refInkMask, width: refPxW, height: refPxH } : null;
  const nativeRot90 = nativeDirect ? rotateMaskWH90(nativeDirect.mask, refPxW, refPxH) : null;
  const nativeRot180 = nativeRot90
    ? rotateMaskWH90(nativeRot90.mask, nativeRot90.width, nativeRot90.height)
    : null;
  const nativeRot270 = nativeRot180
    ? rotateMaskWH90(nativeRot180.mask, nativeRot180.width, nativeRot180.height)
    : null;
  const nativeDirectRotations = [nativeDirect, nativeRot180].filter(
    (v): v is { mask: Uint8Array; width: number; height: number } => v !== null
  );
  const nativeSwappedRotations = [nativeRot90, nativeRot270].filter(
    (v): v is { mask: Uint8Array; width: number; height: number } => v !== null
  );

  const out: SimilarSymbolCandidate[] = [];
  for (const det of detections) {
    const { x, y, width: w, height: h } = det.bbox;
    // Size gate — "exactly the same" symbol renders at the same scale,
    // either at the reference's own orientation or rotated 90°.
    const matchesDirectSize =
      w >= refPxW * 0.6 && w <= refPxW * 1.6 && h >= refPxH * 0.6 && h <= refPxH * 1.6;
    const matchesSwappedSize =
      w >= refPxH * 0.6 && w <= refPxH * 1.6 && h >= refPxW * 0.6 && h <= refPxW * 1.6;

    if (!matchesDirectSize && !matchesSwappedSize) {
      const isPlausibleMerge =
        nativeDirectRotations.length > 0 &&
        (w > refPxW * 1.6 || h > refPxH * 1.6 || w > refPxH * 1.6 || h > refPxW * 1.6);
      if (!isPlausibleMerge) continue;

      const blobCrop = cropRaster(pageRaster, { x, y, width: w, height: h });
      if (dominantSymbolColor(blobCrop) !== color) continue;
      const blobInk = colorInkMask(blobCrop, color);
      if (!blobInk) continue;

      const rotationsToTry = [
        ...(blobInk.width >= refPxW * 0.6 && blobInk.height >= refPxH * 0.6
          ? nativeDirectRotations
          : []),
        ...(blobInk.width >= refPxH * 0.6 && blobInk.height >= refPxW * 0.6
          ? nativeSwappedRotations
          : []),
      ];
      const splitHits = rotationsToTry
        .filter((rot) => rot.width <= blobInk.width && rot.height <= blobInk.height)
        .flatMap((rot) =>
          splitMergedInkBlob({
            blobMask: blobInk.mask,
            blobWidth: blobInk.width,
            blobHeight: blobInk.height,
            refMask: rot.mask,
            refWidth: rot.width,
            refHeight: rot.height,
          })
        );
      const dedupedHits = dedupeSplitHitsByDistance(
        splitHits,
        Math.min(refPxW, refPxH) * 0.6
      );
      for (const hit of dedupedHits) {
        const pageX = x + blobInk.offsetX + hit.x;
        const pageY = y + blobInk.offsetY + hit.y;
        if (
          excludeRefPx &&
          bboxIoU({ x: pageX, y: pageY, width: hit.width, height: hit.height }, excludeRefPx) >=
            0.4
        )
          continue;
        out.push({
          pageNumber,
          matchScore: Number(hit.score.toFixed(3)),
          normalizedPosition: {
            x: pageX / pageRaster.width,
            y: pageY / pageRaster.height,
            width: hit.width / pageRaster.width,
            height: hit.height / pageRaster.height,
          },
        });
      }
      continue;
    }
    if (excludeRefPx && bboxIoU(det.bbox, excludeRefPx) >= 0.4) continue;

    const crop = cropRaster(pageRaster, { x, y, width: w, height: h });
    if (dominantSymbolColor(crop) !== color) continue;
    const ink = colorInkMask(crop, color);
    if (!ink) continue;
    const shape = resampleMaskToGrid(ink.mask, ink.width, ink.height);

    const candidateRotations = [
      ...(matchesDirectSize ? directRotations : []),
      ...(matchesSwappedSize ? swappedRotations : []),
    ];
    let score = 0;
    for (const rotated of candidateRotations) {
      score = Math.max(score, tolerantShapeScore(rotated, shape));
    }
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

  // Merged-blob splitting can produce a hit that lands very close to one
  // found directly (e.g. the smaller of two touching instances was also
  // just within the normal size gate) — a final page-wide NMS keeps results
  // clean regardless of which path found them.
  const finalOut: SimilarSymbolCandidate[] = [];
  for (const cand of out.sort((a, b) => b.matchScore - a.matchScore)) {
    const overlaps = finalOut.some(
      (kept) =>
        bboxIoU(
          normalizedRectToPx(cand.normalizedPosition, pageRaster),
          normalizedRectToPx(kept.normalizedPosition, pageRaster)
        ) >= 0.4
    );
    if (!overlaps) finalOut.push(cand);
  }

  return finalOut.slice(0, MAX_CANDIDATES_PER_PAGE);
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

// ---------------------------------------------------------------------------
// Reference bbox snapping — "I clicked/boxed part of the symbol, not all of it"
// ---------------------------------------------------------------------------

/** Normalized (0..1) page rect → raster pixel VisualBBox. */
function normalizedRectToPx(rect: NormalizedRect, raster: RasterImage) {
  return {
    x: rect.x * raster.width,
    y: rect.y * raster.height,
    width: rect.width * raster.width,
    height: rect.height * raster.height,
  };
}

/** Raster pixel VisualBBox → normalized (0..1) page rect. */
function pxToNormalizedRect(
  px: { x: number; y: number; width: number; height: number },
  raster: RasterImage
): NormalizedRect {
  return {
    x: px.x / raster.width,
    y: px.y / raster.height,
    width: px.width / raster.width,
    height: px.height / raster.height,
  };
}

const EXPAND_SEARCH_PAD_FACTOR = 3;
/** Even a tiny fragment (a tight manual click box) searches at least this far in every direction. */
const EXPAND_SEARCH_MIN_PAD_PX = 70;
const EXPAND_SEARCH_MAX_PAD_PX = 120;
/** Reference/match blob overlap below this is "a different, nearby symbol" — keep the original bbox. */
const EXPAND_MIN_OVERLAP = 0.15;

/**
 * A manual point-click (fixed ~22px box) or an under-sized auto-detected
 * candidate often captures only a FRAGMENT of a larger/elongated symbol
 * (a wavy LED-strip icon, a wide distribution-board rectangle) — matching
 * against that fragment then fails to find the SAME full symbol elsewhere,
 * because the size/shape gates compare against the fragment's tiny size,
 * not the real symbol's. This snaps the reference to the full connected
 * same-color ink blob that contains it, searching a padded neighbourhood
 * around the given bbox; falls back to the original bbox untouched when no
 * blob is found nearby (dark/black symbols, or a genuinely isolated mark) —
 * "find similar" must never end up worse than before this snap.
 */
export function expandBboxToFullInkComponent(
  pageRaster: RasterImage,
  bboxPx: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const padX = Math.min(
    EXPAND_SEARCH_MAX_PAD_PX,
    Math.max(EXPAND_SEARCH_MIN_PAD_PX, bboxPx.width * EXPAND_SEARCH_PAD_FACTOR)
  );
  const padY = Math.min(
    EXPAND_SEARCH_MAX_PAD_PX,
    Math.max(EXPAND_SEARCH_MIN_PAD_PX, bboxPx.height * EXPAND_SEARCH_PAD_FACTOR)
  );
  // Extend on the far side when clamped at 0 by the page edge, so a
  // fragment near the top/left of the page still gets the FULL requested
  // search radius (not just whatever fit before the page boundary).
  const searchX = Math.max(0, Math.floor(bboxPx.x - padX));
  const searchY = Math.max(0, Math.floor(bboxPx.y - padY));
  const searchX1 = Math.min(pageRaster.width, Math.ceil(bboxPx.x + bboxPx.width + padX));
  const searchY1 = Math.min(pageRaster.height, Math.ceil(bboxPx.y + bboxPx.height + padY));
  const searchW = searchX1 - searchX;
  const searchH = searchY1 - searchY;
  if (searchW < 4 || searchH < 4) return bboxPx;

  const crop = cropRaster(pageRaster, { x: searchX, y: searchY, width: searchW, height: searchH });
  const detections = detectSymbolsByColor(crop, {
    minSymbolSizePx: 3,
    maxSymbolSizePx: Math.max(searchW, searchH),
    mergeGapPx: 3,
    // Generous — LED-strip/board-like icons are far more elongated than the
    // region analyzer's own candidates would ever be allowed to be.
    maxAspectRatio: 14,
  });
  if (detections.length === 0) return bboxPx;

  const localRef = {
    x: bboxPx.x - searchX,
    y: bboxPx.y - searchY,
    width: bboxPx.width,
    height: bboxPx.height,
  };

  let best: VisualSymbolDetection | null = null;
  let bestScore = 0;
  for (const det of detections) {
    // IoU alone under-scores a tiny reference sitting fully inside a much
    // bigger blob — also check how much of the reference's OWN area the
    // blob covers, since that's "this blob is what the user pointed at".
    const ix = Math.max(
      0,
      Math.min(det.bbox.x + det.bbox.width, localRef.x + localRef.width) -
        Math.max(det.bbox.x, localRef.x)
    );
    const iy = Math.max(
      0,
      Math.min(det.bbox.y + det.bbox.height, localRef.y + localRef.height) -
        Math.max(det.bbox.y, localRef.y)
    );
    const inter = ix * iy;
    const refArea = localRef.width * localRef.height;
    const containment = refArea > 0 ? inter / refArea : 0;
    const score = Math.max(bboxIoU(det.bbox, localRef), containment);
    if (score > bestScore) {
      bestScore = score;
      best = det;
    }
  }
  if (!best || bestScore < EXPAND_MIN_OVERLAP) return bboxPx;

  return {
    x: searchX + best.bbox.x,
    y: searchY + best.bbox.y,
    width: best.bbox.width,
    height: best.bbox.height,
  };
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
  refInkMask: Uint8Array;
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
    refInkMask: ink.mask,
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
    const snappedBbox = pxToNormalizedRect(
      expandBboxToFullInkComponent(pageRaster, normalizedRectToPx(referenceBbox, pageRaster)),
      pageRaster
    );
    const componentRef = prepareComponentReference(pageRaster, snappedBbox);
    if (componentRef) {
      const candidates = matchPageByComponents({
        pageRaster,
        refShape: componentRef.refShape,
        refInkMask: componentRef.refInkMask,
        refPxW: componentRef.refPxW,
        refPxH: componentRef.refPxH,
        color: componentRef.color,
        pageNumber,
        excludeRefPx: componentRef.refPx,
      });
      return { candidates, pagesScanned: 1 };
    }
    const prepared = prepareTemplate(pageRaster, snappedBbox);
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
    const snappedBbox = pxToNormalizedRect(
      expandBboxToFullInkComponent(refRaster, normalizedRectToPx(referenceBbox, refRaster)),
      refRaster
    );
    const componentRef = prepareComponentReference(refRaster, snappedBbox);
    const prepared = componentRef ? null : prepareTemplate(refRaster, snappedBbox);
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
            refInkMask: componentRef.refInkMask,
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
