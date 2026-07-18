/**
 * Phase 2.5 — pure helpers for takeoff preview/evidence/template images.
 * No Firestore, no Storage, no DOM: storage path building, crop padding
 * math and URL attachment. Uploads live in services/takeoff/takeoffImageService.
 */

import type { NormalizedRect } from "@/types/drawingTakeoff";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";

export type TakeoffImageKind = "candidates" | "evidence" | "templates" | "regions";

/**
 * Crop paddings as a ratio of the symbol box size:
 * - candidate preview: slight padding so the symbol is recognizable
 * - evidence: generous context so the user sees where on the plan it sits
 * - template: as tight as possible for future matching
 */
export const CANDIDATE_PREVIEW_PADDING = 0.35;
export const EVIDENCE_CONTEXT_PADDING = 1.5;
export const TEMPLATE_PADDING = 0.05;

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Storage path for a generated takeoff image. IDs are strictly validated so
 * user-influenced values can never write outside the takeoff folder.
 *
 * projects/{projectId}/drawings/{drawingId}/takeoff/{kind}/{id}.png
 */
export function takeoffImageStoragePath(params: {
  projectId: string;
  drawingId: string;
  kind: TakeoffImageKind;
  id: string;
}): string {
  const { projectId, drawingId, kind, id } = params;
  for (const [name, value] of [
    ["projectId", projectId],
    ["drawingId", drawingId],
    ["id", id],
  ] as const) {
    if (!value || !SAFE_ID.test(value)) {
      throw new Error(`INVALID_STORAGE_PATH_SEGMENT:${name}`);
    }
  }
  return `projects/${projectId}/drawings/${drawingId}/takeoff/${kind}/${id}.png`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Expand a normalized rect by `paddingRatio` of its own size on every side,
 * clamped to the page (0..1). A degenerate rect stays degenerate.
 */
export function expandNormalizedRect(
  rect: NormalizedRect,
  paddingRatio: number
): NormalizedRect {
  const padX = rect.width * paddingRatio;
  const padY = rect.height * paddingRatio;
  const x1 = clamp01(rect.x - padX);
  const y1 = clamp01(rect.y - padY);
  const x2 = clamp01(rect.x + rect.width + padX);
  const y2 = clamp01(rect.y + rect.height + padY);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Normalized rect → integer pixel crop box [x1, y1, x2, y2] on a rendered
 * page, clamped inside the page and enforcing a minimum readable size.
 */
export function normalizedRectToPixelCrop(
  rect: NormalizedRect,
  pageWidthPx: number,
  pageHeightPx: number,
  minSizePx = 24
): [number, number, number, number] {
  let x1 = Math.floor(rect.x * pageWidthPx);
  let y1 = Math.floor(rect.y * pageHeightPx);
  let x2 = Math.ceil((rect.x + rect.width) * pageWidthPx);
  let y2 = Math.ceil((rect.y + rect.height) * pageHeightPx);

  // Grow tiny crops around their center so thumbnails stay readable.
  if (x2 - x1 < minSizePx) {
    const cx = (x1 + x2) / 2;
    x1 = Math.floor(cx - minSizePx / 2);
    x2 = x1 + minSizePx;
  }
  if (y2 - y1 < minSizePx) {
    const cy = (y1 + y2) / 2;
    y1 = Math.floor(cy - minSizePx / 2);
    y2 = y1 + minSizePx;
  }

  x1 = Math.max(0, Math.min(x1, pageWidthPx - 1));
  y1 = Math.max(0, Math.min(y1, pageHeightPx - 1));
  x2 = Math.max(x1 + 1, Math.min(x2, pageWidthPx));
  y2 = Math.max(y1 + 1, Math.min(y2, pageHeightPx));
  return [x1, y1, x2, y2];
}

/**
 * Attach uploaded preview URLs onto candidate DTOs. Missing/failed uploads
 * keep preview_image_url null — the UI falls back to bbox-only display.
 */
export function attachCandidatePreviewUrls(
  candidates: AnalyzeRegionCandidateDto[],
  urlById: ReadonlyMap<string, string | null>
): AnalyzeRegionCandidateDto[] {
  return candidates.map((c) => {
    const url = urlById.get(c.id);
    return url ? { ...c, preview_image_url: url } : c;
  });
}

/**
 * Evidence image for a confirmed symbol: freshly generated crop wins,
 * otherwise reuse the candidate preview, otherwise null (bbox-only fallback).
 */
export function chooseEvidenceImageUrl(
  generatedUrl: string | null | undefined,
  candidatePreviewUrl: string | null | undefined
): string | null {
  return generatedUrl ?? candidatePreviewUrl ?? null;
}
