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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Undo2,
  CheckCircle2,
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
  /** Region-analyzer candidates (Phase 1 overlays — not quote quantities). */
  regionCandidates?: AnalyzeRegionCandidateDto[];
  selectedCandidateId?: string | null;
  onCandidateClick?: (candidateId: string) => void;
  showAnalyzeRegionMode?: boolean;
  /** When false, manual marking modes (point/rect) are hidden (read-only). */
  allowMarking?: boolean;
  /** Page to open initially (deep link). */
  initialPage?: number;
  analyzingRegion?: boolean;
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
  regionCandidates = [],
  selectedCandidateId = null,
  onCandidateClick,
  showAnalyzeRegionMode = true,
  allowMarking = true,
  initialPage,
  analyzingRegion = false,
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
  const [dragRect, setDragRect] = useState<NormalizedRect | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
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
    if (markerMode === "select" || !onMarkerDrawn || analyzingRegion) return;
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
      analyzingRegion
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
              disabled={analyzingRegion && mode !== "analyze_region"}
            >
              <Icon className="size-3.5" />
              <span className="hidden lg:inline">{t(labelKey)}</span>
            </button>
          ))}
        </div>

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

      {(markerMode !== "select" && markerMode !== "pan") || analyzingRegion ? (
        <p
          className={cn(
            "border-b border-border px-3 py-1.5 text-xs text-foreground",
            markerMode === "analyze_region" || analyzingRegion
              ? "bg-[#e06737]/15"
              : "bg-primary/10"
          )}
          role="status"
        >
          {analyzingRegion
            ? t("takeoff.viewer.analyzeLoading")
            : markerMode === "point"
              ? t("takeoff.viewer.pointHint")
              : markerMode === "analyze_region"
                ? t("takeoff.viewer.analyzeHint")
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
            const selected = o.id === selectedOccurrenceId;
            const rect = normalizedToScreenRect(toView(o.normalizedPosition), canvasSize);
            const w = Math.max(12, rect.width);
            const h = Math.max(12, rect.height);
            return (
              <button
                key={o.id}
                type="button"
                className={cn(
                  "absolute rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "z-20",
                  markerMode !== "select" && "pointer-events-none"
                )}
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: w,
                  height: h,
                  opacity: style.opacity,
                  border: `2px ${style.dashed ? "dashed" : "solid"} ${style.color}`,
                  backgroundColor: selected ? `${style.color}40` : `${style.color}1E`,
                  boxShadow: selected ? `0 0 0 3px ${style.color}55` : undefined,
                }}
                onClick={() => onMarkerClick?.(o.id)}
                title={o.label}
                aria-label={o.label}
              >
                <span
                  className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 py-px text-[10px] font-bold text-white"
                  style={{ backgroundColor: style.color }}
                >
                  {o.label}
                </span>
              </button>
            );
          })}

          {/* Region analyzer candidates — dashed = pending review, solid +
              checkmark = confirmed (counted, but still visible on the map). */}
          {pageCandidates.map((c) => {
            const color = CANDIDATE_LAYER_COLORS[c.color_layer] ?? CANDIDATE_LAYER_COLORS.unknown;
            const selected = c.id === selectedCandidateId;
            const confirmed = c.status === "confirmed";
            const rect = normalizedToScreenRect(toView(c.normalized_position), canvasSize);
            const w = Math.max(10, rect.width);
            const h = Math.max(10, rect.height);
            const label = c.label_suggestions[0]?.label ?? c.color_layer;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={
                  confirmed ? "takeoff-confirmed-marker" : "takeoff-region-candidate"
                }
                className={cn(
                  "absolute rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "z-30",
                  (isRectDrawMode || panActive) && "pointer-events-none"
                )}
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: w,
                  height: h,
                  border: `2px ${confirmed ? "solid" : "dashed"} ${color}`,
                  backgroundColor: selected ? `${color}55` : `${color}${confirmed ? "30" : "22"}`,
                  boxShadow: selected ? `0 0 0 3px ${color}66` : undefined,
                }}
                onClick={() => onCandidateClick?.(c.id)}
                title={`${label} (${confirmed ? "✓" : `${Math.round(c.confidence * 100)}%`})`}
                aria-label={label}
              >
                {confirmed ? (
                  <CheckCircle2
                    className="absolute -right-1.5 -top-1.5 size-3.5 rounded-full bg-white"
                    style={{ color }}
                  />
                ) : null}
              </button>
            );
          })}

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
