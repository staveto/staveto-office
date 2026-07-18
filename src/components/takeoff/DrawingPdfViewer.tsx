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
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { categoryColorForKey, categoryKeyForLabel } from "@/lib/takeoff/takeoffCategories";

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
/** Arrow-key pan distance (CSS px); Shift multiplies to ~a viewport. */
const ARROW_PAN_STEP_PX = 80;

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
   * "Skenovať AI (Gemini)" — vision-based whole-page detection, separate
   * opt-in action (costs money/time per call) from the free local scan
   * above. Understands symbol shape/context, so it catches tightly
   * clustered/touching symbols the local color-blob pipeline merges and
   * rejects. Always produces review-only candidates (source: "gemini").
   */
  onScanWholePageWithAi?: (pageNumber: number) => void;
  scanningWholePageWithAi?: boolean;
  /**
   * Evidence focus — jump to page + scroll/zoom bbox into view
   * when the user clicks a takeoff quantity evidence link.
   */
  focusEvidence?: {
    pageNumber: number;
    normalized: NormalizedRect;
    token: number;
  } | null;
  /**
   * Highlight this subset of candidate markers (a category from the panel)
   * with the selection glow — like "Zvýrazniť všetko", but for one group.
   */
  highlightedCandidateIds?: string[] | null;
  /**
   * Overrides the point-mode hint text — used by the rapid category-marking
   * workflow ("Klikaním pridávate: Svetlo — 6 ks").
   */
  pointModeHint?: string | null;
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
  onScanWholePageWithAi,
  scanningWholePageWithAi = false,
  focusEvidence = null,
  highlightedCandidateIds = null,
  pointModeHint = null,
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  /** Zoom value the CURRENT canvas was actually rendered at (not just requested). */
  const renderedZoomRef = useRef<number | null>(null);
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
      renderedZoomRef.current = zoom;
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

  // Changing zoom re-renders the canvas at a new pixel size, but the
  // browser keeps the OLD scrollLeft/Top — the visible content jumps to a
  // random-feeling spot and any scrollTo() issued in the same tick gets
  // clamped against the old canvas. Every zoom/centering request therefore
  // goes through a pending "view request" that is applied only AFTER the
  // canvas has re-rendered at the target zoom (canvasSize committed).
  const pendingViewRef = useRef<{
    zoom: number;
    /** View-space normalized (0..1) point on the page to anchor. */
    anchorNorm: { x: number; y: number };
    /** Where that point must land inside the container viewport (px). */
    anchorViewportPx: { x: number; y: number };
    smooth: boolean;
  } | null>(null);

  const applyPendingView = useCallback(() => {
    const pending = pendingViewRef.current;
    if (!pending) return;
    if (Math.abs(pending.zoom - zoom) > 0.001) return; // zoom state not landed yet
    // canvasSize must belong to a render AT the pending zoom — right after
    // setZoom the state matches but the canvas is still the old one, and
    // scrolling against it would land (and stay) in the wrong place.
    if (Math.abs((renderedZoomRef.current ?? -1) - pending.zoom) > 0.001) return;
    const container = scrollRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay || canvasSize.width === 0) return;
    pendingViewRef.current = null;
    // Overlay offset inside the scroll content (accounts for p-2 padding
    // and mx-auto centering) — measured AFTER the re-render, so it's the
    // offset that matches the new canvas size.
    const containerRect = container.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const overlayLeft = overlayRect.left - containerRect.left + container.scrollLeft;
    const overlayTop = overlayRect.top - containerRect.top + container.scrollTop;
    container.scrollTo({
      left: Math.max(
        0,
        overlayLeft + pending.anchorNorm.x * canvasSize.width - pending.anchorViewportPx.x
      ),
      top: Math.max(
        0,
        overlayTop + pending.anchorNorm.y * canvasSize.height - pending.anchorViewportPx.y
      ),
      behavior: pending.smooth ? "smooth" : "auto",
    });
  }, [zoom, canvasSize]);

  useEffect(() => {
    applyPendingView();
  }, [applyPendingView]);

  /** Set zoom + keep a page point anchored at a viewport position. */
  const requestView = useCallback(
    (
      nextZoom: number,
      anchorNorm: { x: number; y: number },
      anchorViewportPx?: { x: number; y: number },
      smooth = false
    ) => {
      const container = scrollRef.current;
      const clamped = clampZoom(nextZoom);
      const viewportPx =
        anchorViewportPx ??
        (container
          ? { x: container.clientWidth / 2, y: container.clientHeight / 2 }
          : { x: 0, y: 0 });
      pendingViewRef.current = { zoom: clamped, anchorNorm, anchorViewportPx: viewportPx, smooth };
      if (Math.abs(clamped - zoom) < 0.001) {
        // No re-render coming — apply the scroll straight away.
        applyPendingView();
      } else {
        setZoom(clamped);
      }
    },
    [zoom, applyPendingView]
  );

  /**
   * Zoom keeping the point under `clientPoint` (or the viewport centre)
   * visually fixed — the standard map-like zoom, instead of letting the
   * content drift toward the top-left on every step.
   */
  const zoomAt = useCallback(
    (nextZoom: number, clientPoint?: { x: number; y: number }) => {
      const container = scrollRef.current;
      const overlay = overlayRef.current;
      if (!container || !overlay || canvasSize.width === 0) {
        setZoom(clampZoom(nextZoom));
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const client =
        clientPoint ?? {
          x: containerRect.left + container.clientWidth / 2,
          y: containerRect.top + container.clientHeight / 2,
        };
      const overlayRect = overlay.getBoundingClientRect();
      const anchorNorm = {
        x: clamp01((client.x - overlayRect.left) / Math.max(1, overlayRect.width)),
        y: clamp01((client.y - overlayRect.top) / Math.max(1, overlayRect.height)),
      };
      requestView(nextZoom, anchorNorm, {
        x: client.x - containerRect.left,
        y: client.y - containerRect.top,
      });
    },
    [canvasSize, requestView]
  );

  // Ctrl/Cmd + mouse wheel zooms at the cursor (matches every PDF/map tool).
  // Native listener because React's onWheel is passive and can't preventDefault.
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  const zoomStateRef = useRef(zoom);
  zoomStateRef.current = zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      zoomAtRef.current(zoomStateRef.current * factor, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const applyFitWidth = useCallback(() => {
    // Baseline scale is fit-width by construction.
    pendingViewRef.current = null;
    setZoom(1);
  }, []);

  const applyFitPage = useCallback(() => {
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0 || zoom <= 0) return;
    const baseCss = { width: canvasSize.width / zoom, height: canvasSize.height / zoom };
    const nextZoom = clampZoom(
      fitPageZoom(baseCss, {
        width: container.clientWidth,
        height: container.clientHeight,
      })
    );
    // Centre the page, not just resize it — "fit" landing on a corner reads
    // as broken zoom.
    requestView(nextZoom, { x: 0.5, y: 0.5 });
  }, [canvasSize, zoom, requestView]);

  const resetView = useCallback(() => {
    pendingViewRef.current = null;
    setZoom(1);
    setRotation(0);
    scrollRef.current?.scrollTo({ left: 0, top: 0 });
  }, []);

  const rotateBy = useCallback((delta: 90 | -90) => {
    // Anchor points are view-space; a rotation invalidates them.
    pendingViewRef.current = null;
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
    // Arrow keys pan the plan (Shift = big steps). Handled explicitly so
    // panning works regardless of which inner element holds focus.
    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown"
    ) {
      const container = scrollRef.current;
      if (!container) return;
      const step = e.shiftKey
        ? Math.max(120, Math.round(container.clientHeight * 0.75))
        : ARROW_PAN_STEP_PX;
      container.scrollBy({
        left: e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
        top: e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        behavior: "auto",
      });
      e.preventDefault();
      return;
    }
    if (e.key === "PageUp") {
      setPage((p) => Math.max(1, p - 1));
    } else if (e.key === "PageDown") {
      setPage((p) => Math.min(doc?.numPages ?? p, p + 1));
    } else if (e.key === "Escape") {
      setOverlapPicker(null);
      setDragRect(null);
      dragStartRef.current = null;
      if (highlightAll) setHighlightAll(false);
      // Esc also leaves any marking mode — the universal "stop what I'm
      // doing" for the rapid category-marking workflow.
      if (markerMode !== "select") onMarkerModeChange("select");
    } else if ((e.key === "Delete" || e.key === "Backspace") && markerMode === "select") {
      // Delete the currently selected mark — same paths (incl. the
      // confirmation for confirmed symbols) as the inline X button.
      const cand = selectedCandidateId
        ? regionCandidates.find((c) => c.id === selectedCandidateId)
        : null;
      const occ = selectedOccurrenceId
        ? occurrences.find((o) => o.id === selectedOccurrenceId)
        : null;
      if (cand && onCandidateDelete) {
        handleCandidateDeleteClick(cand);
      } else if (occ && onOccurrenceDelete) {
        handleOccurrenceDeleteClick(occ);
      } else {
        return;
      }
    } else if (e.key === "+" || e.key === "=") {
      zoomAt(zoom * 1.25);
    } else if (e.key === "-") {
      zoomAt(zoom / 1.25);
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
    if (
      markerMode === "select" ||
      !onMarkerDrawn ||
      analyzingRegion ||
      scanningWholePage ||
      scanningWholePageWithAi
    )
      return;
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
      scanningWholePage ||
      scanningWholePageWithAi
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

  // Category highlight from the panel ("Zvýrazniť" on a grouped position).
  const highlightedIdSet = useMemo(
    () => new Set(highlightedCandidateIds ?? []),
    [highlightedCandidateIds]
  );

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

  // Turning "highlight all" on must actually bring everything into view —
  // a toggle that only re-styles markers still off-screen or too zoomed-in
  // to see looks like it did nothing. Zoom-to-fit + center the union of all
  // markers on the current page, once per (page, on) — never fights the
  // user's own zoom/scroll again afterwards while it stays on.
  const lastHighlightAllFitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightAll) {
      lastHighlightAllFitKeyRef.current = null;
      return;
    }
    if (lastHighlightAllFitKeyRef.current === String(page)) return;
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0) return;

    const rects = [
      ...pageOccurrences.map((o) => toView(o.normalizedPosition)),
      ...pageCandidates
        .map((c) => (c.normalized_position ? toView(c.normalized_position) : null))
        .filter((r): r is NormalizedRect => r !== null),
    ];
    if (rects.length === 0) return;
    lastHighlightAllFitKeyRef.current = String(page);

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const r of rects) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width);
      maxY = Math.max(maxY, r.y + r.height);
    }
    // canvasSize already includes the current zoom — divide it out to get
    // zoom-independent CSS pixel dimensions of the (unzoomed) page.
    const baseWidth = canvasSize.width / zoom;
    const baseHeight = canvasSize.height / zoom;
    const spanWidthPx = Math.max(1, (maxX - minX) * baseWidth);
    const spanHeightPx = Math.max(1, (maxY - minY) * baseHeight);
    const padPx = 96;
    const fitZoom = Math.min(
      (container.clientWidth - padPx) / spanWidthPx,
      (container.clientHeight - padPx) / spanHeightPx
    );
    const nextZoom = Math.min(3, Math.max(0.5, fitZoom));
    // Centre the union of all marks — via the pending-view queue so the
    // scroll happens AFTER the canvas re-rendered at the new zoom (a direct
    // scrollTo would be clamped against the old canvas size).
    requestView(
      nextZoom,
      { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      undefined,
      true
    );
  }, [highlightAll, page, canvasSize, zoom, pageOccurrences, pageCandidates, toView, requestView]);

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
        const catLabel = c.label_suggestions[0]?.label;
        const color =
          c.status === "confirmed" && catLabel
            ? categoryColorForKey(categoryKeyForLabel(catLabel))
            : CANDIDATE_LAYER_COLORS[c.color_layer] ?? CANDIDATE_LAYER_COLORS.unknown;
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

  // Deleting from the plan ALWAYS asks first — via an in-app dialog, never
  // window.confirm (browsers may silently suppress repeated native dialogs,
  // which made the (x) look completely broken).
  const [deleteAsk, setDeleteAsk] = useState<
    | { kind: "occurrence"; id: string; label: string }
    | { kind: "candidate"; candidate: AnalyzeRegionCandidateDto; label: string }
    | null
  >(null);

  const handleOccurrenceDeleteClick = useCallback(
    (o: DrawingOccurrence) => {
      if (!onOccurrenceDelete) return;
      setDeleteAsk({ kind: "occurrence", id: o.id, label: o.label });
    },
    [onOccurrenceDelete]
  );

  const handleCandidateDeleteClick = useCallback(
    (c: AnalyzeRegionCandidateDto) => {
      if (!onCandidateDelete) return;
      setDeleteAsk({
        kind: "candidate",
        candidate: c,
        label: c.label_suggestions[0]?.label ?? c.color_layer,
      });
    },
    [onCandidateDelete]
  );

  const confirmDeleteAsk = useCallback(() => {
    if (!deleteAsk) return;
    if (deleteAsk.kind === "occurrence") onOccurrenceDelete?.(deleteAsk.id);
    else onCandidateDelete?.(deleteAsk.candidate);
    setDeleteAsk(null);
  }, [deleteAsk, onOccurrenceDelete, onCandidateDelete]);

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
      ref={rootRef}
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
              disabled={
                (analyzingRegion && mode !== "analyze_region") ||
                scanningWholePage ||
                scanningWholePageWithAi
              }
            >
              <Icon className="size-3.5" />
              <span className="hidden lg:inline">{t(labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Primary AI-detection CTAs — always visible next to the mode
            switcher so "I want AI to find symbols" never means "draw a box
            first". Both reuse analyze-region v2 and only create candidates. */}
        {showAnalyzeRegionMode && (onScanVisibleArea || onScanWholePage || onScanWholePageWithAi) ? (
          <div className="flex items-center gap-1">
            {onScanVisibleArea ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#e06737]/50 text-[#C9552B] hover:bg-[#e06737]/10"
                data-testid="scan-visible-area"
                disabled={analyzingRegion || scanningWholePage || scanningWholePageWithAi || !doc}
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
                disabled={analyzingRegion || scanningWholePage || scanningWholePageWithAi || !doc}
                onClick={() => onScanWholePage(page)}
                title={t("takeoff.viewer.scanWholePage")}
              >
                <LayoutGrid className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">
                  {scanningWholePage ? t("common.loading") : t("takeoff.viewer.scanWholePage")}
                </span>
              </Button>
            ) : null}
            {onScanWholePageWithAi ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-violet-400/60 text-violet-700 hover:bg-violet-100"
                data-testid="scan-whole-page-ai"
                disabled={analyzingRegion || scanningWholePage || scanningWholePageWithAi || !doc}
                onClick={() => onScanWholePageWithAi(page)}
                title={t("takeoff.viewer.scanWholePageAi")}
              >
                <Sparkles className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">
                  {scanningWholePageWithAi ? t("common.loading") : t("takeoff.viewer.scanWholePageAi")}
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
            onClick={() => zoomAt(zoom / 1.25)}
            title={`${t("takeoff.viewer.zoomOut")} (-)`}
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
            onClick={() => zoomAt(zoom * 1.25)}
            title={`${t("takeoff.viewer.zoomIn")} (+)`}
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
      scanningWholePageWithAi ||
      highlightAll ||
      (markerMode === "select" &&
        (onOccurrenceMove || onCandidateMove) &&
        (pageOccurrences.length > 0 || pageCandidates.length > 0)) ? (
        <p
          className={cn(
            "border-b border-border px-3 py-1.5 text-xs text-foreground",
            highlightAll
              ? "bg-[#C400FF]/10"
              : scanningWholePageWithAi
                ? "bg-violet-100"
                : markerMode === "analyze_region" || analyzingRegion || scanningWholePage
                  ? "bg-[#e06737]/15"
                  : "bg-primary/10"
          )}
          role="status"
        >
          {highlightAll
            ? t("takeoff.viewer.highlightAllHint")
            : scanningWholePageWithAi
              ? t("takeoff.viewer.scanWholePageAiLoading")
              : scanningWholePage
                ? t("takeoff.viewer.scanWholePageLoading")
                : analyzingRegion
                  ? t("takeoff.viewer.analyzeLoading")
                  : markerMode === "point"
                    ? pointModeHint ?? t("takeoff.viewer.pointHint")
                    : markerMode === "analyze_region"
                      ? t("takeoff.viewer.analyzeHint")
                      : markerMode === "select"
                        ? `${t("takeoff.viewer.dragMarkHint")} ${t("takeoff.viewer.keyboardHint")}`
                        : t("takeoff.viewer.rectHint")}
        </p>
      ) : null}

      {/* Canvas + overlay */}
      <div
        ref={scrollRef}
        className={cn("relative overflow-auto bg-muted/60 p-2", heightClassName)}
        onPointerDown={() => {
          // Any interaction with the plan arms the keyboard shortcuts
          // (arrows/+/-/Del…) without requiring an explicit Tab-focus first.
          const root = rootRef.current;
          if (root && !root.contains(document.activeElement)) {
            root.focus({ preventScroll: true });
          }
        }}
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
            const glowColor = isPicked ? SELECTED_HIGHLIGHT_COLOR : style.color;
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
                    ? `3px solid ${glowColor}`
                    : `2px ${style.dashed ? "dashed" : "solid"} ${style.color}`,
                  backgroundColor: selected
                    ? `${glowColor}55`
                    : `${style.color}1E`,
                  boxShadow: selected
                    ? `0 0 0 4px ${glowColor}aa, 0 0 14px 4px ${glowColor}`
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
                    backgroundColor: selected ? glowColor : style.color,
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
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
              checkmark = confirmed (counted, but still visible on the map).
              Confirmed marks are colored by their CATEGORY (operator
              position), so different socket/light/switch types are visually
              distinct on the plan; unconfirmed keep the detection layer color. */}
          {pageCandidates.map((c) => {
            const confirmed = c.status === "confirmed";
            const categoryLabel = c.label_suggestions[0]?.label;
            const color = confirmed && categoryLabel
              ? categoryColorForKey(categoryKeyForLabel(categoryLabel))
              : CANDIDATE_LAYER_COLORS[c.color_layer] ?? CANDIDATE_LAYER_COLORS.unknown;
            const isPicked = c.id === selectedCandidateId;
            const selected = highlightAll || isPicked || highlightedIdSet.has(c.id);
            // Group highlights ("Zvýrazniť všetko" / category toggles) glow in
            // the mark's OWN category color so different positions stay
            // distinguishable; magenta is reserved for the single picked mark.
            const glowColor = isPicked ? SELECTED_HIGHLIGHT_COLOR : color;
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
                    ? `3px solid ${glowColor}`
                    : `2px ${confirmed ? "solid" : "dashed"} ${color}`,
                  backgroundColor: selected
                    ? `${glowColor}55`
                    : `${color}${confirmed ? "30" : "22"}`,
                  boxShadow: selected
                    ? `0 0 0 4px ${glowColor}aa, 0 0 14px 4px ${glowColor}`
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
                    style={{ color: selected ? glowColor : color }}
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
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
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

      {/* Inline (x) delete — always confirm before removing anything. */}
      <Dialog
        open={!!deleteAsk}
        onOpenChange={(open) => {
          if (!open) setDeleteAsk(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.viewer.deleteAskTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteAsk?.kind === "candidate" &&
            deleteAsk.candidate.status === "confirmed"
              ? t("takeoff.review.deleteConfirmedBody", { name: deleteAsk.label })
              : t("takeoff.viewer.deleteAskBody", { name: deleteAsk?.label ?? "" })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteAsk(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="viewer-confirm-delete"
              onClick={confirmDeleteAsk}
            >
              <Trash2 className="mr-1 size-3.5" />
              {t("takeoff.review.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Re-export for the workbench so screen positioning helpers stay in one place.
export { occurrenceColor };
