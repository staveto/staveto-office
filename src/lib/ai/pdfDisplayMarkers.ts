/**
 * Derive user-facing PDF markers from evidence overlay annotations.
 * Evidence bboxes stay for crop/matching; display draws a thin outline
 * around the (tight) symbol box — not a pin floating over it.
 */

import type {
  EstimatorPositionBBox,
  PdfDisplayMarker,
  PdfOverlayAnnotation,
} from "@/types/estimatorPositions";

export const DEFAULT_MARKER_RADIUS_PX = 9;
export const SELECTED_MARKER_RADIUS_PX = 11;
/** Minimum on-screen size of a symbol outline (CSS px) so tiny symbols stay clickable. */
export const MIN_SYMBOL_OUTLINE_PX = 18;

function bboxCenter(bbox: EstimatorPositionBBox): { x: number; y: number } {
  return {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2,
  };
}

/** Prefer tight symbol center, then evidence bbox center. */
export function markerCenterFromAnnotation(a: PdfOverlayAnnotation): { x: number; y: number } {
  if (a.tightSymbolBbox) return bboxCenter(a.tightSymbolBbox);
  return bboxCenter(a.bbox);
}

/** Box used to outline the symbol on the PDF. */
export function markerDisplayBboxFromAnnotation(
  a: PdfOverlayAnnotation
): EstimatorPositionBBox {
  return a.tightSymbolBbox ?? a.bbox;
}

/** Build display markers — one outline per annotation. */
export function buildPdfDisplayMarkers(
  annotations: PdfOverlayAnnotation[],
  options?: {
    page?: number;
    defaultRadiusPx?: number;
    selectedRadiusPx?: number;
  }
): PdfDisplayMarker[] {
  const page = options?.page;
  const defaultR = options?.defaultRadiusPx ?? DEFAULT_MARKER_RADIUS_PX;
  const selectedR = options?.selectedRadiusPx ?? SELECTED_MARKER_RADIUS_PX;

  return annotations
    .filter((a) => a.bbox && (page == null || a.page === page))
    .filter((a) => a.markStatus !== "outside_plan")
    .map((a) => {
      const displayBbox = markerDisplayBboxFromAnnotation(a);
      const center = markerCenterFromAnnotation(a);
      return {
        id: `marker_${a.id}`,
        positionId: a.positionId ?? "",
        evidenceAnchorId: a.evidenceAnchorId,
        page: a.page,
        center,
        radius: a.selected ? selectedR : defaultR,
        displayBbox,
        polygon: a.polygon,
        label: a.label,
        colorKey: a.colorKey,
        needsReview: a.needsReview,
        selected: Boolean(a.selected),
        isManualMark: a.isManualMark,
        markStatus: a.markStatus,
        rawSelectionBbox: a.rawSelectionBbox,
        tightSymbolBbox: a.tightSymbolBbox,
      };
    });
}

/** Whether default overlay should render filled bbox (debug only). */
export function shouldRenderTechnicalBbox(debugMode: boolean): boolean {
  return debugMode;
}
