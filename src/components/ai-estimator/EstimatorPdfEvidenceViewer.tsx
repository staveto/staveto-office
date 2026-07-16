"use client";

/**
 * Interactive PDF evidence viewer for the AI estimator.
 *
 * Renders the uploaded PDF via pdf.js on a canvas and draws overlay
 * annotations (E-ZAS-001, …) on top. Clicking an annotation selects the
 * linked takeoff position; selecting a list row highlights + scrolls to
 * the annotation. Layers can be toggled per symbol type.
 *
 * Marking mode: a quick click drops a point mark, click-and-drag traces a
 * freehand shape around the symbol. Marks of the selected position show a
 * delete button. The drawing can be rotated in 90° steps.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Hand,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  X,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { isAiEstimatorDebugEnabled, logAiEstimatorDebug } from "@/lib/ai/aiEstimatorFeature";
import {
  buildPdfDisplayMarkers,
  DEFAULT_MARKER_RADIUS_PX,
  colorGroupForOverlayKey,
  markerCenterFromAnnotation,
  markerSizePx,
  type MarkerSizeOption,
  shouldRenderTechnicalBbox,
} from "@/lib/ai/pdfDisplayMarkers";
import {
  cssToCanvasPixels,
  type OverlayCoordinateContext,
} from "@/lib/ai/pdfOverlayCoordinates";
import { classifyPlanClick } from "@/lib/ai/planBoundary";
import {
  extractSymbolOutlinePolygon,
  outlinePolygonFromInkPoints,
  pixelBboxFromNormalized,
  buildTintedSymbolMask,
  hexToRgb,
} from "@/lib/ai/symbolShapeOutline";
import {
  categoryToColorPreference,
  estimatorCategoryToPickHint,
  listNearbySymbolCandidates,
  pickOptionsForContext,
  pickSymbolFromClick,
  type NearbySymbolCandidate,
} from "@/lib/ai/pickSymbolFromClick";
import { SymbolDetailLoupe } from "@/components/ai-estimator/SymbolDetailLoupe";
import { tightenSymbolBboxFromCrop } from "@/lib/ai/tightenSymbolBbox";
import type {
  EstimatorPositionBBox,
  PdfOverlayAnnotation,
  PdfOverlayColorKey,
} from "@/types/estimatorPositions";
import { loadPdfJsDocument, pdfJsWorkerSrc } from "@/lib/takeoff/loadPdfJsDocument";

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfPage = {
  rotate?: number;
  getViewport: (opts: { scale: number; rotation?: number }) => {
    width: number;
    height: number;
  };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

/** Fluorescent / high-vis tints — must pop on dense B&W construction plans. */
const LAYER_STYLE: Record<
  PdfOverlayColorKey,
  { border: string; bg: string; chip: string }
> = {
  socket: { border: "#39FF14", bg: "rgba(57,255,20,0.18)", chip: "#39FF14" },
  switch: { border: "#FF1744", bg: "rgba(255,23,68,0.18)", chip: "#FF1744" },
  lighting: { border: "#FF00AA", bg: "rgba(255,0,170,0.18)", chip: "#FF00AA" },
  led: { border: "#00F0FF", bg: "rgba(0,240,255,0.18)", chip: "#00F0FF" },
  cabling: { border: "#4D7CFF", bg: "rgba(77,124,255,0.18)", chip: "#4D7CFF" },
  unknown: { border: "#E040FB", bg: "rgba(224,64,251,0.18)", chip: "#E040FB" },
  warning: { border: "#FFEA00", bg: "rgba(255,234,0,0.22)", chip: "#FFEA00" },
};

const LAYER_ORDER: PdfOverlayColorKey[] = [
  "socket",
  "switch",
  "lighting",
  "led",
  "cabling",
  "unknown",
  "warning",
];

type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------
// Rotation helpers — annotations are stored in the drawing's default
// orientation (0..1). These map between stored and displayed coordinates.
// ---------------------------------------------------------------------------

function normRot(r: number): number {
  return ((r % 360) + 360) % 360;
}

/** Stored (unrotated) normalized point → displayed normalized point. */
function rotatePoint(p: Pt, r: number): Pt {
  switch (normRot(r)) {
    case 90:
      return { x: 1 - p.y, y: p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: p.y, y: 1 - p.x };
    default:
      return p;
  }
}

/** Displayed normalized point → stored (unrotated) normalized point. */
function unrotatePoint(p: Pt, r: number): Pt {
  switch (normRot(r)) {
    case 90:
      return { x: p.y, y: 1 - p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: 1 - p.y, y: p.x };
    default:
      return p;
  }
}

function rotateBBox(b: EstimatorPositionBBox, r: number): EstimatorPositionBBox {
  const p1 = rotatePoint({ x: b.x, y: b.y }, r);
  const p2 = rotatePoint({ x: b.x + b.width, y: b.y + b.height }, r);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p1.x - p2.x),
    height: Math.abs(p1.y - p2.y),
  };
}

