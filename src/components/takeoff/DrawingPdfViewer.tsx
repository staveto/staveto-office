"use client";

/**
 * Drawing PDF viewer for the Plan Takeoff Workbench.
 *
 * Renders the PDF via pdf.js (same approach as EstimatorPdfEvidenceViewer)
 * and draws occurrence markers from normalized (0..1) coordinates, so the
 * overlay stays glued to the drawing across zoom, resize and DPR changes.
 *
 * Adds interactive marking on top of the display-only estimator viewer:
 *  - "point" mode: click places a small marker box,
 *  - "rect" mode: drag draws a bounding box,
 *  - "select" mode: click a marker to select the linked list item.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Frame,
  Hand,
  Minus,
  MoveHorizontal,
  Plus,
  ChevronLeft,
  ChevronRight,
  MousePointer,
  MapPin,
  RotateCcw,
  RotateCw,
  Square,
  ScanSearch,
  ScanLine,
  LayoutGrid,
  Undo2,
  CheckCircle2,
  Highlighter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { DrawingOccurrence, NormalizedRect } from "@/types/drawingTakeoff";
import type { AnalyzeRegionCandidateDto, SymbolColorLayer } from "@/types/pdfTakeoff";
import {
  computeEvidenceFocusTarget,
  fitPageZoom,
  nextRotation,
  normalizedToScreenRect,
  rotateNormalizedRect,
  screenRectContainsPoint,
  screenToNormalizedRect,
  pointToNormalizedRect,
  normalizeDragRect,
  occurrenceMarkerStyle,
  occurrenceLayer,
  occurrenceColor,
  unrotateNormalizedRect,
  TAKEOFF_LAYER_ORDER,
  OCCURRENCE_SOURCE_COLORS,
  OCCURRENCE_STATUS_COLORS,
  type TakeoffLayerKey,
  type ViewRotation,
} from "@/lib/takeoff/drawingTakeoff";
import { loadPdfJsDocument, pdfJsWorkerSrc } from "@/lib/takeoff/loadPdfJsDocument";
import { SELECTED_HIGHLIGHT_COLOR } from "@/lib/takeoff/selectionHighlight";

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfPage = {
  /** Page's own rotation from the PDF (0/90/180/270). */
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

export type MarkerMode = "select" | "pan" | "point" | "rect" | "analyze_region";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

const CANDIDATE_LAYER_COLORS: Record<SymbolColorLayer, string> = {
  green: "#16A34A",
  red: "#DC2626",
  orange: "#EA580C",
  blue: "#2563EB",
  black: "#334155",
  gray: "#94A3B8",
  unknown: "#7C3AED",
};

/** Marker button minimum rendered/clickable size (CSS px) — tiny marks stay easy to hit. */
const OCCURRENCE_MARKER_MIN_PX = 12;
const CANDIDATE_MARKER_MIN_PX = 10;
/** Extra forgiveness around a marker's own box for click/drag hit-testing. */
const MARKER_HIT_PADDING_PX = 8;
/** Pointer must move this far before a marker press counts as a drag, not a click. */
const MARKER_DRAG_THRESHOLD_PX = 4;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

type MarkerKind = "occurrence" | "candidate";

type MarkerDragState = {
  kind: MarkerKind;
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  /** toView(original normalizedPosition) — view-space 0..1, captured once at drag start. */
  originViewRect: NormalizedRect;
  dxPx: number;
  dyPx: number;
  moved: boolean;
};

type OverlapPickerItem = {
  kind: MarkerKind;
  id: string;
  label: string;
  color: string;
  confirmed?: boolean;
};

/**
 * A tiny/thin mark (e.g. an LED strip's slim bbox) can make the selected
 * border+glow nearly invisible — the box itself is too small to notice.
 * This locator ping is a FIXED-SIZE pulsing target centered on the mark,
 * independent of the underlying bbox size, so selection is unmistakable
 * even for the smallest or thinnest candidates.
 */
