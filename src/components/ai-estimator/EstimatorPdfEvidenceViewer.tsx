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
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
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

const LAYER_STYLE: Record<
  PdfOverlayColorKey,
  { border: string; bg: string; chip: string }
> = {
  socket: { border: "#16A34A", bg: "rgba(22,163,74,0.12)", chip: "#16A34A" },
  switch: { border: "#DC2626", bg: "rgba(220,38,38,0.12)", chip: "#DC2626" },
  lighting: { border: "#EA580C", bg: "rgba(234,88,12,0.12)", chip: "#EA580C" },
  led: { border: "#0891B2", bg: "rgba(8,145,178,0.12)", chip: "#0891B2" },
  cabling: { border: "#2563EB", bg: "rgba(37,99,235,0.12)", chip: "#2563EB" },
  unknown: { border: "#64748B", bg: "rgba(100,116,139,0.12)", chip: "#64748B" },
  warning: { border: "#D97706", bg: "rgba(217,119,6,0.16)", chip: "#D97706" },
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

type Props = {
  fileUrl: string | null;
  fileName?: string;
  annotations: PdfOverlayAnnotation[];
  selectedPositionId?: string | null;
  onAnnotationClick?: (positionId: string | null, annotationId: string) => void;
  /**
   * Marking mode: clicking the plan places a point mark, dragging traces a
   * freehand shape. Used by the marking checklist.
   */
  markMode?: boolean;
  onMarkPlaced?: (
    page: number,
    bbox: EstimatorPositionBBox,
    polygon?: Pt[]
  ) => void;
  /** Delete a manual mark (× button on marks of the selected position). */
  onMarkDeleted?: (positionId: string, anchorId: string) => void;
  /** Pinpoint one mark (click in checklist). */
  selectedAnchorId?: string | null;
  onAnchorClick?: (anchorId: string) => void;
  /** Compact height for embedding under other panels. */
  heightClassName?: string;
};

/** Default highlight box when user clicks without dragging (fraction of page). */
const DEFAULT_MARK_FRAC = 0.028;
/** Minimum drag (px) before we treat pointer-up as a rectangle, not a click. */
const DRAG_THRESHOLD_PX = 8;

export function EstimatorPdfEvidenceViewer({
  fileUrl,
  fileName,
  annotations,
  selectedPositionId,
  onAnnotationClick,
  markMode = false,
  onMarkPlaced,
  onMarkDeleted,
  selectedAnchorId,
  onAnchorClick,
  heightClassName = "h-[520px]",
}: Props) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [hiddenLayers, setHiddenLayers] = useState<Set<PdfOverlayColorKey>>(new Set());
  /** Live rectangle while user drags around a symbol. */
  const [drawRect, setDrawRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const baseScaleRef = useRef(1);
  const drawingRef = useRef(false);
  const rectStartRef = useRef<Pt | null>(null);
  const drawRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

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

  // Render the current page.
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({
        scale: fit * zoom * dpr,
        rotation: totalRotation,
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
      // Cancelled render or transient failure — the next render pass recovers.
    } finally {
      setRendering(false);
    }
  }, [doc, page, zoom, rotation]);

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

  const layersInUse = useMemo(() => {
    const used = new Set(annotations.map((a) => a.colorKey));
    return LAYER_ORDER.filter((l) => used.has(l));
  }, [annotations]);

  // When a position or anchor is selected — jump to it on the plan.
  useEffect(() => {
    const targetId = selectedAnchorId
      ? `ann_${selectedAnchorId}`
      : selectedPositionId
        ? annotations.find((a) => a.positionId === selectedPositionId && a.bbox)?.id
        : null;
    if (!targetId) return;
    const target = annotations.find((a) => a.id === targetId && a.bbox);
    if (!target) return;
    if (target.page !== page) setPage(target.page);
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0) return;
    const shown = rotateBBox(target.bbox, rotation);
    const cx = (shown.x + shown.width / 2) * canvasSize.width;
    const cy = (shown.y + shown.height / 2) * canvasSize.height;
    container.scrollTo({
      left: Math.max(0, cx - container.clientWidth / 2),
      top: Math.max(0, cy - container.clientHeight / 2),
      behavior: "smooth",
    });
  }, [selectedPositionId, selectedAnchorId, annotations, page, canvasSize, rotation]);

  const layerLabel = (key: PdfOverlayColorKey) =>
    t(`projects.aiSetup.pdf.layer.${key}`);

  // ---- Rectangle lasso marking (drag around symbol → highlighted shape) ----

  const overlayPointFromEvent = (e: React.PointerEvent): Pt | null => {
    const el = overlayRef.current;
    if (!el || canvasSize.width === 0) return null;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > canvasSize.width || py > canvasSize.height) return null;
    return { x: px, y: py };
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
      // Click without drag → centered default highlight box.
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
    onMarkPlaced(page, bboxOfPoints(stored), stored);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!markMode || !onMarkPlaced) return;
    if ((e.target as HTMLElement).closest("[data-mark-ui]")) return;
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
    if (!drawingRef.current || !rectStartRef.current) return;
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
    placeMarkFromRect(r.x1, r.y1, r.x2, r.y2);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (drawingRef.current) {
      overlayRef.current?.releasePointerCapture(e.pointerId);
      finishDrawing();
    }
  };

  /** Polygon points for SVG — from stored polygon or bbox corners. */
  const markPolygonPx = (
    a: PdfOverlayAnnotation
  ): string | null => {
    if (a.polygon && a.polygon.length >= 3) {
      return a.polygon
        .map((p) => rotatePoint(p, rotation))
        .map((p) => `${(p.x * canvasSize.width).toFixed(1)},${(p.y * canvasSize.height).toFixed(1)}`)
        .join(" ");
    }
    if (a.bbox) {
      const b = rotateBBox(a.bbox, rotation);
      const pts = [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y },
        { x: b.x + b.width, y: b.y + b.height },
        { x: b.x, y: b.y + b.height },
      ];
      return pts
        .map((p) => `${(p.x * canvasSize.width).toFixed(1)},${(p.y * canvasSize.height).toFixed(1)}`)
        .join(" ");
    }
    return null;
  };

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
            className="h-8 w-8 p-0 border-[#CBD5E1]"
            onClick={() => setRotation((r) => normRot(r + 90))}
            aria-label={t("projects.aiSetup.pdf.rotate")}
            title={t("projects.aiSetup.pdf.rotate")}
          >
            <RotateCw className="size-4" />
          </Button>
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
        <div className="ml-auto flex flex-wrap items-center gap-1">
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

      {/* Canvas + overlay */}
      <div
        ref={scrollRef}
        className={cn("relative overflow-auto bg-[#EEF2F7] p-2", heightClassName)}
      >
        {!doc || rendering ? (
          <div className="absolute inset-x-0 top-3 z-10 text-center text-xs text-[#64748B]" role="status">
            {t("common.loading")}
          </div>
        ) : null}
        <div
          ref={overlayRef}
          className={cn("relative mx-auto", markMode && "cursor-crosshair")}
          style={{
            width: canvasSize.width || undefined,
            height: canvasSize.height || undefined,
            touchAction: markMode ? "none" : undefined,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <canvas ref={canvasRef} className="block shadow-sm" />

          {/* All manual marks + live rectangle preview (SVG) */}
          {canvasSize.width > 0 ? (
            <svg
              className="pointer-events-none absolute inset-0 z-10"
              width={canvasSize.width}
              height={canvasSize.height}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            >
              {pageAnnotations.map((a) => {
                if (!a.isManualMark) return null;
                const pts = markPolygonPx(a);
                if (!pts) return null;
                const style = LAYER_STYLE[a.colorKey];
                const isSelectedPos = a.positionId === selectedPositionId;
                const isSelectedAnchor = selectedAnchorId
                  ? a.evidenceAnchorId === selectedAnchorId
                  : a.selected;
                const dimmed =
                  (selectedPositionId && !isSelectedPos) ||
                  (selectedAnchorId && !isSelectedAnchor);
                const fill = isSelectedAnchor
                  ? style.bg.replace("0.12", "0.45")
                  : isSelectedPos
                    ? style.bg.replace("0.12", "0.35")
                    : style.bg.replace("0.12", "0.22");
                return (
                  <g
                    key={a.id}
                    opacity={dimmed ? 0.2 : 1}
                    className={cn(!markMode && "pointer-events-auto cursor-pointer")}
                    onClick={() => {
                      if (!markMode) {
                        onAnchorClick?.(a.evidenceAnchorId);
                        onAnnotationClick?.(a.positionId ?? null, a.id);
                      }
                    }}
                  >
                    <polygon
                      points={pts}
                      fill={fill}
                      stroke={style.border}
                      strokeWidth={isSelectedAnchor ? 3.5 : isSelectedPos ? 3 : 2}
                      strokeLinejoin="round"
                      style={
                        isSelectedAnchor
                          ? { filter: `drop-shadow(0 0 6px ${style.border})` }
                          : undefined
                      }
                    />
                    {isSelectedPos ? (
                      <text
                        x={
                          a.bbox
                            ? (rotateBBox(a.bbox, rotation).x +
                                rotateBBox(a.bbox, rotation).width / 2) *
                              canvasSize.width
                            : 0
                        }
                        y={
                          a.bbox
                            ? rotateBBox(a.bbox, rotation).y * canvasSize.height - 4
                            : 0
                        }
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                        fill={style.chip}
                        fontSize={11}
                        fontWeight={700}
                      >
                        {a.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {drawRect ? (
                <rect
                  x={Math.min(drawRect.x1, drawRect.x2)}
                  y={Math.min(drawRect.y1, drawRect.y2)}
                  width={Math.abs(drawRect.x2 - drawRect.x1)}
                  height={Math.abs(drawRect.y2 - drawRect.y1)}
                  fill="rgba(233,95,42,0.2)"
                  stroke="#E95F2A"
                  strokeWidth={2.5}
                  strokeDasharray="5 3"
                  rx={2}
                />
              ) : null}
            </svg>
          ) : null}

          {pageAnnotations.map((a) => {
            const style = LAYER_STYLE[a.colorKey];
            const isSelectedPos = a.positionId === selectedPositionId;
            const isSelectedAnchor = selectedAnchorId
              ? a.evidenceAnchorId === selectedAnchorId
              : a.selected;
            const shown = rotateBBox(a.bbox, rotation);
            const left = shown.x * canvasSize.width;
            const top = shown.y * canvasSize.height;
            const w = Math.max(10, shown.width * canvasSize.width);
            const h = Math.max(10, shown.height * canvasSize.height);

            // Manual marks are drawn in the SVG layer above.
            if (a.isManualMark) {
              const deleteButton =
                (isSelectedPos || isSelectedAnchor) && onMarkDeleted && a.positionId ? (
                  <button
                    key={`${a.id}_del`}
                    type="button"
                    data-mark-ui
                    className="absolute z-30 grid size-5 place-items-center rounded-full bg-[#DC2626] text-white shadow hover:bg-[#B91C1C]"
                    style={{ left: left + w - 8, top: top - 8 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkDeleted(a.positionId!, a.evidenceAnchorId);
                    }}
                    title={t("projects.aiSetup.marking.deleteMark")}
                    aria-label={t("projects.aiSetup.marking.deleteMark")}
                  >
                    <X className="size-3" />
                  </button>
                ) : null;
              return deleteButton;
            }

            const dimmed = selectedPositionId && !isSelectedPos;
            const selected = isSelectedAnchor || isSelectedPos;

            return (
              <span key={a.id} className="contents" style={{ opacity: dimmed ? 0.25 : 1 }}>
                <button
                  type="button"
                  className={cn(
                    "absolute rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2A4D]",
                    selected && "z-20",
                    markMode && "pointer-events-none"
                  )}
                  style={{
                    left,
                    top,
                    width: w,
                    height: h,
                    border: `2px ${a.needsReview ? "dashed" : "solid"} ${style.border}`,
                    backgroundColor: selected ? style.bg.replace("0.12", "0.35") : style.bg,
                    boxShadow: selected ? `0 0 0 4px ${style.border}88` : undefined,
                  }}
                  onClick={() => {
                    onAnnotationClick?.(a.positionId ?? null, a.id);
                  }}
                  title={a.label}
                  aria-label={`${a.label} — ${layerLabel(a.colorKey)}`}
                >
                  <span
                    className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 py-px text-[10px] font-bold text-white"
                    style={{ backgroundColor: style.chip }}
                  >
                    {a.label}
                  </span>
                </button>
              </span>
            );
          })}
        </div>
      </div>

      {annotations.length === 0 ? (
        <p className="border-t border-[#E2E8F0] bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("projects.aiSetup.pdf.noBboxHint")}
        </p>
      ) : null}
    </div>
  );
}