function bboxOfPoints(points: Pt[]): EstimatorPositionBBox {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/** Default highlight box when user clicks without dragging (fraction of page). */
const DEFAULT_MARK_FRAC = 0.014;
/** Minimum drag (px) before we treat pointer-up as a rectangle, not a click. */
const DRAG_THRESHOLD_PX = 8;
/** Pick center must stay this close to the click (normalized), else fall back to click. */
const PICK_MAX_CENTER_DIST = 0.025;

/** Displayed (canvas) bbox → stored (unrotated) bbox. */
function unrotateBBox(b: EstimatorPositionBBox, r: number): EstimatorPositionBBox {
  const corners = [
    unrotatePoint({ x: b.x, y: b.y }, r),
    unrotatePoint({ x: b.x + b.width, y: b.y }, r),
    unrotatePoint({ x: b.x + b.width, y: b.y + b.height }, r),
    unrotatePoint({ x: b.x, y: b.y + b.height }, r),
  ];
  return bboxOfPoints(corners);
}

/** Small mark box centered on a stored normalized click. */
function clickFallbackBbox(stored: Pt, frac = DEFAULT_MARK_FRAC): EstimatorPositionBBox {
  const half = frac / 2;
  return {
    x: Math.max(0, Math.min(1 - frac, stored.x - half)),
    y: Math.max(0, Math.min(1 - frac, stored.y - half)),
    width: frac,
    height: frac,
  };
}

type MarkingToolMode = "click_symbol" | "draw_box";

export type MarkPlacedMeta = {
  rawSelectionBbox: EstimatorPositionBBox;
  tightSymbolBbox?: EstimatorPositionBBox;
  outsidePlan?: boolean;
  needsReview?: boolean;
  markStatus?:
    | "confirmed"
    | "outside_plan"
    | "needs_review"
    | "inside_plan"
    | "boundary_uncertain"
    | "in_legend_or_table";
  cropId?: string;
  /** Dominant symbol color from click picking — feeds draft type suggestions. */
  colorHint?: "red" | "orange" | "green" | "dark" | "black" | "unknown";
  confidence?: "high" | "medium" | "low";
  /** Normalized outline of the symbol ink (stored page space). */
  polygon?: Array<{ x: number; y: number }>;
};

/** Temporary marker for an unclassified symbol draft (PDF-first flow). */
export type PdfDraftMarker = {
  page: number;
  center: { x: number; y: number };
  /** Normalized box outlining the clicked symbol. */
  bbox?: EstimatorPositionBBox;
  /** Normalized outline of symbol ink. */
  polygon?: Array<{ x: number; y: number }>;
};

type Props = {
  fileUrl: string | null;
  fileName?: string;
  annotations: PdfOverlayAnnotation[];
  selectedPositionId?: string | null;
  /** Extra positions kept fully bright (Ctrl+click in checklist). */
  highlightedPositionIds?: string[];
  /**
   * When true (default), all marks stay bright for overview.
   * When false, only selected/highlighted positions stay bright.
   */
  showAllMarks?: boolean;
  onShowAllMarksChange?: (on: boolean) => void;
  onAnnotationClick?: (positionId: string | null, annotationId: string) => void;
  markMode?: boolean;
  markingToolMode?: MarkingToolMode;
  onMarkingToolModeChange?: (mode: MarkingToolMode) => void;
  categoryHint?: string;
  normalizedPoint?: string;
  onMarkPlaced?: (
    page: number,
    bbox: EstimatorPositionBBox,
    polygon?: Pt[],
    meta?: MarkPlacedMeta
  ) => void;
  draftMarker?: PdfDraftMarker | null;
  onPickFailed?: () => void;
  onOutsidePlanMark?: () => void;
  onMarkDeleted?: (positionId: string, anchorId: string) => void;
  selectedAnchorId?: string | null;
  onAnchorClick?: (anchorId: string) => void;
  /** Ctrl/Cmd+click marker toggles multi-select. */
  onToggleBulkSelect?: (positionId: string, anchorId: string) => void;
  /** Exit marking mode (Esc). */
  onMarkModeChange?: (on: boolean) => void;
  heightClassName?: string;
};

export function EstimatorPdfEvidenceViewer({
  fileUrl,
  fileName,
  annotations,
  selectedPositionId,
  highlightedPositionIds = [],
  showAllMarks = true,
  onShowAllMarksChange,
  onAnnotationClick,
  markMode = false,
  markingToolMode = "click_symbol",
  onMarkingToolModeChange,
  categoryHint,
  normalizedPoint,
  onMarkPlaced,
  draftMarker,
  onPickFailed,
  onOutsidePlanMark,
  onMarkDeleted,
  selectedAnchorId,
  onAnchorClick,
  onToggleBulkSelect,
  onMarkModeChange,
  heightClassName = "h-[520px]",
}: Props) {
  const { t } = useI18n();
  const debugEnabled = isAiEstimatorDebugEnabled();
  const [showTechnicalBoxes, setShowTechnicalBoxes] = useState(false);
  const showDebugBoxes = shouldRenderTechnicalBbox(debugEnabled && showTechnicalBoxes);
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  /** Immediate UI zoom (CSS preview). */
  const [zoom, setZoom] = useState(1);
  /** Debounced zoom used for expensive pdf.js rasterization. */
  const [renderZoom, setRenderZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [markerSize, setMarkerSize] = useState<MarkerSizeOption>("medium");
  const [panMode, setPanMode] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panningRef = useRef(false);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [hiddenLayers, setHiddenLayers] = useState<Set<PdfOverlayColorKey>>(new Set());
  /** Live rectangle while user drags around a symbol. */
  const [drawRect, setDrawRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null
  );
  /** Ink hulls computed live for marks without a stored polygon (displayed space). */
  const [liveOutlines, setLiveOutlines] = useState<
    Record<string, Array<{ x: number; y: number }>>
  >({});
  /** Live tinted ink copies of marked symbols (shape, not frame). */
  const [shapeOverlays, setShapeOverlays] = useState<
    Array<{
      id: string;
      positionId?: string;
      evidenceAnchorId?: string;
      left: number;
      top: number;
      width: number;
      height: number;
      dataUrl: string;
      glowColor: string;
    }>
  >([]);
  const [loupe, setLoupe] = useState<{
    imageData: ImageData;
    centerCanvasPx: { x: number; y: number };
    candidates: NearbySymbolCandidate[];
  } | null>(null);
  /** Next click always opens the detail loupe (user requested precise pick). */
  const forceLoupeNextRef = useRef(false);
  /** Prevent double-commit from rapid double-click. */
  const markCooldownUntilRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Cached PDF page pixels for marker overlays (invalidated on page/zoom/rotation). */
  const pagePixelsRef = useRef<{ key: string; data: ImageData } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const baseScaleRef = useRef(1);
  const dprRef = useRef(1);
  const drawingRef = useRef(false);
  const rectStartRef = useRef<Pt | null>(null);
  const drawRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Debounce expensive PDF re-raster while zooming (CSS scales immediately).
  useEffect(() => {
    const timer = window.setTimeout(() => setRenderZoom(zoom), 60);
    return () => window.clearTimeout(timer);
  }, [zoom]);

  const liveScale = zoom / Math.max(0.01, renderZoom);

  // Load the document.
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    let loaded: PdfDocument | null = null;
    setLoadError(false);
    setLoadErrorDetail(null);
    setDoc(null);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfJsWorkerSrc();
        loaded = (await loadPdfJsDocument(pdfjs, fileUrl)) as unknown as PdfDocument;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setDoc(loaded);
        setPage(1);
      } catch (err) {
        if (!cancelled) {
          setLoadError(true);
          setLoadErrorDetail(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [fileUrl]);

  // Render the current page (debounced zoom). Keep previous pixels until swap.
  const renderPage = useCallback(async () => {
    if (!doc || !canvasRef.current || !scrollRef.current) return;
    renderTaskRef.current?.cancel();
    setRendering(true);
    try {
      const pdfPage = await doc.getPage(page);
      const totalRotation = normRot((pdfPage.rotate ?? 0) + rotation);
      const containerWidth = scrollRef.current.clientWidth - 16;
      const probe = pdfPage.getViewport({ scale: 1, rotation: totalRotation });
      const fit = containerWidth > 100 ? containerWidth / probe.width : 1;
      baseScaleRef.current = fit;
      // Cap DPR at high zoom — full retina × 4× is too heavy for interactive marking.
      const dprCap = renderZoom >= 2.5 ? 1.5 : renderZoom >= 1.75 ? 1.75 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      dprRef.current = dpr;
      let scale = fit * renderZoom * dpr;
      let viewport = pdfPage.getViewport({
        scale,
        rotation: totalRotation,
      });
      // Hard pixel budget so zoom never freezes the tab.
      const MAX_EDGE = 5600;
      const maxEdge = Math.max(viewport.width, viewport.height);
      if (maxEdge > MAX_EDGE) {
        scale *= MAX_EDGE / maxEdge;
        viewport = pdfPage.getViewport({ scale, rotation: totalRotation });
      }

      // Offscreen render → swap (avoids blank canvas flash).
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.floor(viewport.width);
      offscreen.height = Math.floor(viewport.height);
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;
      const task = pdfPage.render({ canvasContext: offCtx, viewport });
      renderTaskRef.current = task;
      await task.promise;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = offscreen.width;
      canvas.height = offscreen.height;
      ctx.drawImage(offscreen, 0, 0);
      const cssWidth = Math.floor(viewport.width / dpr);
      const cssHeight = Math.floor(viewport.height / dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      setCanvasSize({ width: cssWidth, height: cssHeight });
    } catch {
      // Cancelled render or transient failure — the next render pass recovers.
    } finally {
      setRendering(false);
    }
  }, [doc, page, renderZoom, rotation]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  const pageAnnotations = useMemo(
    () =>
      annotations.filter(
        (a) => a.page === page && !hiddenLayers.has(a.colorKey) && a.bbox
      ),
    [annotations, page, hiddenLayers]
  );

  const pageMarkers = useMemo(
    () =>
      buildPdfDisplayMarkers(pageAnnotations, {
        page,
        defaultRadiusPx: DEFAULT_MARKER_RADIUS_PX,
        selectedRadiusPx: DEFAULT_MARKER_RADIUS_PX + 2,
      }),
    [pageAnnotations, page]
  );

  // Copy real symbol ink from the rendered PDF — tinted overlay, never a frame.
  useEffect(() => {
    // Rebuild after raster settles; during CSS zoom preview keep previous overlays scaled.
    if (rendering || canvasSize.width <= 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || canvas.width === 0) {
      setShapeOverlays([]);
      return;
    }
    let cancelled = false;
    try {
      const pixelKey = `${page}|${renderZoom}|${rotation}|${canvas.width}x${canvas.height}`;
      let imageData = pagePixelsRef.current?.key === pixelKey
        ? pagePixelsRef.current.data
        : null;
      if (!imageData) {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        pagePixelsRef.current = { key: pixelKey, data: imageData };
      }
      const scaleX = canvasSize.width / canvas.width;
      const scaleY = canvasSize.height / canvas.height;
      const next: typeof shapeOverlays = [];
      const nextOutlines: Record<string, Array<{ x: number; y: number }>> = {};

      for (const m of pageMarkers) {
        const box = m.displayBbox ?? m.tightSymbolBbox;
        if (!box) continue;
        const shown = rotateBBox(box, rotation);
        // Only this category's ink color — walls/dimensions never in the shape.
        const inkColorGroup = colorGroupForOverlayKey(m.colorKey);
        // Live ink hull for marks without a stored polygon — shape, not frame.
        if (!m.polygon || m.polygon.length < 3) {
          const hull = extractSymbolOutlinePolygon(
            imageData,
            pixelBboxFromNormalized(shown, canvas.width, canvas.height),
            canvas.width,
            canvas.height,
            { colorGroup: inkColorGroup }
          );
          if (hull && hull.length >= 3) nextOutlines[m.id] = hull;
        }
        // Tiny pad only — dense plans must not pull neighbour ink into the mask.
        const pad = 0.0015;
        const expanded = {
          x: Math.max(0, shown.x - pad),
          y: Math.max(0, shown.y - pad),
          width: Math.min(1 - Math.max(0, shown.x - pad), shown.width + pad * 2),
          height: Math.min(1 - Math.max(0, shown.y - pad), shown.height + pad * 2),
        };
        // Neutral navy tint — category neon is only on the ring outline (visibility).
        const glowColor = "#1D376A";
        const tint = hexToRgb(glowColor);
        const mask = buildTintedSymbolMask(
          imageData,
          pixelBboxFromNormalized(expanded, canvas.width, canvas.height),
          canvas.width,
          canvas.height,
          tint,
          { padPx: 2, alpha: 200, colorGroup: inkColorGroup }
        );
        if (!mask) {
          const cx = (shown.x + shown.width / 2) * canvasSize.width;
          const cy = (shown.y + shown.height / 2) * canvasSize.height;
          const pin = 7;
          const pinCanvas = document.createElement("canvas");
          pinCanvas.width = pin * 2;
          pinCanvas.height = pin * 2;
          const pctx = pinCanvas.getContext("2d");
          if (pctx) {
            pctx.beginPath();
            pctx.arc(pin, pin, pin - 1, 0, Math.PI * 2);
            pctx.fillStyle = glowColor;
            pctx.globalAlpha = 0.9;
            pctx.fill();
            pctx.lineWidth = 2;
            pctx.strokeStyle = "#fff";
            pctx.stroke();
            next.push({
              id: m.id,
              positionId: m.positionId,
              evidenceAnchorId: m.evidenceAnchorId,
              left: cx - pin,
              top: cy - pin,
              width: pin * 2,
              height: pin * 2,
              dataUrl: pinCanvas.toDataURL("image/png"),
              glowColor,
            });
          }
          continue;
        }
        next.push({
          id: m.id,
          positionId: m.positionId,
          evidenceAnchorId: m.evidenceAnchorId,
          left: mask.canvasX * scaleX,
          top: mask.canvasY * scaleY,
          width: mask.width * scaleX,
          height: mask.height * scaleY,
          dataUrl: mask.dataUrl,
          glowColor,
        });
      }

      if (draftMarker && draftMarker.page === page && draftMarker.bbox) {
        const shown = rotateBBox(draftMarker.bbox, rotation);
        const draftGlow = "#E95F2A";
        const mask = buildTintedSymbolMask(
          imageData,
          pixelBboxFromNormalized(shown, canvas.width, canvas.height),
          canvas.width,
          canvas.height,
          hexToRgb(draftGlow),
          { padPx: 5, alpha: 220 }
        );
        if (mask) {
          next.push({
            id: "draft_shape",
            left: mask.canvasX * scaleX,
            top: mask.canvasY * scaleY,
            width: mask.width * scaleX,
            height: mask.height * scaleY,
            dataUrl: mask.dataUrl,
            glowColor: draftGlow,
          });
        }
      }

      if (!cancelled) {
        setShapeOverlays(next);
        setLiveOutlines(nextOutlines);
      }
    } catch {
      if (!cancelled) {
        setShapeOverlays([]);
        setLiveOutlines({});
      }
    }
    return () => {
      cancelled = true;
    };
  }, [pageMarkers, draftMarker, page, canvasSize, rotation, renderZoom, rendering]);

  const layersInUse = useMemo(() => {
    const used = new Set(annotations.map((a) => a.colorKey));
    return LAYER_ORDER.filter((l) => used.has(l));
  }, [annotations]);

  // When a position or anchor is selected — jump to page + scroll to marker center.
  useEffect(() => {
    const targetAnn = selectedAnchorId
      ? annotations.find((a) => a.evidenceAnchorId === selectedAnchorId && a.bbox)
      : selectedPositionId
        ? annotations.find((a) => a.positionId === selectedPositionId && a.bbox)
        : undefined;
    if (!targetAnn?.bbox) return;
    if (targetAnn.page !== page) {
      setPage(targetAnn.page);
      return;
    }
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0) return;
    const center = markerCenterFromAnnotation(targetAnn);
    const shown = rotatePoint(center, rotation);
    const cx = shown.x * canvasSize.width;
    const cy = shown.y * canvasSize.height;
    container.scrollTo({
      left: Math.max(0, cx - container.clientWidth / 2),
      top: Math.max(0, cy - container.clientHeight / 2),
      behavior: "smooth",
    });
  }, [selectedPositionId, selectedAnchorId, annotations, page, canvasSize, rotation]);

  const layerLabel = (key: PdfOverlayColorKey) =>
    t(`projects.aiSetup.pdf.layer.${key}`);

  // ---- Marking: click-to-symbol + rectangle fallback ----

  const coordinateContext = useCallback((): OverlayCoordinateContext | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Prefer live DOM sizes — canvasSize state can lag one frame behind render.
    const cssWidth = canvas.clientWidth || canvasSize.width;
    const cssHeight = canvas.clientHeight || canvasSize.height;
    if (cssWidth <= 0 || cssHeight <= 0) return null;
    return {
      cssWidth,
      cssHeight,
      canvasWidth: canvas.width || cssWidth,
      canvasHeight: canvas.height || cssHeight,
      devicePixelRatio: dprRef.current,
      zoom,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
    };
  }, [canvasSize, zoom]);

  const overlayPointFromEvent = (e: React.PointerEvent): Pt | null => {
    const el = overlayRef.current;
    const ctx = coordinateContext();
    if (!el || !ctx) return null;
    const rect = el.getBoundingClientRect();
    // Normalize by visible rect so CSS zoom preview (liveScale) stays click-accurate.
    const cssX =
      ((e.clientX - rect.left) / Math.max(1, rect.width)) * (canvasSize.width || ctx.cssWidth);
    const cssY =
      ((e.clientY - rect.top) / Math.max(1, rect.height)) * (canvasSize.height || ctx.cssHeight);
    const pt = {
      css: { x: cssX, y: cssY },
      canvas: cssToCanvasPixels(cssX, cssY, ctx),
      displayedNormalized: {
        x: cssX / Math.max(1, canvasSize.width || ctx.cssWidth),
        y: cssY / Math.max(1, canvasSize.height || ctx.cssHeight),
      },
    };
    if (debugEnabled) {
      logAiEstimatorDebug("mark_click_coords", {
        clientX: e.clientX,
        clientY: e.clientY,
        scrollLeft: ctx.scrollLeft,
        scrollTop: ctx.scrollTop,
        zoom,
        liveScale,
        cssWidth: ctx.cssWidth,
        cssHeight: ctx.cssHeight,
        canvasWidth: ctx.canvasWidth,
        canvasHeight: ctx.canvasHeight,
        devicePixelRatio: ctx.devicePixelRatio,
        cssX: pt.css.x,
        cssY: pt.css.y,
        canvasX: pt.canvas.x,
        canvasY: pt.canvas.y,
        normX: pt.displayedNormalized.x,
        normY: pt.displayedNormalized.y,
        markMode,
        markingToolMode,
        selectedPositionId,
      });
    }
    return pt.css;
  };

  const placeMarkFromClick = (cssX: number, cssY: number) => {
    if (!onMarkPlaced) return;
    if (Date.now() < markCooldownUntilRef.current) return;
    markCooldownUntilRef.current = Date.now() + 450;
    const ctx = coordinateContext();
    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext("2d");
    if (!ctx || !canvas || !canvasCtx || canvas.width === 0) {
      onPickFailed?.();
      return;
    }

    const canvasPt = cssToCanvasPixels(cssX, cssY, ctx);
    const displayedNorm = {
      x: canvasPt.x / ctx.canvasWidth,
      y: canvasPt.y / ctx.canvasHeight,
    };
    const storedNorm = unrotatePoint(displayedNorm, rotation);
    const clickBox = clickFallbackBbox(storedNorm);
    const boundary = classifyPlanClick(storedNorm);

    // True page-outside only — legend/table still runs symbol pick so we can
    // learn a project key without counting a floor-plan occurrence.
    if (boundary.status === "outside_plan" && boundary.excludeFromTakeoff) {
      onOutsidePlanMark?.();
      onMarkPlaced(page, clickBox, undefined, {
        rawSelectionBbox: clickBox,
        outsidePlan: true,
        needsReview: true,
        markStatus: "outside_plan",
      });
      return;
    }

    let imageData: ImageData | null = null;
    try {
      imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      imageData = null;
    }

    const pickHint = estimatorCategoryToPickHint(categoryHint ?? "unknown");
    const pickOpts = pickOptionsForContext(pickHint, normalizedPoint);
    const forceLoupe = forceLoupeNextRef.current;
    forceLoupeNextRef.current = false;

    if (imageData) {
      const candidates = listNearbySymbolCandidates({
        imageData,
        clickCanvasPx: canvasPt,
        pageWidth: canvas.width,
        pageHeight: canvas.height,
        categoryHint: pickHint,
        normalizedPoint,
        options: pickOpts,
      });
      // Dense detail → interactive loupe so the user picks/assembles the exact
      // mark. Part-only building blocks never open the loupe by themselves.
      const fullCandidates = candidates.filter((c) => !c.partOnly);
      if (forceLoupe || fullCandidates.length >= 2) {
        setLoupe({
          imageData,
          centerCanvasPx: canvasPt,
          candidates,
        });
        return;
      }
    }

    commitMarkAtCanvasPoint(canvasPt, imageData, boundary);
  };

  const commitMarkAtCanvasPoint = (
    canvasPt: { x: number; y: number },
    imageData: ImageData | null,
    boundary = classifyPlanClick(
      unrotatePoint(
        {
          x: canvasPt.x / (canvasRef.current?.width || 1),
          y: canvasPt.y / (canvasRef.current?.height || 1),
        },
        rotation
      )
    )
  ) => {
    if (!onMarkPlaced) return;
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0) return;

    const displayedNorm = {
      x: canvasPt.x / canvas.width,
      y: canvasPt.y / canvas.height,
    };
    const storedNorm = unrotatePoint(displayedNorm, rotation);
    const clickBox = clickFallbackBbox(storedNorm);

    let tightStored: EstimatorPositionBBox | undefined;
    let colorHint: MarkPlacedMeta["colorHint"];
    let confidence: MarkPlacedMeta["confidence"] = "low";
    let needsReview = true;
    let outlineDisplayed: Array<{ x: number; y: number }> | undefined;

    if (imageData) {
      const pickHint = estimatorCategoryToPickHint(categoryHint ?? "unknown");
      const pickOpts = pickOptionsForContext(pickHint, normalizedPoint);
      const picked = pickSymbolFromClick({
        imageData,
        clickCanvasPx: canvasPt,
        pageWidth: canvas.width,
        pageHeight: canvas.height,
        categoryHint: pickHint,
        normalizedPoint,
        options: pickOpts,
      });

      if (picked.found && picked.tightSymbolBbox) {
        const candidate = unrotateBBox(picked.tightSymbolBbox, rotation);
        const cx = candidate.x + candidate.width / 2;
        const cy = candidate.y + candidate.height / 2;
        const dist = Math.hypot(cx - storedNorm.x, cy - storedNorm.y);
        if (dist <= PICK_MAX_CENTER_DIST) {
          tightStored = candidate;
          colorHint = picked.colorHint;
          confidence = picked.confidence;
          needsReview = picked.needsReview || boundary.needsReview;
          outlineDisplayed = picked.outlinePolygon;
        }
      }
    }

    // Click with no detectable symbol → do not create an item (rectangle tool still works).
    if (!tightStored) {
      onPickFailed?.();
      return;
    }

    const bbox = tightStored;
    if (!outlineDisplayed && imageData) {
      const displayBox = rotateBBox(bbox, rotation);
      outlineDisplayed =
        extractSymbolOutlinePolygon(
          imageData,
          pixelBboxFromNormalized(displayBox, canvas.width, canvas.height),
          canvas.width,
          canvas.height
        ) ?? undefined;
    }
    const outlineStored = outlineDisplayed?.map((p) => unrotatePoint(p, rotation));
    const markStatus =
      boundary.status === "in_legend_or_table"
        ? "in_legend_or_table"
        : boundary.status === "boundary_uncertain"
          ? "boundary_uncertain"
          : !needsReview
            ? "confirmed"
            : "needs_review";

    onMarkPlaced(page, bbox, outlineStored, {
      rawSelectionBbox: clickBox,
      tightSymbolBbox: tightStored,
      needsReview: needsReview || boundary.excludeFromTakeoff,
      markStatus,
      cropId: `crop_click_${Date.now().toString(36)}`,
      colorHint,
      confidence,
      polygon: outlineStored,
      outsidePlan: boundary.excludeFromTakeoff,
    });
  };

  /**
   * Commit one (or assembled) mark from loupe candidates.
   * When continueSeparating, keep the loupe open so stacked marks can be saved one-by-one.
   */
  const commitMarkFromCandidates = (
    selected: NearbySymbolCandidate[],
    options?: { continueSeparating?: boolean }
  ) => {
    if (!onMarkPlaced || !loupe || selected.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const c of selected) {
      minX = Math.min(minX, c.bbox.x);
      minY = Math.min(minY, c.bbox.y);
      maxX = Math.max(maxX, c.bbox.x + c.bbox.width);
      maxY = Math.max(maxY, c.bbox.y + c.bbox.height);
    }
    const displayedUnion: EstimatorPositionBBox = {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
    const storedBox = unrotateBBox(displayedUnion, rotation);

    // One outline around ALL selected parts — exact ink, never a bbox re-scan.
    const allInkPoints = selected.flatMap((c) => c.inkPoints ?? []);
    const outlineDisplayed =
      outlinePolygonFromInkPoints(allInkPoints, canvas.width, canvas.height) ??
      (selected.length === 1 ? selected[0]!.outlinePolygon : undefined) ??
      undefined;
    const outlineStored = outlineDisplayed?.map((p) => unrotatePoint(p, rotation));

    const colorHint =
      selected.find((c) => c.colorHint !== "dark" && c.colorHint !== "unknown")
        ?.colorHint ?? selected[0]!.colorHint;

    onMarkPlaced(page, storedBox, outlineStored, {
      rawSelectionBbox: storedBox,
      tightSymbolBbox: storedBox,
      needsReview: false,
      markStatus: "confirmed",
      cropId: `crop_loupe_${Date.now().toString(36)}_${selected[0]!.id.slice(-6)}`,
      colorHint,
      confidence: "high",
      polygon: outlineStored,
    });
    if (!options?.continueSeparating) {
      setLoupe(null);
    }
  };

  const placeMarkFromRect = (x1: number, y1: number, x2: number, y2: number) => {
    if (!onMarkPlaced || canvasSize.width === 0) return;
    const spanX = Math.abs(x2 - x1);
    const spanY = Math.abs(y2 - y1);
    let left: number;
    let top: number;
    let right: number;
    let bottom: number;

    if (spanX < DRAG_THRESHOLD_PX && spanY < DRAG_THRESHOLD_PX) {
      // draw_box click without drag → small default box centered on click.
      const cx = x1;
      const cy = y1;
      const hw = (DEFAULT_MARK_FRAC * canvasSize.width) / 2;
      const hh = (DEFAULT_MARK_FRAC * canvasSize.width) / 2;
      left = cx - hw;
      top = cy - hh;
      right = cx + hw;
      bottom = cy + hh;
    } else {
      left = Math.min(x1, x2);
      top = Math.min(y1, y2);
      right = Math.max(x1, x2);
      bottom = Math.max(y1, y2);
    }

    const corners: Pt[] = [
      { x: left / canvasSize.width, y: top / canvasSize.height },
      { x: right / canvasSize.width, y: top / canvasSize.height },
      { x: right / canvasSize.width, y: bottom / canvasSize.height },
      { x: left / canvasSize.width, y: bottom / canvasSize.height },
    ];
    const stored = corners.map((p) => unrotatePoint(p, rotation));
    const rawBbox = bboxOfPoints(stored);

    let meta: MarkPlacedMeta | undefined;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas && canvas.width > 0) {
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // Expected color by category; else dominant colored ink inside the rect —
        // walls/dimension linework never becomes the marked symbol.
        const preferredColors = categoryToColorPreference(
          estimatorCategoryToPickHint(categoryHint ?? "unknown"),
          normalizedPoint
        );
        const single = preferredColors.length === 1 ? preferredColors[0] : null;
        const tightened = tightenSymbolBboxFromCrop(imageData, rawBbox, {
          pageWidth: canvas.width,
          pageHeight: canvas.height,
          colorGroup:
            single === "red" || single === "orange" || single === "green" ? single : null,
          preferDominantColor: true,
        });
        meta = {
          rawSelectionBbox: rawBbox,
          tightSymbolBbox: tightened.tightBbox ?? undefined,
          outsidePlan: tightened.outsidePlan,
          needsReview: tightened.needsReview || !tightened.reliable,
          markStatus: tightened.outsidePlan
            ? "outside_plan"
            : tightened.needsReview
              ? "needs_review"
              : "confirmed",
        };
        if (tightened.outsidePlan) onOutsidePlanMark?.();

        const evidenceBbox = tightened.tightBbox ?? {
          x: tightened.center.x - DEFAULT_MARK_FRAC / 4,
          y: tightened.center.y - DEFAULT_MARK_FRAC / 4,
          width: DEFAULT_MARK_FRAC / 2,
          height: DEFAULT_MARK_FRAC / 2,
        };
        onMarkPlaced(page, evidenceBbox, stored, meta);
        return;
      } catch {
        /* fall through */
      }
    }

    onMarkPlaced(page, rawBbox, stored, { rawSelectionBbox: rawBbox, needsReview: true });
  };

  const panActive = panMode || spaceHeld;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable)
          return;
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === "Escape") {
        if (loupe) {
          setLoupe(null);
          return;
        }
        if (markMode) onMarkModeChange?.(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [loupe, markMode, onMarkModeChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const wantPan = panActive || e.button === 1;
    if (wantPan) {
      e.preventDefault();
      panningRef.current = true;
      panLastRef.current = { x: e.clientX, y: e.clientY };
      overlayRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (!markMode || !onMarkPlaced) return;
    if ((e.target as HTMLElement).closest("[data-mark-ui], [data-marker-hit]")) return;
    const p = overlayPointFromEvent(e);
    if (!p) return;
    e.preventDefault();
    drawingRef.current = true;
    rectStartRef.current = p;
    drawRectRef.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    overlayRef.current?.setPointerCapture(e.pointerId);
    setDrawRect(drawRectRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (panningRef.current && panLastRef.current && scrollRef.current) {
      const dx = e.clientX - panLastRef.current.x;
      const dy = e.clientY - panLastRef.current.y;
      panLastRef.current = { x: e.clientX, y: e.clientY };
      scrollRef.current.scrollLeft -= dx;
      scrollRef.current.scrollTop -= dy;
      return;
    }
    if (!drawingRef.current || !rectStartRef.current || markingToolMode !== "draw_box") return;
    const p = overlayPointFromEvent(e);
    if (!p) return;
    const s = rectStartRef.current;
    drawRectRef.current = { x1: s.x, y1: s.y, x2: p.x, y2: p.y };
    setDrawRect(drawRectRef.current);
  };

  const finishDrawing = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const r = drawRectRef.current;
    rectStartRef.current = null;
    drawRectRef.current = null;
    setDrawRect(null);
    if (!r) return;
    if (markingToolMode === "click_symbol") {
      placeMarkFromClick(r.x1, r.y1);
      return;
    }
    placeMarkFromRect(r.x1, r.y1, r.x2, r.y2);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (panningRef.current) {
      panningRef.current = false;
      panLastRef.current = null;
      overlayRef.current?.releasePointerCapture(e.pointerId);
      return;
    }
    if (drawingRef.current) {
      overlayRef.current?.releasePointerCapture(e.pointerId);
      finishDrawing();
    }
  };

  const sizePx = markerSizePx(markerSize);
  const focusActive =
    Boolean(selectedPositionId) ||
    Boolean(selectedAnchorId) ||
    highlightedPositionIds.length > 0 ||
    !showAllMarks;

  if (!fileUrl) {
    return (
      <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-10 text-center text-sm text-[#64748B]">
        {t("projects.aiSetup.pdf.noFile")}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-6 text-center space-y-3">
        <p className="text-sm text-amber-900">{t("projects.aiSetup.pdf.loadError")}</p>
        {loadErrorDetail ? (
          <p className="mx-auto max-w-xl break-words font-mono text-[11px] leading-relaxed text-amber-800/80">
            {loadErrorDetail}
          </p>
        ) : null}
        <Button asChild variant="outline" size="sm" className="border-[#CBD5E1]">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4 mr-1" />
            {t("projects.aiSetup.pdf.openExternal")}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#CBD5E1] bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-[#CBD5E1]"
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            aria-label={t("projects.aiSetup.pdf.zoomOut")}
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-12 text-center text-xs font-semibold tabular-nums text-[#334155]">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-[#CBD5E1]"
            onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
            aria-label={t("projects.aiSetup.pdf.zoomIn")}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1 px-2 border-[#CBD5E1] text-[11px]",
              showAllMarks && "border-[#1D376A] bg-[#EEF2FF] text-[#1D376A]"
            )}
            onClick={() => onShowAllMarksChange?.(!showAllMarks)}
            title={t("projects.aiSetup.marking.showAllMarksHint")}
            aria-pressed={showAllMarks}
          >
            {showAllMarks ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {t("projects.aiSetup.marking.showAllMarks")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 border-[#CBD5E1]"
            onClick={() => setRotation((r) => normRot(r + 90))}
            aria-label={t("projects.aiSetup.pdf.rotate")}
            title={t("projects.aiSetup.pdf.rotate")}
          >
            <RotateCw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1 px-2 border-[#CBD5E1] text-[11px]",
              panMode && "border-[#1D376A] bg-[#EEF2FF] text-[#1D376A]"
            )}
            onClick={() => setPanMode((v) => !v)}
            aria-pressed={panMode}
            title={t("projects.aiSetup.marking.panHint")}
          >
            <Hand className="size-3.5" />
            {t("projects.aiSetup.marking.pan")}
          </Button>
          <div className="flex items-center gap-0.5 border-l border-[#E2E8F0] pl-2 ml-0.5">
            {(["small", "medium", "large"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  markerSize === s
                    ? "border-[#1D376A] bg-[#1D376A] text-white"
                    : "border-[#CBD5E1] bg-white text-[#64748B]"
                )}
                onClick={() => setMarkerSize(s)}
                aria-pressed={markerSize === s}
                title={t(`projects.aiSetup.marking.markerSize.${s}`)}
              >
                {s === "small" ? "S" : s === "large" ? "L" : "M"}
              </button>
            ))}
          </div>
        </div>
        {doc && doc.numPages > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-[#CBD5E1]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label={t("projects.aiSetup.pdf.prevPage")}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs font-semibold tabular-nums text-[#334155]">
              {page} / {doc.numPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-[#CBD5E1]"
              disabled={page >= doc.numPages}
              onClick={() => setPage((p) => Math.min(doc.numPages, p + 1))}
              aria-label={t("projects.aiSetup.pdf.nextPage")}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
        {markMode && onMarkingToolModeChange ? (
          <div className="flex items-center gap-1 border-l border-[#E2E8F0] pl-2 ml-1">
            <button
              type="button"
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                markingToolMode === "click_symbol"
                  ? "border-[#E95F2A] bg-[#E95F2A] text-white"
                  : "border-[#CBD5E1] bg-white text-[#64748B]"
              )}
              onClick={() => onMarkingToolModeChange("click_symbol")}
            >
              {t("projects.aiSetup.marking.clickSymbol")}
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                markingToolMode === "draw_box"
                  ? "border-[#E95F2A] bg-[#E95F2A] text-white"
                  : "border-[#CBD5E1] bg-white text-[#64748B]"
              )}
              onClick={() => onMarkingToolModeChange("draw_box")}
            >
              {t("projects.aiSetup.marking.drawBox")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-[#1D376A]/40 bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1D376A] hover:bg-[#F6F8FB]"
              title={t("projects.aiSetup.marking.loupe.toolbarHint")}
              onClick={() => {
                forceLoupeNextRef.current = true;
                onMarkingToolModeChange("click_symbol");
              }}
            >
              <ZoomIn className="size-3" />
              {t("projects.aiSetup.marking.loupe.toolbar")}
            </button>
          </div>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {debugEnabled ? (
            <button
              type="button"
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                showTechnicalBoxes
                  ? "border-[#1D376A] bg-[#1D376A] text-white"
                  : "border-[#CBD5E1] bg-white text-[#64748B]"
              )}
              onClick={() => setShowTechnicalBoxes((v) => !v)}
            >
              {t("projects.aiSetup.pdf.showTechnicalBoxes")}
            </button>
          ) : null}
          {layersInUse.map((key) => {
            const hidden = hiddenLayers.has(key);
            return (
              <button
                key={key}
                type="button"
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                  hidden
                    ? "border-[#CBD5E1] bg-white text-[#94A3B8]"
                    : "text-white"
                )}
                style={hidden ? undefined : { backgroundColor: LAYER_STYLE[key].chip, borderColor: LAYER_STYLE[key].chip }}
                onClick={() =>
                  setHiddenLayers((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                aria-pressed={!hidden}
              >
                {layerLabel(key)}
              </button>
            );
          })}
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-[#64748B]">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={fileName ?? t("projects.aiSetup.pdf.openExternal")}
            >
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      {markMode ? (
        <div className="sticky top-0 z-20 border-b border-[#E95F2A]/50 bg-[#E95F2A] px-3 py-1.5 text-center text-xs font-bold text-white">
          {markingToolMode === "click_symbol"
            ? t("projects.aiSetup.marking.activeHintClick")
            : t("projects.aiSetup.marking.activeHintBox")}
          <span className="ml-2 font-normal opacity-90">
            {t("projects.aiSetup.marking.activeHintEsc")}
          </span>
        </div>
      ) : null}

      {/* Canvas + overlay — overflow-auto keeps horizontal scrollbar at high zoom */}
      <div
        ref={scrollRef}
        className={cn(
          "relative overflow-auto overscroll-contain bg-[#EEF2F7] p-2",
          heightClassName
        )}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            setZoom((z) => Math.min(4, Math.max(0.5, Number((z + delta).toFixed(2)))));
            return;
          }
          if (e.shiftKey && scrollRef.current) {
            e.preventDefault();
            scrollRef.current.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
          }
        }}
      >
        {!doc ? (
          <div className="absolute inset-x-0 top-3 z-10 text-center text-xs text-[#64748B]" role="status">
            {t("common.loading")}
          </div>
        ) : rendering ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 text-center text-[11px] text-[#64748B]" role="status">
            {t("projects.aiSetup.pdf.sharpeningZoom")}
          </div>
        ) : null}
        <div
          className="relative mx-auto"
          style={{
            width: canvasSize.width ? canvasSize.width * liveScale : undefined,
            height: canvasSize.height ? canvasSize.height * liveScale : undefined,
          }}
        >
        <div
          ref={overlayRef}
          className={cn(
            "relative",
            panActive && "cursor-grab active:cursor-grabbing",
            !panActive && markMode && markingToolMode === "draw_box" && "cursor-crosshair",
            !panActive && markMode && markingToolMode === "click_symbol" && "cursor-crosshair"
          )}
          style={{
            width: canvasSize.width || undefined,
            height: canvasSize.height || undefined,
            touchAction: markMode || panActive ? "none" : undefined,
            transform: liveScale !== 1 ? `scale(${liveScale})` : undefined,
            transformOrigin: "0 0",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <canvas ref={canvasRef} className="block shadow-sm" />

          {/* Live drag preview while marking (selection rect only — not persisted overlay) */}
          {canvasSize.width > 0 && drawRect && markingToolMode === "draw_box" ? (
            <svg
              className="pointer-events-none absolute inset-0 z-10"
              width={canvasSize.width}
              height={canvasSize.height}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            >
              <rect
                x={Math.min(drawRect.x1, drawRect.x2)}
                y={Math.min(drawRect.y1, drawRect.y2)}
                width={Math.abs(drawRect.x2 - drawRect.x1)}
                height={Math.abs(drawRect.y2 - drawRect.y1)}
                fill="rgba(233,95,42,0.12)"
                stroke="#E95F2A"
                strokeWidth={2}
                strokeDasharray="5 3"
                rx={2}
              />
            </svg>
          ) : null}

          {/* Debug: technical evidence boxes */}
          {showDebugBoxes && canvasSize.width > 0
            ? pageAnnotations.map((a) => {
                const boxes = [
                  { bbox: a.rawSelectionBbox, color: "#E95F2A", label: "raw" },
                  { bbox: a.tightSymbolBbox ?? a.bbox, color: "#1D376A", label: "tight" },
                ];
                return boxes.map(({ bbox, color, label }) => {
                  if (!bbox) return null;
                  const shown = rotateBBox(bbox, rotation);
                  const left = shown.x * canvasSize.width;
                  const top = shown.y * canvasSize.height;
                  const w = shown.width * canvasSize.width;
                  const h = shown.height * canvasSize.height;
                  return (
                    <div
                      key={`${a.id}_${label}`}
                      className="pointer-events-none absolute z-5 border border-dashed text-[9px] font-mono"
                      style={{
                        left,
                        top,
                        width: w,
                        height: h,
                        borderColor: color,
                        color,
                      }}
                    >
                      {label}
                    </div>
                  );
                });
              })
            : null}

          {/* Subtle ink tint — selection/dimming applied in CSS (no PDF rerender). */}
          {shapeOverlays.map((o) => {
            const isSelectedPos = o.positionId === selectedPositionId;
            const isHighlighted =
              Boolean(o.positionId) && highlightedPositionIds.includes(o.positionId!);
            const isSelectedAnchor = selectedAnchorId
              ? o.evidenceAnchorId === selectedAnchorId
              : false;
            const selected = isSelectedAnchor || isSelectedPos || isHighlighted;
            const dimmed =
              focusActive &&
              !isSelectedPos &&
              !isHighlighted &&
              !(selectedAnchorId && isSelectedAnchor) &&
              o.id !== "draft_shape";
            return (
              <img
                key={o.id}
                src={o.dataUrl}
                alt=""
                aria-hidden
                className="pointer-events-none absolute z-10"
                style={{
                  left: o.left,
                  top: o.top,
                  width: o.width,
                  height: o.height,
                  opacity: dimmed ? 0.22 : selected ? 1 : 0.75,
                  imageRendering: "pixelated",
                  filter: selected
                    ? "drop-shadow(0 0 1px #fff) drop-shadow(0 0 3px #0F2A4D)"
                    : "drop-shadow(0 0 1px #fff)",
                }}
                draggable={false}
              />
            );
          })}

          {/* Symbol shape outlines — follow the ink hull, not a rectangle. */}
          {canvasSize.width > 0 ? (
            <svg
              className="pointer-events-none absolute inset-0 z-16"
              width={canvasSize.width}
              height={canvasSize.height}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            >
              {pageMarkers.map((m) => {
                // Stored polygon (unrotated space) or live hull (already displayed space).
                const storedPoly =
                  m.polygon && m.polygon.length >= 3 ? m.polygon : null;
                const livePoly = storedPoly ? null : liveOutlines[m.id] ?? null;
                if (!storedPoly && !livePoly) return null;
                const isSelectedPos = m.positionId === selectedPositionId;
                const isHighlighted =
                  Boolean(m.positionId) &&
                  highlightedPositionIds.includes(m.positionId!);
                const isSelectedAnchor = selectedAnchorId
                  ? m.evidenceAnchorId === selectedAnchorId
                  : m.selected;
                const selected = isSelectedAnchor || isSelectedPos || isHighlighted;
                const dimmed =
                  focusActive &&
                  !isSelectedPos &&
                  !isHighlighted &&
                  !(selectedAnchorId && isSelectedAnchor);
                const isCandidate = Boolean(m.isCandidate);
                const isWarning = Boolean(m.needsReview) && !isCandidate;
                const stroke = selected
                  ? "#E95F2A"
                  : isWarning
                    ? "#D97706"
                    : isCandidate
                      ? "#1D376A"
                      : "#0F2A4D";
                const strokeW = selected ? 2.5 : 1.75;
                const displayPts = storedPoly
                  ? storedPoly.map((p) => rotatePoint(p, rotation))
                  : livePoly!;
                const pts = displayPts
                  .map(
                    (p) =>
                      `${(p.x * canvasSize.width).toFixed(1)},${(p.y * canvasSize.height).toFixed(1)}`
                  )
                  .join(" ");
                return (
                  <g key={`shape_${m.id}`} opacity={dimmed ? 0.28 : 1}>
                    <polygon
                      points={pts}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={strokeW + 2}
                      strokeLinejoin="round"
                    />
                    <polygon
                      points={pts}
                      fill={selected ? "rgba(233,95,42,0.12)" : "none"}
                      stroke={stroke}
                      strokeWidth={strokeW}
                      strokeDasharray={isCandidate ? "4 3" : undefined}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}
            </svg>
          ) : null}

          {/* High-contrast rings: white halo + dark outline (not plan colors). */}
          {pageMarkers.map((m) => {
            const box = m.displayBbox ?? m.tightSymbolBbox;
            const shownBox = box
              ? rotateBBox(box, rotation)
              : (() => {
                  const c = rotatePoint(m.center, rotation);
                  const f = DEFAULT_MARK_FRAC / 2;
                  return {
                    x: c.x - f,
                    y: c.y - f,
                    width: DEFAULT_MARK_FRAC,
                    height: DEFAULT_MARK_FRAC,
                  };
                })();
            const left = shownBox.x * canvasSize.width - sizePx.pad;
            const top = shownBox.y * canvasSize.height - sizePx.pad;
            const w = Math.max(
              sizePx.minOutline,
              shownBox.width * canvasSize.width + sizePx.pad * 2
            );
            const h = Math.max(
              sizePx.minOutline,
              shownBox.height * canvasSize.height + sizePx.pad * 2
            );
            const cx = left + w / 2;
            const isSelectedPos = m.positionId === selectedPositionId;
            const isHighlighted =
              Boolean(m.positionId) && highlightedPositionIds.includes(m.positionId!);
            const isSelectedAnchor = selectedAnchorId
              ? m.evidenceAnchorId === selectedAnchorId
              : m.selected;
            const selected = isSelectedAnchor || isSelectedPos || isHighlighted;
            const dimmed =
              focusActive &&
              !isSelectedPos &&
              !isHighlighted &&
              !(selectedAnchorId && isSelectedAnchor);
            const annId = m.evidenceAnchorId ? `ann_${m.evidenceAnchorId}` : m.id;
            const isCandidate = Boolean(m.isCandidate);
            const isWarning = Boolean(m.needsReview) && !isCandidate;
            const stroke = selected
              ? "#E95F2A"
              : isWarning
                ? "#D97706"
                : isCandidate
                  ? "#1D376A"
                  : "#0F2A4D";
            const strokeW = selected ? 3 : 2;
            // Shape-outlined marks (polygon) get an invisible hit target only —
            // the ink hull SVG above is the visible marker, not a rectangle.
            const hasShape =
              Boolean(m.polygon && m.polygon.length >= 3) ||
              Boolean(liveOutlines[m.id] && liveOutlines[m.id]!.length >= 3);

            return (
              <span
                key={`hit_${m.id}`}
                className="contents"
                style={{ opacity: dimmed ? 0.28 : 1 }}
              >
                <button
                  type="button"
                  data-marker-hit
                  className={cn(
                    "absolute z-15 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E95F2A]",
                    !hasShape && "bg-white/10",
                    selected && !hasShape && "z-20 bg-[#E95F2A]/15",
                    selected && hasShape && "z-20"
                  )}
                  style={{
                    left,
                    top,
                    width: w,
                    height: h,
                    ...(hasShape
                      ? { background: "transparent" }
                      : {
                          boxShadow: `0 0 0 2px #fff, 0 0 0 ${2 + strokeW}px ${stroke}`,
                          border: isCandidate
                            ? `${strokeW}px dashed ${stroke}`
                            : `${strokeW}px solid ${stroke}`,
                        }),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      (e.ctrlKey || e.metaKey) &&
                      onToggleBulkSelect &&
                      m.positionId &&
                      m.evidenceAnchorId
                    ) {
                      onToggleBulkSelect(m.positionId, m.evidenceAnchorId);
                      return;
                    }
                    if (m.evidenceAnchorId) onAnchorClick?.(m.evidenceAnchorId);
                    onAnnotationClick?.(m.positionId || null, annId);
                  }}
                  title={m.label}
                  aria-label={`${m.label} — ${layerLabel(m.colorKey)}`}
                />
                <span
                  className="pointer-events-none absolute z-25 max-w-[120px] truncate rounded-sm px-1 py-px font-bold text-white shadow"
                  style={{
                    left: cx,
                    top: Math.max(0, top - sizePx.label - 4),
                    transform: "translateX(-50%)",
                    fontSize: sizePx.label,
                    backgroundColor: selected ? "#E95F2A" : "#0F2A4D",
                  }}
                >
                  {m.label}
                </span>
                {selected && m.isManualMark && onMarkDeleted && m.evidenceAnchorId ? (
                  <button
                    type="button"
                    data-mark-ui
                    className="absolute z-30 grid size-5 place-items-center rounded-full bg-[#DC2626] text-white shadow hover:bg-[#B91C1C]"
                    style={{ left: left + w - 8, top: top - 8 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkDeleted(m.positionId, m.evidenceAnchorId!);
                    }}
                    title={t("projects.aiSetup.marking.deleteMark")}
                    aria-label={t("projects.aiSetup.marking.deleteMark")}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
        </div>
      </div>

      {annotations.length === 0 ? (
        <p className="border-t border-[#E2E8F0] bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("projects.aiSetup.pdf.noBboxHint")}
        </p>
      ) : null}

      {loupe ? (
        <SymbolDetailLoupe
          imageData={loupe.imageData}
          pageWidth={loupe.imageData.width}
          pageHeight={loupe.imageData.height}
          centerCanvasPx={loupe.centerCanvasPx}
          candidates={loupe.candidates}
          onConfirmCandidates={commitMarkFromCandidates}
          onPickPoint={(pt) => {
            commitMarkAtCanvasPoint(pt, loupe.imageData);
            setLoupe(null);
          }}
          onClose={() => setLoupe(null)}
        />
      ) : null}
    </div>
  );
}