function SelectedLocatorPing({ centerX, centerY }: { centerX: number; centerY: number }) {
  const size = 26;
  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{ left: centerX - size / 2, top: centerY - size / 2, width: size, height: size }}
      aria-hidden
    >
      <span
        className="absolute inset-0 animate-ping rounded-full"
        style={{ backgroundColor: `${SELECTED_HIGHLIGHT_COLOR}99` }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{ border: `2px solid ${SELECTED_HIGHLIGHT_COLOR}`, boxShadow: `0 0 8px 2px ${SELECTED_HIGHLIGHT_COLOR}` }}
      />
      <span
        className="absolute rounded-full"
        style={{
          left: size / 2 - 3,
          top: size / 2 - 3,
          width: 6,
          height: 6,
          backgroundColor: SELECTED_HIGHLIGHT_COLOR,
          boxShadow: "0 0 3px 1px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}

type Props = {
  fileUrl: string | null;
  fileName?: string;
  occurrences: DrawingOccurrence[];
  selectedOccurrenceId?: string | null;
  onMarkerClick?: (occurrenceId: string) => void;
  /** Called when the user places a point or finishes drawing a rectangle. */
  onMarkerDrawn?: (pageNumber: number, normalized: NormalizedRect) => void;
  markerMode: MarkerMode;
  onMarkerModeChange: (mode: MarkerMode) => void;
  onPageChange?: (page: number) => void;
  heightClassName?: string;
  /**
   * Drag-to-reposition a mis-placed mark in "select" mode. When omitted,
   * markers are not draggable (read-only viewers keep the old behavior).
   */
  onOccurrenceMove?: (occurrenceId: string, normalized: NormalizedRect) => void;
  /** Inline delete (×) shown on the selected mark — permanent removal. */
  onOccurrenceDelete?: (occurrenceId: string) => void;
  /** Region-analyzer candidates (Phase 1 overlays — not quote quantities). */
  regionCandidates?: AnalyzeRegionCandidateDto[];
  selectedCandidateId?: string | null;
  onCandidateClick?: (candidateId: string) => void;
  /** Drag-to-reposition a candidate/confirmed symbol (see onOccurrenceMove). */
  onCandidateMove?: (candidateId: string, normalized: NormalizedRect) => void;
  /** Inline delete (×) shown on the selected candidate/confirmed symbol. */
  onCandidateDelete?: (candidate: AnalyzeRegionCandidateDto) => void;
  showAnalyzeRegionMode?: boolean;
  /** When false, manual marking modes (point/rect) are hidden (read-only). */
  allowMarking?: boolean;
  /** Page to open initially (deep link). */
  initialPage?: number;
  analyzingRegion?: boolean;
  /**
   * Primary AI-scan actions — "Skenovať viditeľnú oblasť" analyzes exactly
   * what's on screen right now; "Skenovať celú stranu" tiles the whole page.
   * Both reuse the analyze-region v2 pipeline and only ever produce review
   * candidates (never confirmed symbols / quantities).
   */
  onScanVisibleArea?: (pageNumber: number, normalized: NormalizedRect) => void;
  onScanWholePage?: (pageNumber: number) => void;
  scanningWholePage?: boolean;
  /**
   * Evidence focus — jump to page + scroll/zoom bbox into view
   * when the user clicks a takeoff quantity evidence link.
   */
  focusEvidence?: {
    pageNumber: number;
    normalized: NormalizedRect;
    token: number;
  } | null;
};

const MODE_BUTTONS: Array<{ mode: MarkerMode; icon: typeof MousePointer; labelKey: string }> = [
  { mode: "select", icon: MousePointer, labelKey: "takeoff.viewer.modeSelect" },
  { mode: "pan", icon: Hand, labelKey: "takeoff.viewer.modePan" },
  { mode: "point", icon: MapPin, labelKey: "takeoff.viewer.modePoint" },
  { mode: "rect", icon: Square, labelKey: "takeoff.viewer.modeRect" },
  { mode: "analyze_region", icon: ScanSearch, labelKey: "takeoff.viewer.modeAnalyzeRegion" },
];

export function DrawingPdfViewer({
  fileUrl,
  fileName,
  occurrences,
  selectedOccurrenceId,
  onMarkerClick,
  onMarkerDrawn,
  markerMode,
  onMarkerModeChange,
  onPageChange,
  heightClassName = "h-[620px]",
  onOccurrenceMove,
  onOccurrenceDelete,
  regionCandidates = [],
  selectedCandidateId = null,
  onCandidateClick,
  onCandidateMove,
  onCandidateDelete,
  showAnalyzeRegionMode = true,
  allowMarking = true,
  initialPage,
  analyzingRegion = false,
  onScanVisibleArea,
  onScanWholePage,
  scanningWholePage = false,
  focusEvidence = null,
}: Props) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(Math.max(1, initialPage ?? 1));
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState<ViewRotation>(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [hiddenLayers, setHiddenLayers] = useState<Set<TakeoffLayerKey>>(new Set());
  // "Show all on plan" — glows EVERY mark (not just the selected one) so the
  // user can compare the whole list against the drawing at a glance and spot
  // real symbols that have no mark yet (nothing missing → covers everything).
  const [highlightAll, setHighlightAll] = useState(false);
  const [dragRect, setDragRect] = useState<NormalizedRect | null>(null);
  // Drag-to-move a marker (candidate/occurrence) on the plan.
  const [markerDrag, setMarkerDrag] = useState<MarkerDragState | null>(null);
  // Clustered/overlapping marks — clicking any of them opens a small picker
  // instead of always resolving to whichever one happens to be on top.
  const [overlapPicker, setOverlapPicker] = useState<{
    x: number;
    y: number;
    items: OverlapPickerItem[];
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  // A completed drag suppresses the browser's synthetic click that follows
  // pointerup, so releasing a drag never also re-triggers marker selection.
  const suppressClickRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null
  );
  const initialPageAppliedRef = useRef(false);

  const panActive = markerMode === "pan" || spaceHeld;
  // Rotation is view-only: stored coords stay page-space (unrotated).
  const toView = useCallback(
    (r: NormalizedRect) => rotateNormalizedRect(r, rotation),
    [rotation]
  );
  const fromView = useCallback(
    (r: NormalizedRect) => unrotateNormalizedRect(r, rotation),
    [rotation]
  );

  useEffect(() => {
    onPageChange?.(page);
  }, [page, onPageChange]);

  // Load document (fetch bytes first — Firebase Storage URLs often fail in pdf.js url mode).
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
        setPage((prev) => {
          // First load honours the deep-linked page; new files reset to 1.
          const target = initialPageAppliedRef.current ? 1 : Math.max(1, initialPage ?? 1);
          initialPageAppliedRef.current = true;
          return Math.min(loaded!.numPages, target) || prev;
        });
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

  // Render current page.
  const renderPage = useCallback(async () => {
    if (!doc || !canvasRef.current || !scrollRef.current) return;
    renderTaskRef.current?.cancel();
    setRendering(true);
    try {
      const pdfPage = await doc.getPage(page);
      const containerWidth = scrollRef.current.clientWidth - 16;
      // View rotation is added on top of the page's own rotation; probe uses
      // the same rotation so zoom=1 stays "fit width" of the rotated page.
      const viewRotation = (((pdfPage.rotate ?? 0) + rotation) % 360 + 360) % 360;
      const probe = pdfPage.getViewport({ scale: 1, rotation: viewRotation });
      const fit = containerWidth > 100 ? containerWidth / probe.width : 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({
        scale: fit * zoom * dpr,
        rotation: viewRotation,
      });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const cssWidth = Math.floor(viewport.width / dpr);
      const cssHeight = Math.floor(viewport.height / dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      setCanvasSize({ width: cssWidth, height: cssHeight });
      const task = pdfPage.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch {
      // Cancelled render or transient failure — next pass recovers.
    } finally {
      setRendering(false);
    }
  }, [doc, page, zoom, rotation]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  // Re-render on container resize so overlay stays aligned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void renderPage());
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [renderPage]);

  const pageOccurrences = useMemo(
    () =>
      occurrences.filter(
        (o) => o.pageNumber === page && !hiddenLayers.has(occurrenceLayer(o))
      ),
    [occurrences, page, hiddenLayers]
  );

  const layersInUse = useMemo(() => {
    const used = new Set(occurrences.map(occurrenceLayer));
    return TAKEOFF_LAYER_ORDER.filter((l) => used.has(l));
  }, [occurrences]);

  // Selecting from the list scrolls the marker into view.
  useEffect(() => {
    if (!selectedOccurrenceId) return;
    const target = occurrences.find((o) => o.id === selectedOccurrenceId);
    if (!target) return;
    if (target.pageNumber !== page) {
      setPage(target.pageNumber);
      return;
    }
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0) return;
    const rect = normalizedToScreenRect(toView(target.normalizedPosition), canvasSize);
    container.scrollTo({
      left: Math.max(0, rect.x + rect.width / 2 - container.clientWidth / 2),
      top: Math.max(0, rect.y + rect.height / 2 - container.clientHeight / 2),
      behavior: "smooth",
    });
  }, [selectedOccurrenceId, occurrences, page, canvasSize, toView]);

  // Selecting a candidate row in the review panel must actually show WHERE
  // it is on the plan — change page + scroll it into view (and zoom in a
  // bit for tiny marks), exactly like the evidence-link focus below. Without
  // this, picking a candidate on a different page or outside the current
  // scroll viewport looked like "nothing happened".
  useEffect(() => {
    if (!selectedCandidateId) return;
    const target = regionCandidates.find((c) => c.id === selectedCandidateId);
    if (!target?.normalized_position) return;
    const targetPage = target.page_number ?? page;
    if (targetPage !== page) {
      setPage(targetPage);
      return;
    }
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0) return;
    const focusTarget = computeEvidenceFocusTarget(
      toView(target.normalized_position),
      canvasSize,
      { width: container.clientWidth, height: container.clientHeight }
    );
    if (focusTarget.zoomBump) {
      setZoom((z) => Math.min(3, Math.max(z, 1.5)));
    }
    container.scrollTo({
      left: focusTarget.scrollLeft,
      top: focusTarget.scrollTop,
      behavior: "smooth",
    });
  }, [selectedCandidateId, regionCandidates, page, canvasSize, toView]);

  // Evidence link: change page + scroll to bbox (and bump zoom if tiny).
  // Works after rotation because the bbox is mapped page→view first.
  useEffect(() => {
    if (!focusEvidence) return;
    if (focusEvidence.pageNumber !== page) {
      setPage(focusEvidence.pageNumber);
      return;
    }
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0) return;
    const target = computeEvidenceFocusTarget(
      toView(focusEvidence.normalized),
      canvasSize,
      {
        width: container.clientWidth,
        height: container.clientHeight,
      }
    );
    // Tiny evidence boxes — zoom in a bit so the mark is readable.
    if (target.zoomBump) {
      setZoom((z) => Math.min(3, Math.max(z, 1.5)));
    }
    container.scrollTo({
      left: target.scrollLeft,
      top: target.scrollTop,
      behavior: "smooth",
    });
  }, [focusEvidence, page, canvasSize, toView]);

  // ---- View controls ---------------------------------------------------------

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(z.toFixed(2))));

  const applyFitWidth = useCallback(() => {
    // Baseline scale is fit-width by construction.
    setZoom(1);
  }, []);

  const applyFitPage = useCallback(() => {
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0 || zoom <= 0) return;
    const baseCss = { width: canvasSize.width / zoom, height: canvasSize.height / zoom };
    setZoom(
      clampZoom(
        fitPageZoom(baseCss, {
          width: container.clientWidth,
          height: container.clientHeight,
        })
      )
    );
  }, [canvasSize, zoom]);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    scrollRef.current?.scrollTo({ left: 0, top: 0 });
  }, []);

  const rotateBy = useCallback((delta: 90 | -90) => {
    setRotation((r) => nextRotation(r, delta));
  }, []);

  // "Skenovať viditeľnú oblasť" — analyze exactly what's currently scrolled
  // into view, no drag needed. Approximate (ignores the few px of canvas
  // padding) — good enough since the analyzer expands tiny regions anyway.
  const handleScanVisibleArea = useCallback(() => {
    if (!onScanVisibleArea || canvasSize.width === 0 || canvasSize.height === 0) return;
    const container = scrollRef.current;
    if (!container) return;
    const left = Math.max(0, Math.min(container.scrollLeft, canvasSize.width));
    const top = Math.max(0, Math.min(container.scrollTop, canvasSize.height));
    const width = Math.max(1, Math.min(canvasSize.width - left, container.clientWidth));
    const height = Math.max(1, Math.min(canvasSize.height - top, container.clientHeight));
    const normalized = fromView(
      screenToNormalizedRect({ x: left, y: top, width, height }, canvasSize)
    );
    onScanVisibleArea(page, normalized);
  }, [onScanVisibleArea, canvasSize, page, fromView]);

  // Keyboard shortcuts — active when the viewer has focus.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }
    if (e.key === "+" || e.key === "=") {
      setZoom((z) => clampZoom(z + 0.25));
    } else if (e.key === "-") {
      setZoom((z) => clampZoom(z - 0.25));
    } else if (e.key === "0") {
      resetView();
    } else if (e.key === "f" || e.key === "F") {
      applyFitPage();
    } else if (e.key === "w" || e.key === "W") {
      applyFitWidth();
    } else if (e.key === "r" || e.key === "R") {
      rotateBy(90);
    } else if (e.key === " ") {
      setSpaceHeld(true);
      e.preventDefault();
    } else {
      return;
    }
    e.preventDefault?.();
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === " ") setSpaceHeld(false);
  };

  // ---- Marking interactions -------------------------------------------------

  const localPoint = (e: React.PointerEvent) => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const isRectDrawMode = markerMode === "rect" || markerMode === "analyze_region";

  const handlePointerDown = (e: React.PointerEvent) => {
    // Pan (hand tool or space+drag) — scroll the container instead of marking.
    if (panActive) {
      const container = scrollRef.current;
      if (!container) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: container.scrollLeft,
        top: container.scrollTop,
      };
      return;
    }
    if (markerMode === "select" || !onMarkerDrawn || analyzingRegion || scanningWholePage) return;
    const p = localPoint(e);
    if (!p) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStartRef.current = p;
    if (isRectDrawMode) {
      setDragRect(screenToNormalizedRect({ ...p, width: 0, height: 0 }, canvasSize));
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (panStartRef.current) {
      const container = scrollRef.current;
      if (!container) return;
      container.scrollLeft = panStartRef.current.left - (e.clientX - panStartRef.current.x);
      container.scrollTop = panStartRef.current.top - (e.clientY - panStartRef.current.y);
      return;
    }
    if (!isRectDrawMode || !dragStartRef.current) return;
    const p = localPoint(e);
    if (!p) return;
    const px = normalizeDragRect(dragStartRef.current, p);
    setDragRect(screenToNormalizedRect(px, canvasSize));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (panStartRef.current) {
      panStartRef.current = null;
      return;
    }
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (
      markerMode === "select" ||
      markerMode === "pan" ||
      !onMarkerDrawn ||
      !start ||
      analyzingRegion ||
      scanningWholePage
    ) {
      setDragRect(null);
      return;
    }
    const p = localPoint(e);
    setDragRect(null);
    if (!p || canvasSize.width === 0) return;

    // All stored coords are page-space: view coords are un-rotated first.
    if (markerMode === "point") {
      onMarkerDrawn(page, fromView(pointToNormalizedRect(p, canvasSize)));
      return;
    }
    // rect / analyze_region — a tiny drag counts as a point. For analyze the
    // point rect is auto-expanded downstream, so a click NEVER silently
    // disappears ("nothing happened" is not an allowed outcome).
    const px = normalizeDragRect(start, p);
    if (px.width < 6 && px.height < 6) {
      onMarkerDrawn(page, fromView(pointToNormalizedRect(p, canvasSize)));
    } else {
      onMarkerDrawn(page, fromView(screenToNormalizedRect(px, canvasSize)));
    }
  };

  // Confirmed candidates STAY on the map (solid, checkmarked) so a counted
  // symbol never visually "disappears" — only rejected ones are hidden.
  const pageCandidates = useMemo(
    () =>
      regionCandidates.filter(
        (c) =>
          (c.page_number == null || c.page_number === page) &&
          Boolean(c.normalized_position) &&
          c.status !== "rejected"
      ),
    [regionCandidates, page]
  );

  // ---- Marker select / drag / delete interactions ---------------------------

  const localPointFromClient = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  /** Every marker (occurrence + candidate) whose forgiving hit box covers a point. */
  const findMarkersAtPoint = useCallback(
    (point: { x: number; y: number }): OverlapPickerItem[] => {
      const hits: OverlapPickerItem[] = [];
      for (const o of pageOccurrences) {
        const style = occurrenceMarkerStyle(o);
        const r = normalizedToScreenRect(toView(o.normalizedPosition), canvasSize);
        const box = {
          x: r.x,
          y: r.y,
          width: Math.max(OCCURRENCE_MARKER_MIN_PX, r.width),
          height: Math.max(OCCURRENCE_MARKER_MIN_PX, r.height),
        };
        if (screenRectContainsPoint(box, point, MARKER_HIT_PADDING_PX)) {
          hits.push({ kind: "occurrence", id: o.id, label: o.label, color: style.color });
        }
      }
      for (const c of pageCandidates) {
        const color = CANDIDATE_LAYER_COLORS[c.color_layer] ?? CANDIDATE_LAYER_COLORS.unknown;
        const r = normalizedToScreenRect(toView(c.normalized_position), canvasSize);
        const box = {
          x: r.x,
          y: r.y,
          width: Math.max(CANDIDATE_MARKER_MIN_PX, r.width),
          height: Math.max(CANDIDATE_MARKER_MIN_PX, r.height),
        };
        if (screenRectContainsPoint(box, point, MARKER_HIT_PADDING_PX)) {
          hits.push({
            kind: "candidate",
            id: c.id,
            label: c.label_suggestions[0]?.label ?? c.color_layer,
            color,
            confirmed: c.status === "confirmed",
          });
        }
      }
      return hits;
    },
    [pageOccurrences, pageCandidates, toView, canvasSize]
  );

  /**
   * A marker was clicked (not dragged). If it's the only mark near the
   * click, select it directly — same behavior as before. If several marks
   * overlap at that point (a dense cluster), let the user pick exactly
   * which one instead of always resolving to whichever is visually on top.
   */
  const handleMarkerActivate = useCallback(
    (kind: MarkerKind, id: string, clientX: number, clientY: number) => {
      const point = localPointFromClient(clientX, clientY);
      const hits = point ? findMarkersAtPoint(point) : [];
      if (hits.length <= 1 || !point) {
        if (kind === "occurrence") onMarkerClick?.(id);
        else onCandidateClick?.(id);
        return;
      }
      setOverlapPicker({ x: point.x, y: point.y, items: hits });
    },
    [localPointFromClient, findMarkersAtPoint, onMarkerClick, onCandidateClick]
  );

  const pickOverlapItem = useCallback(
    (item: OverlapPickerItem) => {
      setOverlapPicker(null);
      if (item.kind === "occurrence") onMarkerClick?.(item.id);
      else onCandidateClick?.(item.id);
    },
    [onMarkerClick, onCandidateClick]
  );

  const startMarkerDrag = useCallback(
    (e: React.PointerEvent, kind: MarkerKind, id: string, normalizedPosition: NormalizedRect) => {
      if (markerMode !== "select" || panActive) return;
      const canMove = kind === "occurrence" ? Boolean(onOccurrenceMove) : Boolean(onCandidateMove);
      if (!canMove) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setOverlapPicker(null);
      setMarkerDrag({
        kind,
        id,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originViewRect: toView(normalizedPosition),
        dxPx: 0,
        dyPx: 0,
        moved: false,
      });
    },
    [markerMode, panActive, onOccurrenceMove, onCandidateMove, toView]
  );

  const handleMarkerDragMove = useCallback((e: React.PointerEvent) => {
    setMarkerDrag((prev) => {
      if (!prev || prev.pointerId !== e.pointerId) return prev;
      const dxPx = e.clientX - prev.startClientX;
      const dyPx = e.clientY - prev.startClientY;
      const moved =
        prev.moved ||
        Math.abs(dxPx) > MARKER_DRAG_THRESHOLD_PX ||
        Math.abs(dyPx) > MARKER_DRAG_THRESHOLD_PX;
      return { ...prev, dxPx, dyPx, moved };
    });
  }, []);

  const handleMarkerDragEnd = useCallback(
    (e: React.PointerEvent) => {
      setMarkerDrag((prev) => {
        if (!prev || prev.pointerId !== e.pointerId) return null;
        if (prev.moved && canvasSize.width > 0 && canvasSize.height > 0) {
          const nextViewRect: NormalizedRect = {
            x: clamp01(prev.originViewRect.x + prev.dxPx / canvasSize.width),
            y: clamp01(prev.originViewRect.y + prev.dyPx / canvasSize.height),
            width: prev.originViewRect.width,
            height: prev.originViewRect.height,
          };
          const finalNormalized = fromView(nextViewRect);
          suppressClickRef.current = true;
          if (prev.kind === "occurrence") onOccurrenceMove?.(prev.id, finalNormalized);
          else onCandidateMove?.(prev.id, finalNormalized);
        }
        return null;
      });
    },
    [canvasSize, fromView, onOccurrenceMove, onCandidateMove]
  );

  const handleOccurrenceDeleteClick = useCallback(
    (o: DrawingOccurrence) => {
      if (!onOccurrenceDelete) return;
      onOccurrenceDelete(o.id);
    },
    [onOccurrenceDelete]
  );

  const handleCandidateDeleteClick = useCallback(
    (c: AnalyzeRegionCandidateDto) => {
      if (!onCandidateDelete) return;
      if (c.status === "confirmed") {
        const label = c.label_suggestions[0]?.label ?? t("takeoff.review.status.confirmed");
        const ok = window.confirm(
          `${t("takeoff.review.deleteConfirmedTitle")}\n${t("takeoff.review.deleteConfirmedBody", {
            name: label,
          })}`
        );
        if (!ok) return;
      }
      onCandidateDelete(c);
    },
    [onCandidateDelete, t]
  );

  const layerLabel = (key: TakeoffLayerKey) => t(`takeoff.layer.${key}`);

  if (!fileUrl) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
        {t("takeoff.viewer.noFile")}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-6 text-center space-y-3">
        <p className="text-sm text-foreground">{t("takeoff.viewer.loadError")}</p>
        {loadErrorDetail ? (
          <p className="mx-auto max-w-xl break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {loadErrorDetail}
          </p>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4 mr-1" />
            {t("takeoff.viewer.openExternal")}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        {/* Mode switch */}
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          {MODE_BUTTONS.filter(
            (b) =>
              (showAnalyzeRegionMode || b.mode !== "analyze_region") &&
              (allowMarking || (b.mode !== "point" && b.mode !== "rect" && b.mode !== "analyze_region"))
          ).map(({ mode, icon: Icon, labelKey }) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                markerMode === mode
                  ? mode === "analyze_region"
                    ? "bg-[#e06737] text-white"
                    : "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => onMarkerModeChange(mode)}
              aria-pressed={markerMode === mode}
              title={t(labelKey)}
              disabled={(analyzingRegion && mode !== "analyze_region") || scanningWholePage}
            >
              <Icon className="size-3.5" />
              <span className="hidden lg:inline">{t(labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Primary AI-detection CTAs — always visible next to the mode
            switcher so "I want AI to find symbols" never means "draw a box
            first". Both reuse analyze-region v2 and only create candidates. */}
        {showAnalyzeRegionMode && (onScanVisibleArea || onScanWholePage) ? (
          <div className="flex items-center gap-1">
            {onScanVisibleArea ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#e06737]/50 text-[#C9552B] hover:bg-[#e06737]/10"
                data-testid="scan-visible-area"
                disabled={analyzingRegion || scanningWholePage || !doc}
                onClick={handleScanVisibleArea}
                title={t("takeoff.viewer.scanVisibleArea")}
              >
                <ScanLine className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">{t("takeoff.viewer.scanVisibleArea")}</span>
              </Button>
            ) : null}
            {onScanWholePage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#e06737]/50 text-[#C9552B] hover:bg-[#e06737]/10"
                data-testid="scan-whole-page"
                disabled={analyzingRegion || scanningWholePage || !doc}
                onClick={() => onScanWholePage(page)}
                title={t("takeoff.viewer.scanWholePage")}
              >
                <LayoutGrid className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">
                  {scanningWholePage ? t("common.loading") : t("takeoff.viewer.scanWholePage")}
                </span>
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setZoom((z) => clampZoom(z - 0.25))}
            aria-label={t("takeoff.viewer.zoomOut")}
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-12 text-center text-xs font-semibold tabular-nums text-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setZoom((z) => clampZoom(z + 0.25))}
            aria-label={t("takeoff.viewer.zoomIn")}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* View: fit / rotate / reset */}
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={applyFitPage}
            title={`${t("takeoff.viewer.fitPage")} (F)`}
            aria-label={t("takeoff.viewer.fitPage")}
            data-testid="viewer-fit-page"
          >
            <Frame className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={applyFitWidth}
            title={`${t("takeoff.viewer.fitWidth")} (W)`}
            aria-label={t("takeoff.viewer.fitWidth")}
            data-testid="viewer-fit-width"
          >
            <MoveHorizontal className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => rotateBy(-90)}
            title={t("takeoff.viewer.rotateLeft")}
            aria-label={t("takeoff.viewer.rotateLeft")}
            data-testid="viewer-rotate-left"
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => rotateBy(90)}
            title={`${t("takeoff.viewer.rotateRight")} (R)`}
            aria-label={t("takeoff.viewer.rotateRight")}
            data-testid="viewer-rotate-right"
          >
            <RotateCw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={resetView}
            title={`${t("takeoff.viewer.resetView")} (0)`}
            aria-label={t("takeoff.viewer.resetView")}
            data-testid="viewer-reset"
          >
            <Undo2 className="size-4" />
          </Button>
          {rotation !== 0 ? (
            <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
              {rotation}°
            </span>
          ) : null}
        </div>

        {doc && doc.numPages > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label={t("takeoff.viewer.prevPage")}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {page} / {doc.numPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={page >= doc.numPages}
              onClick={() => setPage((p) => Math.min(doc.numPages, p + 1))}
              aria-label={t("takeoff.viewer.nextPage")}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {(regionCandidates.length > 0 || occurrences.length > 0) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1",
                highlightAll &&
                  "border-[#C400FF] bg-[#C400FF]/15 text-[#C400FF] hover:bg-[#C400FF]/25"
              )}
              data-testid="highlight-all-marks"
              onClick={() => setHighlightAll((v) => !v)}
              aria-pressed={highlightAll}
              title={t("takeoff.viewer.highlightAllHint")}
            >
              <Highlighter className="size-3.5" />
              <span className="hidden lg:inline">{t("takeoff.viewer.highlightAll")}</span>
            </Button>
          ) : null}
          {layersInUse.map((key) => {
            const hidden = hiddenLayers.has(key);
            return (
              <button
                key={key}
                type="button"
                className={cn(
                  "rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                  hidden
                    ? "bg-card text-muted-foreground"
                    : "border-primary bg-primary text-primary-foreground"
                )}
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
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={fileName ?? t("takeoff.viewer.openExternal")}
            >
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      {(markerMode !== "select" && markerMode !== "pan") ||
      analyzingRegion ||
      scanningWholePage ||
      highlightAll ||
      (markerMode === "select" &&
        (onOccurrenceMove || onCandidateMove) &&
        (pageOccurrences.length > 0 || pageCandidates.length > 0)) ? (
        <p
          className={cn(
            "border-b border-border px-3 py-1.5 text-xs text-foreground",
            highlightAll
              ? "bg-[#C400FF]/10"
              : markerMode === "analyze_region" || analyzingRegion || scanningWholePage
                ? "bg-[#e06737]/15"
                : "bg-primary/10"
          )}
          role="status"
        >
          {highlightAll
            ? t("takeoff.viewer.highlightAllHint")
            : scanningWholePage
              ? t("takeoff.viewer.scanWholePageLoading")
              : analyzingRegion
                ? t("takeoff.viewer.analyzeLoading")
                : markerMode === "point"
                  ? t("takeoff.viewer.pointHint")
                  : markerMode === "analyze_region"
                    ? t("takeoff.viewer.analyzeHint")
                    : markerMode === "select"
                      ? t("takeoff.viewer.dragMarkHint")
                      : t("takeoff.viewer.rectHint")}
        </p>
      ) : null}

      {/* Canvas + overlay */}
      <div
        ref={scrollRef}
        className={cn("relative overflow-auto bg-muted/60 p-2", heightClassName)}
      >
        {!doc || rendering ? (
          <div
            className="absolute inset-x-0 top-3 z-10 text-center text-xs text-muted-foreground"
            role="status"
          >
            {t("common.loading")}
          </div>
        ) : null}
        {/* w-max keeps scrollWidth = content so the LEFT edge stays reachable
            at high zoom; min-w-full keeps the page centered when it fits. */}
        <div className="w-max min-w-full">
          <div
            ref={overlayRef}
            className={cn(
              "relative mx-auto",
              panActive
                ? "cursor-grab touch-none"
                : markerMode !== "select" && "cursor-crosshair touch-none"
            )}
            style={{
              width: canvasSize.width || undefined,
              height: canvasSize.height || undefined,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <canvas ref={canvasRef} className="block shadow-sm" />

          {pageOccurrences.map((o) => {
            const style = occurrenceMarkerStyle(o);
            const isPicked = o.id === selectedOccurrenceId;
            const selected = highlightAll || isPicked;
            const isDragging = markerDrag?.kind === "occurrence" && markerDrag.id === o.id;
            const viewRect = isDragging
              ? {
                  x: clamp01(markerDrag.originViewRect.x + markerDrag.dxPx / (canvasSize.width || 1)),
                  y: clamp01(markerDrag.originViewRect.y + markerDrag.dyPx / (canvasSize.height || 1)),
                  width: markerDrag.originViewRect.width,
                  height: markerDrag.originViewRect.height,
                }
              : toView(o.normalizedPosition);
            const rect = normalizedToScreenRect(viewRect, canvasSize);
            const w = Math.max(OCCURRENCE_MARKER_MIN_PX, rect.width);
            const h = Math.max(OCCURRENCE_MARKER_MIN_PX, rect.height);
            return (
              <Fragment key={o.id}>
              <button
                type="button"
                className={cn(
                  "absolute rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "z-20",
                  selected && !isDragging && "animate-pulse",
                  isDragging && "z-40 cursor-grabbing",
                  markerMode === "select" && onOccurrenceMove && "cursor-grab",
                  markerMode !== "select" && "pointer-events-none"
                )}
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: w,
                  height: h,
                  opacity: style.opacity,
                  border: selected
                    ? `3px solid ${SELECTED_HIGHLIGHT_COLOR}`
                    : `2px ${style.dashed ? "dashed" : "solid"} ${style.color}`,
                  backgroundColor: selected
                    ? `${SELECTED_HIGHLIGHT_COLOR}55`
                    : `${style.color}1E`,
                  boxShadow: selected
                    ? `0 0 0 4px ${SELECTED_HIGHLIGHT_COLOR}aa, 0 0 14px 4px ${SELECTED_HIGHLIGHT_COLOR}`
                    : undefined,
                }}
                onPointerDown={(e) => startMarkerDrag(e, "occurrence", o.id, o.normalizedPosition)}
                onPointerMove={handleMarkerDragMove}
                onPointerUp={handleMarkerDragEnd}
                onClick={(e) => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  handleMarkerActivate("occurrence", o.id, e.clientX, e.clientY);
                }}
                title={o.label}
                aria-label={o.label}
              >
                <span
                  className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 py-px text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: selected ? SELECTED_HIGHLIGHT_COLOR : style.color,
                  }}
                >
                  {o.label}
                </span>
              </button>
              {isPicked && !isDragging ? (
                <SelectedLocatorPing centerX={rect.x + w / 2} centerY={rect.y + h / 2} />
              ) : null}
              {isPicked && !isDragging && markerMode === "select" && onOccurrenceDelete ? (
                <button
                  type="button"
                  className="absolute z-40 flex size-5 items-center justify-center rounded-full border border-white bg-red-600 text-white shadow hover:bg-red-700"
                  style={{ left: rect.x + w - 9, top: rect.y - 9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOccurrenceDeleteClick(o);
                  }}
                  title={t("takeoff.viewer.deleteMarkInline")}
                  aria-label={t("takeoff.viewer.deleteMarkInline")}
                >
                  <X className="size-3" />
                </button>
              ) : null}
              </Fragment>
            );
          })}

          {/* Region analyzer candidates — dashed = pending review, solid +
              checkmark = confirmed (counted, but still visible on the map). */}
          {pageCandidates.map((c) => {
            const color = CANDIDATE_LAYER_COLORS[c.color_layer] ?? CANDIDATE_LAYER_COLORS.unknown;
            const isPicked = c.id === selectedCandidateId;
            const selected = highlightAll || isPicked;
            const confirmed = c.status === "confirmed";
            const isDragging = markerDrag?.kind === "candidate" && markerDrag.id === c.id;
            const viewRect = isDragging
              ? {
                  x: clamp01(markerDrag.originViewRect.x + markerDrag.dxPx / (canvasSize.width || 1)),
                  y: clamp01(markerDrag.originViewRect.y + markerDrag.dyPx / (canvasSize.height || 1)),
                  width: markerDrag.originViewRect.width,
                  height: markerDrag.originViewRect.height,
                }
              : toView(c.normalized_position);
            const rect = normalizedToScreenRect(viewRect, canvasSize);
            const w = Math.max(CANDIDATE_MARKER_MIN_PX, rect.width);
            const h = Math.max(CANDIDATE_MARKER_MIN_PX, rect.height);
            const label = c.label_suggestions[0]?.label ?? c.color_layer;
            return (
              <Fragment key={c.id}>
              <button
                type="button"
                data-testid={
                  confirmed ? "takeoff-confirmed-marker" : "takeoff-region-candidate"
                }
                className={cn(
                  "absolute rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "z-30",
                  selected && !isDragging && "animate-pulse",
                  isDragging && "z-40 cursor-grabbing",
                  markerMode === "select" && onCandidateMove && "cursor-grab",
                  (isRectDrawMode || panActive) && "pointer-events-none"
                )}
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: w,
                  height: h,
                  border: selected
                    ? `3px solid ${SELECTED_HIGHLIGHT_COLOR}`
                    : `2px ${confirmed ? "solid" : "dashed"} ${color}`,
                  backgroundColor: selected
                    ? `${SELECTED_HIGHLIGHT_COLOR}55`
                    : `${color}${confirmed ? "30" : "22"}`,
                  boxShadow: selected
                    ? `0 0 0 4px ${SELECTED_HIGHLIGHT_COLOR}aa, 0 0 14px 4px ${SELECTED_HIGHLIGHT_COLOR}`
                    : undefined,
                }}
                onPointerDown={(e) => startMarkerDrag(e, "candidate", c.id, c.normalized_position)}
                onPointerMove={handleMarkerDragMove}
                onPointerUp={handleMarkerDragEnd}
                onClick={(e) => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  handleMarkerActivate("candidate", c.id, e.clientX, e.clientY);
                }}
                title={`${label} (${confirmed ? "✓" : `${Math.round(c.confidence * 100)}%`})`}
                aria-label={label}
              >
                {confirmed ? (
                  <CheckCircle2
                    className="absolute -right-1.5 -top-1.5 size-3.5 rounded-full bg-white"
                    style={{ color: selected ? SELECTED_HIGHLIGHT_COLOR : color }}
                  />
                ) : null}
              </button>
              {isPicked && !isDragging ? (
                <SelectedLocatorPing centerX={rect.x + w / 2} centerY={rect.y + h / 2} />
              ) : null}
              {isPicked && !isDragging && markerMode === "select" && onCandidateDelete ? (
                <button
                  type="button"
                  className="absolute z-40 flex size-5 items-center justify-center rounded-full border border-white bg-red-600 text-white shadow hover:bg-red-700"
                  style={{ left: rect.x + w - 9, top: rect.y - 9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCandidateDeleteClick(c);
                  }}
                  title={t("takeoff.viewer.deleteMarkInline")}
                  aria-label={t("takeoff.viewer.deleteMarkInline")}
                >
                  <X className="size-3" />
                </button>
              ) : null}
              </Fragment>
            );
          })}

          {/* Clustered/overlapping marks — disambiguation picker. */}
          {overlapPicker ? (
            <Fragment>
              <div
                className="fixed inset-0 z-40"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setOverlapPicker(null);
                }}
              />
              <div
                className="absolute z-50 min-w-[170px] max-w-[220px] rounded-md border border-border bg-popover p-1 shadow-lg"
                style={{
                  left: Math.max(0, Math.min(overlapPicker.x, canvasSize.width - 180)),
                  top: Math.max(0, Math.min(overlapPicker.y, canvasSize.height - 40)),
                }}
              >
                <p className="px-2 py-1 text-[10px] text-muted-foreground">
                  {t("takeoff.viewer.overlapPickerHint")}
                </p>
                {overlapPicker.items.map((item) => (
                  <button
                    key={`${item.kind}_${item.id}`}
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => pickOverlapItem(item)}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.confirmed ? (
                      <CheckCircle2 className="ml-auto size-3 shrink-0 text-emerald-600" />
                    ) : null}
                  </button>
                ))}
              </div>
            </Fragment>
          ) : null}

          {/* Rectangle draft while dragging */}
          {dragRect && canvasSize.width > 0 ? (
            <div
              className={cn(
                "pointer-events-none absolute border-2 border-dashed",
                markerMode === "analyze_region"
                  ? "border-[#e06737] bg-[#e067371A]"
                  : "border-[#2563EB] bg-[#2563EB1A]"
              )}
              style={{
                left: dragRect.x * canvasSize.width,
                top: dragRect.y * canvasSize.height,
                width: dragRect.width * canvasSize.width,
                height: dragRect.height * canvasSize.height,
              }}
            />
          ) : null}
          </div>
        </div>
      </div>

      {/* Color legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/40 px-3 py-2">
        {(
          [
            ["takeoff.legend.manual", OCCURRENCE_SOURCE_COLORS.manual],
            ["takeoff.legend.aiDetected", OCCURRENCE_SOURCE_COLORS.ai_detected],
            ["takeoff.legend.similar", OCCURRENCE_SOURCE_COLORS.similar_symbol_detected],
            ["takeoff.legend.confirmed", OCCURRENCE_STATUS_COLORS.confirmed ?? "#16A34A"],
            ["takeoff.legend.usedInQuote", OCCURRENCE_STATUS_COLORS.used_in_quote ?? "#14532D"],
            ["takeoff.legend.rejected", OCCURRENCE_STATUS_COLORS.rejected ?? "#94A3B8"],
          ] as Array<[string, string]>
        ).map(([key, color]) => (
          <span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {t(key)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Re-export for the workbench so screen positioning helpers stay in one place.
export { occurrenceColor };
