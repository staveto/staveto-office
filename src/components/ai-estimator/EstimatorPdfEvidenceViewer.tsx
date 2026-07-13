"use client";

/**
 * Interactive PDF evidence viewer for the AI estimator.
 *
 * Renders the uploaded PDF via pdf.js on a canvas and draws overlay
 * annotations (E-ZAS-001, …) on top. Clicking an annotation selects the
 * linked takeoff position; selecting a list row highlights + scrolls to
 * the annotation. Layers can be toggled per symbol type.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Minus, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type {
  PdfOverlayAnnotation,
  PdfOverlayColorKey,
} from "@/types/estimatorPositions";

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
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

type Props = {
  fileUrl: string | null;
  fileName?: string;
  annotations: PdfOverlayAnnotation[];
  selectedPositionId?: string | null;
  onAnnotationClick?: (positionId: string | null, annotationId: string) => void;
  /** Compact height for embedding under other panels. */
  heightClassName?: string;
};

export function EstimatorPdfEvidenceViewer({
  fileUrl,
  fileName,
  annotations,
  selectedPositionId,
  onAnnotationClick,
  heightClassName = "h-[520px]",
}: Props) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [hiddenLayers, setHiddenLayers] = useState<Set<PdfOverlayColorKey>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const baseScaleRef = useRef(1);

  // Load the document.
  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    let loaded: PdfDocument | null = null;
    setLoadError(false);
    setDoc(null);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const task = pdfjs.getDocument({ url: fileUrl });
        loaded = (await task.promise) as unknown as PdfDocument;
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setDoc(loaded);
        setPage(1);
      } catch {
        if (!cancelled) setLoadError(true);
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
      const containerWidth = scrollRef.current.clientWidth - 16;
      const probe = pdfPage.getViewport({ scale: 1 });
      const fit = containerWidth > 100 ? containerWidth / probe.width : 1;
      baseScaleRef.current = fit;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: fit * zoom * dpr });
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
  }, [doc, page, zoom]);

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

  // When a position is selected from the list — jump to its first annotation.
  useEffect(() => {
    if (!selectedPositionId) return;
    const target = annotations.find(
      (a) => a.positionId === selectedPositionId && a.bbox
    );
    if (!target) return;
    if (target.page !== page) setPage(target.page);
    const container = scrollRef.current;
    if (!container || canvasSize.width === 0) return;
    const cx = target.bbox.x * canvasSize.width;
    const cy = target.bbox.y * canvasSize.height;
    container.scrollTo({
      left: Math.max(0, cx - container.clientWidth / 2),
      top: Math.max(0, cy - container.clientHeight / 2),
      behavior: "smooth",
    });
    // canvasSize dependency intentionally included so we re-center after render.
  }, [selectedPositionId, annotations, page, canvasSize]);

  const layerLabel = (key: PdfOverlayColorKey) =>
    t(`projects.aiSetup.pdf.layer.${key}`);

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
          className="relative mx-auto"
          style={{ width: canvasSize.width || undefined, height: canvasSize.height || undefined }}
        >
          <canvas ref={canvasRef} className="block shadow-sm" />
          {pageAnnotations.map((a) => {
            const style = LAYER_STYLE[a.colorKey];
            const selected = a.selected || a.positionId === selectedPositionId;
            const left = a.bbox.x * canvasSize.width;
            const top = a.bbox.y * canvasSize.height;
            const w = Math.max(10, a.bbox.width * canvasSize.width);
            const h = Math.max(10, a.bbox.height * canvasSize.height);
            return (
              <button
                key={a.id}
                type="button"
                className={cn(
                  "absolute rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F2A4D]",
                  selected && "z-20"
                )}
                style={{
                  left,
                  top,
                  width: w,
                  height: h,
                  border: `2px ${a.needsReview ? "dashed" : "solid"} ${style.border}`,
                  backgroundColor: selected ? style.bg.replace("0.12", "0.28") : style.bg,
                  boxShadow: selected ? `0 0 0 3px ${style.border}55` : undefined,
                }}
                onClick={() => onAnnotationClick?.(a.positionId ?? null, a.id)}
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
