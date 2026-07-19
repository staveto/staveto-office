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
  Circle,
  ExternalLink,
  FileText,
  Frame,
  Hand,
  Minus,
  MoveHorizontal,
  PanelLeft,
  Pencil,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MousePointer,
  MapPin,
  RotateCcw,
  RotateCw,
  Ruler,
  Square,
  ScanSearch,
  ScanLine,
  StickyNote,
  LayoutGrid,
  Type,
  Undo2,
  CheckCircle2,
  Eye,
  EyeOff,
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
import type {
  AnalyzeRegionCandidateDto,
  CableRun,
  DrawingAnnotation,
  DrawingAnnotationKind,
  DrawingMeasurement,
  DrawingScaleCalibration,
  NormalizedPoint,
  SymbolColorLayer,
} from "@/types/pdfTakeoff";
import {
  computeScaleCalibration,
  insertCableRunPoint,
  parseRealLengthToMeters,
  polylineLengthMeters,
  removeCableRunPoint,
} from "@/lib/takeoff/cableMeasurement";
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

export type MarkerMode =
  | "select"
  | "pan"
  | "point"
  | "rect"
  | "analyze_region"
  | "identify"
  // Annotation tools — designer notes drawn ON the plan, never takeoff data.
  | "annotate_text"
  | "annotate_note"
  | "annotate_rect"
  | "annotate_ellipse"
  // Measure tools — scale calibration, simple lengths, cable routes.
  | "measure_calibrate"
  | "measure_length"
  | "measure_cable";

const ANNOTATE_MODES: MarkerMode[] = [
  "annotate_text",
  "annotate_note",
  "annotate_rect",
  "annotate_ellipse",
];

const MEASURE_MODES: MarkerMode[] = [
  "measure_calibrate",
  "measure_length",
  "measure_cable",
];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
/** Arrow-key pan distance (CSS px); Shift multiplies to ~a viewport. */
const ARROW_PAN_STEP_PX = 80;
/**
 * Canvas bitmap safety limits. Browsers cap canvas dimensions/area and
 * SILENTLY corrupt the drawing beyond them (content gets duplicated or
 * smeared across the page at high zoom on large plans). We stop growing the
 * bitmap at these bounds and upscale via CSS instead.
 */
const MAX_CANVAS_DIM_PX = 10000;
const MAX_CANVAS_AREA_PX = 50_000_000;

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
/**
 * Point-click marks get a UNIFORM physical size: this fraction of the page
 * width. (Previously the box was 22 screen px, so its real size on the plan
 * depended on the zoom level at the moment of the click — marks placed at
 * different zooms ended up visibly different.)
 */
const POINT_MARK_PAGE_FRACTION = 0.012;

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
   * Clear the panel-driven category highlights — wired to the toolbar's
   * "hide all highlights" button so one click darkens everything at once.
   */
  onClearHighlights?: () => void;
  /**
   * Overrides the point-mode hint text — used by the rapid category-marking
   * workflow ("Klikaním pridávate: Svetlo — 6 ks").
   */
  pointModeHint?: string | null;
  /**
   * "Zistiť značku (AI)" — identify-before-marking. In "identify" mode a
   * click asks AI vision what symbol sits at that spot WITHOUT creating any
   * mark; the workbench then shows the answer and offers to create the mark.
   * Undefined hides the mode button (flag off / no permission).
   */
  onIdentifyPoint?: (pageNumber: number, point: NormalizedRect) => void;
  identifyingSymbol?: boolean;
  /**
   * Free-form designer annotations (text / sticky note / rect / ellipse).
   * Presentation only — they never influence takeoff quantities. Undefined
   * callbacks hide the annotation tools (read-only viewers).
   */
  annotations?: DrawingAnnotation[];
  onAnnotationCreate?: (input: {
    kind: DrawingAnnotationKind;
    pageNumber: number;
    normalized: NormalizedRect;
    text: string;
  }) => void;
  onAnnotationUpdate?: (annotationId: string, patch: { text: string }) => void;
  onAnnotationDelete?: (annotationId: string) => void;
  /**
   * Sibling PDF documents of the same project — rendered in the left rail
   * stacked under each other; clicking switches the open drawing.
   */
  documents?: Array<{ id: string; fileName: string }>;
  activeDocumentId?: string | null;
  onSelectDocument?: (documentId: string) => void;
  /**
   * Measure tool (scale calibration, simple lengths, cable routes).
   * Providing onCalibrationSave enables the "Merať" toolbar dropdown; all
   * measurement data lives in the workbench and is passed down here for
   * rendering. Points are page-space normalized 0..1 (unrotated).
   */
  calibrations?: DrawingScaleCalibration[];
  measurements?: DrawingMeasurement[];
  cableRuns?: CableRun[];
  selectedCableRunId?: string | null;
  onCableRunClick?: (cableRunId: string) => void;
  /**
   * A finished polyline route (≥ 2 points) — workbench computes + saves.
   * `gapIndexes` lists points whose incoming segment is a "pen-up" jump
   * (not counted into the length).
   */
  onCableRunDrawn?: (
    pageNumber: number,
    points: NormalizedPoint[],
    gapIndexes: number[]
  ) => void;
  /**
   * Geometry edit of a SAVED route (move/insert/delete vertices) — enables
   * the "Upraviť body" bar on a selected route. Workbench recomputes the
   * lengths and persists.
   */
  onCableRunEdit?: (
    cableRunId: string,
    patch: { points: NormalizedPoint[]; gapIndexes: number[] }
  ) => void;
  /**
   * Highlight filter from the routes panel: non-empty → listed routes pop,
   * all other routes fade out. Empty → every route renders normally.
   */
  highlightedCableRunIds?: string[];
  /**
   * One-shot "edit this route on the plan" request (from the panel) —
   * navigates to the route's page and opens vertex editing.
   */
  cableRunEditRequest?: { runId: string; requestId: number } | null;
  onCalibrationSave?: (input: {
    pageNumber: number;
    pointA: NormalizedPoint;
    pointB: NormalizedPoint;
    pageWidthPt: number;
    pageHeightPt: number;
    realLengthM: number;
    pdfDistancePt: number;
    metersPerPdfPoint: number;
  }) => void;
  onCalibrationReset?: (pageNumber: number) => void;
  onMeasurementCreate?: (input: {
    pageNumber: number;
    pointA: NormalizedPoint;
    pointB: NormalizedPoint;
    measuredLengthM: number;
  }) => void;
  onMeasurementDelete?: (measurementId: string) => void;
};

const MODE_BUTTONS: Array<{ mode: MarkerMode; icon: typeof MousePointer; labelKey: string }> = [
  { mode: "select", icon: MousePointer, labelKey: "takeoff.viewer.modeSelect" },
  { mode: "pan", icon: Hand, labelKey: "takeoff.viewer.modePan" },
  { mode: "point", icon: MapPin, labelKey: "takeoff.viewer.modePoint" },
  { mode: "rect", icon: Square, labelKey: "takeoff.viewer.modeRect" },
  { mode: "analyze_region", icon: ScanSearch, labelKey: "takeoff.viewer.modeAnalyzeRegion" },
  { mode: "identify", icon: Sparkles, labelKey: "takeoff.viewer.modeIdentify" },
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
  onClearHighlights,
  pointModeHint = null,
  onIdentifyPoint,
  identifyingSymbol = false,
  annotations = [],
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationDelete,
  documents = [],
  activeDocumentId = null,
  onSelectDocument,
  calibrations = [],
  measurements = [],
  cableRuns = [],
  selectedCableRunId = null,
  onCableRunClick,
  onCableRunDrawn,
  onCableRunEdit,
  highlightedCableRunIds = [],
  cableRunEditRequest = null,
  onCalibrationSave,
  onCalibrationReset,
  onMeasurementCreate,
  onMeasurementDelete,
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
  // "Skryť značky" — hide EVERY mark overlay (categories, candidates, legacy)
  // so the user can read the bare drawing under the markers.
  const [hideMarks, setHideMarks] = useState(false);
  const [dragRect, setDragRect] = useState<NormalizedRect | null>(null);
  // Drag-to-move a marker (candidate/occurrence) on the plan.
  const [markerDrag, setMarkerDrag] = useState<MarkerDragState | null>(null);
  // Annotation being created (text/note — dialog collects the text first).
  const [annDraft, setAnnDraft] = useState<{
    kind: "text" | "note";
    pageNumber: number;
    normalized: NormalizedRect;
  } | null>(null);
  const [annDraftText, setAnnDraftText] = useState("");
  // Existing annotation opened for edit/delete (select-mode click).
  const [annEditor, setAnnEditor] = useState<{
    id: string;
    kind: DrawingAnnotationKind;
    text: string;
  } | null>(null);
  // Left rail: page thumbnails of the open PDF + collapsible state.
  const [pageThumbs, setPageThumbs] = useState<string[]>([]);
  const [railOpen, setRailOpen] = useState(true);
  // Clustered/overlapping marks — clicking any of them opens a small picker
  // instead of always resolving to whichever one happens to be on top.
  const [overlapPicker, setOverlapPicker] = useState<{
    x: number;
    y: number;
    items: OverlapPickerItem[];
  } | null>(null);
  // ---- Measure tool state ----------------------------------------------------
  // Page size in PDF points (page-space, i.e. only the page's OWN rotation
  // applied — view rotation excluded), needed for real-distance math.
  const [pagePtSize, setPagePtSize] = useState<{
    pageNum: number;
    widthPt: number;
    heightPt: number;
  } | null>(null);
  const [measureMenuOpen, setMeasureMenuOpen] = useState(false);
  const measureMenuRef = useRef<HTMLDivElement | null>(null);
  /** Scale control — separate from the measure dropdown (edit/reset menu). */
  const [scaleMenuOpen, setScaleMenuOpen] = useState(false);
  const scaleMenuRef = useRef<HTMLDivElement | null>(null);
  /** In-progress measure clicks — page-space normalized points. */
  const [measurePoints, setMeasurePoints] = useState<NormalizedPoint[]>([]);
  /**
   * "Pen-up" jumps in the in-progress cable route: indexes into
   * measurePoints whose incoming segment is skipped (not measured).
   */
  const [measureGapIndexes, setMeasureGapIndexes] = useState<number[]>([]);
  /** Next placed point starts after a jump — armed by the "Preskočiť" button. */
  const [measureGapPending, setMeasureGapPending] = useState(false);
  /** Mouse position for the live preview segment (page-space normalized). */
  const [measureHover, setMeasureHover] = useState<NormalizedPoint | null>(null);
  const [hideMeasurements, setHideMeasurements] = useState(false);
  /** Inline warning, e.g. "set the scale first". */
  const [measureNotice, setMeasureNotice] = useState<string | null>(null);
  /** Two calibration points picked — dialog asks for the real length. */
  const [calibDraft, setCalibDraft] = useState<{
    pageNumber: number;
    pointA: NormalizedPoint;
    pointB: NormalizedPoint;
  } | null>(null);
  const [calibLengthText, setCalibLengthText] = useState("");
  const [hoveredCableRunId, setHoveredCableRunId] = useState<string | null>(null);
  const [hoveredMeasurementId, setHoveredMeasurementId] = useState<string | null>(null);
  /** Route whose vertices are being edited on the plan (select mode only). */
  const [editingCableRunId, setEditingCableRunId] = useState<string | null>(null);
  /** Local geometry echo during editing — dragging must not lag on saves. */
  const [editDraft, setEditDraft] = useState<{
    points: NormalizedPoint[];
    gapIndexes: number[];
  } | null>(null);
  /** Index of the vertex being dragged (pointer-captured on the handle). */
  const editDragIndexRef = useRef<number | null>(null);
  /**
   * Manual double-click detection for finishing a cable route. The native
   * dblclick event never fires here: pointerdown calls preventDefault() in
   * measure mode, which suppresses the browser's compatibility mouse events.
   */
  const lastMeasureClickRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  /** Zoom value the CURRENT canvas was actually rendered at (not just requested). */
  const renderedZoomRef = useRef<number | null>(null);
  /** Guards against a slow, superseded render committing over a newer one. */
  const renderGenRef = useRef(0);
  /** Page CSS size at zoom=1 (fit-width) — lets zoom stretch instantly via CSS. */
  const baseDimsRef = useRef<{ pageNum: number; width: number; height: number } | null>(
    null
  );
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
  // Point-level rotation helpers (zero-size rects reuse the rect math).
  const toViewPoint = useCallback(
    (p: NormalizedPoint): NormalizedPoint => {
      const r = rotateNormalizedRect({ x: p.x, y: p.y, width: 0, height: 0 }, rotation);
      return { x: r.x, y: r.y };
    },
    [rotation]
  );
  const fromViewPoint = useCallback(
    (p: NormalizedPoint): NormalizedPoint => {
      const r = unrotateNormalizedRect({ x: p.x, y: p.y, width: 0, height: 0 }, rotation);
      return { x: r.x, y: r.y };
    },
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
      // Page-space size in PDF points (view rotation excluded) — the measure
      // tool's distance math runs on stored (unrotated) normalized points.
      const pageRotation = (((pdfPage.rotate ?? 0) % 360) + 360) % 360;
      const pageProbe =
        rotation === 0 ? probe : pdfPage.getViewport({ scale: 1, rotation: pageRotation });
      setPagePtSize((prev) =>
        prev &&
        prev.pageNum === page &&
        prev.widthPt === pageProbe.width &&
        prev.heightPt === pageProbe.height
          ? prev
          : { pageNum: page, widthPt: pageProbe.width, heightPt: pageProbe.height }
      );
      const fit = containerWidth > 100 ? containerWidth / probe.width : 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // The BITMAP resolution is capped independently of the on-screen size:
      // large plans at high zoom would otherwise exceed the browser's max
      // canvas dimensions/area and Chrome silently renders garbage (page
      // content duplicated/smeared across the plan). Past the cap we keep
      // rendering at the max safe resolution and let CSS scale it up.
      const targetScale = fit * zoom * dpr;
      const renderScale = Math.min(
        targetScale,
        MAX_CANVAS_DIM_PX / probe.width,
        MAX_CANVAS_DIM_PX / probe.height,
        Math.sqrt(MAX_CANVAS_AREA_PX / (probe.width * probe.height))
      );
      const viewport = pdfPage.getViewport({
        scale: renderScale,
        rotation: viewRotation,
      });
      baseDimsRef.current = { pageNum: page, width: probe.width * fit, height: probe.height * fit };
      // Render OFFSCREEN first — the previous (CSS-stretched) image stays on
      // screen the whole time instead of a blank canvas, so zooming never
      // shows an empty page while the sharp bitmap is being produced.
      const gen = ++renderGenRef.current;
      const off = document.createElement("canvas");
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      const offCtx = off.getContext("2d");
      if (!offCtx) return;
      const task = pdfPage.render({ canvasContext: offCtx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      if (gen !== renderGenRef.current) return; // superseded by a newer render
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = off.width;
      canvas.height = off.height;
      // CSS size always reflects the LOGICAL zoom — overlays, marks and all
      // coordinate math keep working even when the bitmap is capped.
      const cssWidth = Math.floor(probe.width * fit * zoom);
      const cssHeight = Math.floor(probe.height * fit * zoom);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      ctx.drawImage(off, 0, 0);
      renderedZoomRef.current = zoom;
      setCanvasSize({ width: cssWidth, height: cssHeight });
    } catch {
      // Cancelled render or transient failure — next pass recovers.
    } finally {
      setRendering(false);
    }
  }, [doc, page, zoom, rotation]);

  // Debounced render — rapid zoom steps (wheel/+/-) coalesce into ONE sharp
  // re-render at the final level instead of fully re-rendering every step.
  useEffect(() => {
    const timer = setTimeout(() => void renderPage(), 140);
    return () => clearTimeout(timer);
  }, [renderPage]);

  // Instant zoom feedback: stretch the current bitmap via CSS and commit the
  // new logical size right away — overlays, marks and anchored scrolling all
  // follow immediately, while the sharp re-render lands ~a moment later.
  useEffect(() => {
    const base = baseDimsRef.current;
    const canvas = canvasRef.current;
    if (!base || !canvas || base.pageNum !== page) return;
    const cssWidth = Math.floor(base.width * zoom);
    const cssHeight = Math.floor(base.height * zoom);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    renderedZoomRef.current = zoom;
    setCanvasSize({ width: cssWidth, height: cssHeight });
  }, [zoom, page]);

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
      hideMarks
        ? []
        : occurrences.filter(
            (o) => o.pageNumber === page && !hiddenLayers.has(occurrenceLayer(o))
          ),
    [occurrences, page, hiddenLayers, hideMarks]
  );

  const layersInUse = useMemo(() => {
    const used = new Set(occurrences.map(occurrenceLayer));
    return TAKEOFF_LAYER_ORDER.filter((l) => used.has(l));
  }, [occurrences]);

  /**
   * True when a mark rect is already comfortably inside the visible scroll
   * viewport. Auto-scroll effects below use it to do NOTHING in that case —
   * selecting/placing a mark directly on the plan must never yank the view
   * (the jump made follow-up clicks land on the wrong spot). Scrolling only
   * happens for genuinely off-screen targets (e.g. clicking a panel row).
   */
  const isRectInViewport = useCallback(
    (rect: { x: number; y: number; width: number; height: number }, marginPx = 12) => {
      const container = scrollRef.current;
      if (!container) return false;
      return (
        rect.x >= container.scrollLeft + marginPx &&
        rect.y >= container.scrollTop + marginPx &&
        rect.x + rect.width <= container.scrollLeft + container.clientWidth - marginPx &&
        rect.y + rect.height <= container.scrollTop + container.clientHeight - marginPx
      );
    },
    []
  );

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
    if (isRectInViewport(rect)) return;
    container.scrollTo({
      left: Math.max(0, rect.x + rect.width / 2 - container.clientWidth / 2),
      top: Math.max(0, rect.y + rect.height / 2 - container.clientHeight / 2),
      behavior: "smooth",
    });
  }, [selectedOccurrenceId, occurrences, page, canvasSize, toView, isRectInViewport]);

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
    // Already visible (typical when the user just clicked/placed the mark
    // on the plan) — no zoom bump, no scroll, no view jump.
    const rect = normalizedToScreenRect(toView(target.normalized_position), canvasSize);
    if (isRectInViewport(rect)) return;
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
  }, [selectedCandidateId, regionCandidates, page, canvasSize, toView, isRectInViewport]);

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
    } else if (e.key === "Enter" && markerMode === "measure_cable") {
      // Enter finishes the in-progress cable route (like double-click).
      finishCableRun();
    } else if (e.key === "Backspace" && MEASURE_MODES.includes(markerMode)) {
      // Backspace removes the last placed measure point (or a pending jump).
      undoMeasurePoint();
    } else if (
      (e.key === "p" || e.key === "P") &&
      markerMode === "measure_cable" &&
      measurePoints.length > 0
    ) {
      // P arms a "pen-up" jump — the next segment won't be measured.
      setMeasureGapPending((v) => !v);
    } else if (e.key === "Escape") {
      setOverlapPicker(null);
      setDragRect(null);
      dragStartRef.current = null;
      setMeasurePoints([]);
      setMeasureGapIndexes([]);
      setMeasureGapPending(false);
      setMeasureHover(null);
      stopCableRunEdit();
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

  // "identify" also rubber-bands: the drawn region is what AI vision gets to
  // look at, so the user can wrap the whole symbol instead of a single point.
  const isRectDrawMode =
    markerMode === "rect" ||
    markerMode === "analyze_region" ||
    markerMode === "identify" ||
    markerMode === "annotate_rect" ||
    markerMode === "annotate_ellipse";
  const isAnnotateMode = ANNOTATE_MODES.includes(markerMode);
  const isMeasureMode = MEASURE_MODES.includes(markerMode);
  const measureEnabled = Boolean(onCalibrationSave);

  // Current page's scale calibration (one per drawing page).
  const pageCalibration = useMemo(
    () => calibrations.find((c) => c.pageNumber === page) ?? null,
    [calibrations, page]
  );
  const pageMeasurements = useMemo(
    () => measurements.filter((m) => m.pageNumber === page),
    [measurements, page]
  );
  const pageCableRuns = useMemo(
    () => cableRuns.filter((r) => r.pageNumber === page),
    [cableRuns, page]
  );

  /** Page-space normalized point → view-space CSS pixels on the canvas. */
  const measurePx = useCallback(
    (p: NormalizedPoint) => {
      const v = toViewPoint(p);
      return { x: v.x * canvasSize.width, y: v.y * canvasSize.height };
    },
    [toViewPoint, canvasSize]
  );

  /** Live length of the in-progress measure polyline (null without scale). */
  const measureDraftLengthM = useMemo(() => {
    if (!pageCalibration || measurePoints.length === 0) return null;
    const points = measureHover ? [...measurePoints, measureHover] : measurePoints;
    if (points.length < 2) return null;
    // A pending jump means the live hover segment is a skip too.
    const gaps =
      measureHover && measureGapPending
        ? [...measureGapIndexes, measurePoints.length]
        : measureGapIndexes;
    const len = polylineLengthMeters(points, pageCalibration, gaps);
    return len === null ? null : Math.round(len * 100) / 100;
  }, [pageCalibration, measurePoints, measureHover, measureGapIndexes, measureGapPending]);

  // Fresh measure state whenever the tool or page changes.
  useEffect(() => {
    setMeasurePoints([]);
    setMeasureGapIndexes([]);
    setMeasureGapPending(false);
    setMeasureHover(null);
  }, [markerMode, page]);

  // Close the "Merať" dropdown on any outside click.
  useEffect(() => {
    if (!measureMenuOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!measureMenuRef.current?.contains(e.target as Node)) {
        setMeasureMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [measureMenuOpen]);

  // Close the scale (edit/reset) menu on any outside click.
  useEffect(() => {
    if (!scaleMenuOpen) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (!scaleMenuRef.current?.contains(e.target as Node)) {
        setScaleMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [scaleMenuOpen]);

  /** Start (re)calibrating the scale — its own toolbar control, not a measure tool. */
  const startCalibration = useCallback(() => {
    setScaleMenuOpen(false);
    setMeasureMenuOpen(false);
    setMeasurePoints([]);
    setMeasureGapIndexes([]);
    setMeasureGapPending(false);
    setMeasureHover(null);
    setMeasureNotice(null);
    onMarkerModeChange("measure_calibrate");
  }, [onMarkerModeChange]);

  /** Pick a measure tool from the dropdown — blocks meter tools without scale. */
  const selectMeasureMode = useCallback(
    (mode: MarkerMode) => {
      setMeasureMenuOpen(false);
      setMeasurePoints([]);
      setMeasureGapIndexes([]);
      setMeasureGapPending(false);
      setMeasureHover(null);
      if ((mode === "measure_length" || mode === "measure_cable") && !pageCalibration) {
        setMeasureNotice(t("takeoff.measure.scaleMissing"));
        return;
      }
      setMeasureNotice(null);
      onMarkerModeChange(mode);
    },
    [pageCalibration, onMarkerModeChange, t]
  );

  /**
   * Finish the in-progress cable polyline — dedupe the double-click's echo
   * point and hand the route to the workbench. `keepDrawing` stays in
   * measure_cable mode so the user can chain the next circuit right away.
   */
  const finishCableRun = useCallback(
    (keepDrawing = false) => {
      setMeasureHover(null);
      const epsX = 4 / Math.max(1, canvasSize.width);
      const epsY = 4 / Math.max(1, canvasSize.height);
      const gaps = new Set(measureGapIndexes);
      const deduped: NormalizedPoint[] = [];
      const dedupedGaps: number[] = [];
      for (let i = 0; i < measurePoints.length; i++) {
        const p = measurePoints[i];
        const last = deduped[deduped.length - 1];
        if (last && Math.abs(last.x - p.x) < epsX && Math.abs(last.y - p.y) < epsY) {
          continue;
        }
        // Gap indexes must follow the point into its new (deduped) position.
        if (gaps.has(i)) dedupedGaps.push(deduped.length);
        deduped.push(p);
      }
      setMeasurePoints([]);
      setMeasureGapIndexes([]);
      setMeasureGapPending(false);
      if (deduped.length >= 2) {
        onCableRunDrawn?.(page, deduped, dedupedGaps.filter((i) => i > 0));
        if (!keepDrawing) onMarkerModeChange("select");
      }
    },
    [measurePoints, measureGapIndexes, canvasSize, page, onCableRunDrawn, onMarkerModeChange]
  );

  /**
   * Undo one step of the in-progress measurement: an armed (unused) jump is
   * cancelled first, otherwise the last point goes away together with its
   * gap flag.
   */
  const undoMeasurePoint = useCallback(() => {
    if (measureGapPending) {
      setMeasureGapPending(false);
      return;
    }
    const removedIndex = measurePoints.length - 1;
    if (removedIndex < 0) return;
    setMeasureGapIndexes((gaps) => gaps.filter((g) => g !== removedIndex));
    setMeasurePoints((prev) => prev.slice(0, -1));
  }, [measureGapPending, measurePoints.length]);

  // ---- Saved cable-run geometry editing (select mode) -----------------------

  /** The selected route on THIS page — target of the "Upraviť body" bar. */
  const selectedCableRunOnPage = useMemo(
    () =>
      selectedCableRunId
        ? (cableRuns.find(
            (r) => r.id === selectedCableRunId && r.pageNumber === page
          ) ?? null)
        : null,
    [cableRuns, selectedCableRunId, page]
  );

  const startCableRunEdit = useCallback((run: CableRun) => {
    setEditingCableRunId(run.id);
    setEditDraft({ points: run.points, gapIndexes: run.gapIndexes ?? [] });
  }, []);

  const stopCableRunEdit = useCallback(() => {
    setEditingCableRunId(null);
    setEditDraft(null);
    editDragIndexRef.current = null;
  }, []);

  // Editing only survives while its route stays selected on the same page.
  useEffect(() => {
    if (!editingCableRunId) return;
    const stillValid =
      markerMode === "select" &&
      selectedCableRunId === editingCableRunId &&
      cableRuns.some((r) => r.id === editingCableRunId && r.pageNumber === page);
    if (!stillValid) stopCableRunEdit();
  }, [
    editingCableRunId,
    selectedCableRunId,
    cableRuns,
    page,
    markerMode,
    stopCableRunEdit,
  ]);

  // Panel's "Upraviť na pláne" — jump to the route's page and open editing.
  // Runs in steps (mode → page → edit) because the editing-validity effect
  // would immediately cancel an edit started under a stale mode/page.
  const handledEditRequestRef = useRef<number | null>(null);
  useEffect(() => {
    if (!cableRunEditRequest) return;
    if (handledEditRequestRef.current === cableRunEditRequest.requestId) return;
    const run = cableRuns.find((r) => r.id === cableRunEditRequest.runId);
    if (!run) return;
    if (markerMode !== "select") {
      onMarkerModeChange("select");
      return;
    }
    if (page !== run.pageNumber) {
      setPage(run.pageNumber);
      return;
    }
    handledEditRequestRef.current = cableRunEditRequest.requestId;
    startCableRunEdit(run);
  }, [
    cableRunEditRequest,
    cableRuns,
    markerMode,
    page,
    onMarkerModeChange,
    startCableRunEdit,
  ]);

  /** Apply + persist a geometry change (insert/delete commit immediately). */
  const applyCableRunEdit = useCallback(
    (next: { points: NormalizedPoint[]; gapIndexes: number[] }) => {
      setEditDraft(next);
      if (editingCableRunId) onCableRunEdit?.(editingCableRunId, next);
    },
    [editingCableRunId, onCableRunEdit]
  );

  const deleteEditVertex = useCallback(
    (index: number) => {
      if (!editDraft) return;
      const next = removeCableRunPoint(editDraft.points, editDraft.gapIndexes, index);
      if (next) applyCableRunEdit(next);
    },
    [editDraft, applyCableRunEdit]
  );

  /** Live length of the edited route (draft geometry, current scale). */
  const editDraftLengthM = useMemo(() => {
    if (!editDraft || !pageCalibration) return null;
    const len = polylineLengthMeters(editDraft.points, pageCalibration, editDraft.gapIndexes);
    return len === null ? null : Math.round(len * 100) / 100;
  }, [editDraft, pageCalibration]);

  /** A click landed in one of the measure modes (page-space point). */
  const handleMeasureClick = useCallback(
    (pt: NormalizedPoint) => {
      if (markerMode === "measure_calibrate") {
        const next = [...measurePoints, pt];
        if (next.length >= 2) {
          setCalibDraft({ pageNumber: page, pointA: next[0], pointB: next[1] });
          setCalibLengthText("");
          setMeasurePoints([]);
        } else {
          setMeasurePoints(next);
        }
        return;
      }
      if (markerMode === "measure_length") {
        if (!pageCalibration) {
          setMeasureNotice(t("takeoff.measure.scaleMissing"));
          onMarkerModeChange("select");
          return;
        }
        const next = [...measurePoints, pt];
        if (next.length >= 2) {
          const lengthM = polylineLengthMeters(next, pageCalibration);
          if (lengthM !== null) {
            onMeasurementCreate?.({
              pageNumber: page,
              pointA: next[0],
              pointB: next[1],
              measuredLengthM: Math.round(lengthM * 100) / 100,
            });
          }
          setMeasurePoints([]);
        } else {
          setMeasurePoints(next);
        }
        return;
      }
      if (markerMode === "measure_cable") {
        if (!pageCalibration) {
          setMeasureNotice(t("takeoff.measure.scaleMissing"));
          onMarkerModeChange("select");
          return;
        }
        if (measureGapPending && measurePoints.length > 0) {
          // This point lands after a "pen-up" jump — its incoming segment
          // stays out of the measured length.
          setMeasureGapIndexes((prev) => [...prev, measurePoints.length]);
          setMeasureGapPending(false);
        }
        setMeasurePoints((prev) => [...prev, pt]);
      }
    },
    [
      markerMode,
      measurePoints,
      measureGapPending,
      page,
      pageCalibration,
      onMeasurementCreate,
      onMarkerModeChange,
      t,
    ]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    // Pan when: hand tool, space+drag, or MIDDLE mouse button in ANY mode —
    // the wheel press must always move the plan, never place a mark.
    const middleButtonPan = e.pointerType === "mouse" && e.button === 1;
    if (panActive || middleButtonPan) {
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
    // Measure modes: clicks place measure points (handled on pointer-up so
    // small hand jitter doesn't count as a drag).
    if (isMeasureMode) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = localPoint(e);
      if (!p) return;
      e.preventDefault();
      dragStartRef.current = p;
      return;
    }
    if (
      markerMode === "select" ||
      (markerMode === "identify"
        ? !onIdentifyPoint || identifyingSymbol
        : isAnnotateMode
          ? !onAnnotationCreate
          : !onMarkerDrawn) ||
      analyzingRegion ||
      scanningWholePage ||
      scanningWholePageWithAi
    )
      return;
    // Only the primary (left) button places marks — right/middle never do.
    if (e.pointerType === "mouse" && e.button !== 0) return;
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
    // Route-editing vertex drag — the handle armed editDragIndexRef and the
    // overlay holds the pointer capture, so moves land here.
    if (editDragIndexRef.current !== null && editDraft) {
      const p = localPoint(e);
      if (!p || canvasSize.width === 0 || canvasSize.height === 0) return;
      const pt = fromViewPoint({
        x: clamp01(p.x / canvasSize.width),
        y: clamp01(p.y / canvasSize.height),
      });
      const idx = editDragIndexRef.current;
      setEditDraft((prev) =>
        prev
          ? { ...prev, points: prev.points.map((q, i) => (i === idx ? pt : q)) }
          : prev
      );
      return;
    }
    // Measure modes: track the cursor for the live preview segment.
    if (isMeasureMode) {
      const p = localPoint(e);
      if (!p || canvasSize.width === 0 || canvasSize.height === 0) return;
      setMeasureHover(
        fromViewPoint({
          x: clamp01(p.x / canvasSize.width),
          y: clamp01(p.y / canvasSize.height),
        })
      );
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
    // End of a route-editing vertex drag — persist the moved geometry.
    if (editDragIndexRef.current !== null) {
      editDragIndexRef.current = null;
      overlayRef.current?.releasePointerCapture?.(e.pointerId);
      if (editDraft && editingCableRunId) {
        onCableRunEdit?.(editingCableRunId, editDraft);
      }
      return;
    }
    // Measure modes: a click (not a drag) places the next measure point.
    if (isMeasureMode) {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      const p = localPoint(e);
      if (!start || !p || canvasSize.width === 0 || canvasSize.height === 0) return;
      if (Math.abs(p.x - start.x) > 5 || Math.abs(p.y - start.y) > 5) return;
      // Double-click finishes the cable route (manual detection — see ref).
      const lastClick = lastMeasureClickRef.current;
      lastMeasureClickRef.current = { time: performance.now(), x: p.x, y: p.y };
      if (
        markerMode === "measure_cable" &&
        lastClick &&
        performance.now() - lastClick.time < 400 &&
        Math.abs(p.x - lastClick.x) < 6 &&
        Math.abs(p.y - lastClick.y) < 6
      ) {
        lastMeasureClickRef.current = null;
        finishCableRun();
        return;
      }
      handleMeasureClick(
        fromViewPoint({
          x: clamp01(p.x / canvasSize.width),
          y: clamp01(p.y / canvasSize.height),
        })
      );
      return;
    }
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (
      markerMode === "select" ||
      markerMode === "pan" ||
      (markerMode === "identify"
        ? !onIdentifyPoint
        : isAnnotateMode
          ? !onAnnotationCreate
          : !onMarkerDrawn) ||
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
    // Point marks use a page-relative size so every mark is physically the
    // same on the plan no matter what zoom it was placed at.
    const pointMarkPx = POINT_MARK_PAGE_FRACTION * canvasSize.width;
    if (markerMode === "identify") {
      // Ask "what is this?" — creates NO mark. A drawn rectangle defines the
      // exact region AI vision analyzes; a plain click falls back to a
      // point-sized region around the spot.
      const px = normalizeDragRect(start, p);
      const region =
        px.width < 6 && px.height < 6
          ? pointToNormalizedRect(p, canvasSize, pointMarkPx)
          : screenToNormalizedRect(px, canvasSize);
      onIdentifyPoint?.(page, fromView(region));
      return;
    }
    if (isAnnotateMode) {
      if (markerMode === "annotate_rect" || markerMode === "annotate_ellipse") {
        // Shapes need a real drag; a bare click gets a visible default box.
        const px = normalizeDragRect(start, p);
        const rect =
          px.width < 6 && px.height < 6
            ? pointToNormalizedRect(p, canvasSize, pointMarkPx * 4)
            : screenToNormalizedRect(px, canvasSize);
        onAnnotationCreate?.({
          kind: markerMode === "annotate_rect" ? "rect" : "ellipse",
          pageNumber: page,
          normalized: fromView(rect),
          text: "",
        });
        return;
      }
      // text / note — anchor at the click; the text dialog opens first so an
      // empty annotation is never created.
      setAnnDraft({
        kind: markerMode === "annotate_text" ? "text" : "note",
        pageNumber: page,
        normalized: fromView(pointToNormalizedRect(p, canvasSize, pointMarkPx)),
      });
      setAnnDraftText("");
      return;
    }
    if (!onMarkerDrawn) return;
    if (markerMode === "point") {
      onMarkerDrawn(page, fromView(pointToNormalizedRect(p, canvasSize, pointMarkPx)));
      return;
    }
    // rect / analyze_region — a tiny drag counts as a point. For analyze the
    // point rect is auto-expanded downstream, so a click NEVER silently
    // disappears ("nothing happened" is not an allowed outcome).
    const px = normalizeDragRect(start, p);
    if (px.width < 6 && px.height < 6) {
      onMarkerDrawn(page, fromView(pointToNormalizedRect(p, canvasSize, pointMarkPx)));
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
      hideMarks
        ? []
        : regionCandidates.filter(
            (c) =>
              (c.page_number == null || c.page_number === page) &&
              Boolean(c.normalized_position) &&
              c.status !== "rejected"
          ),
    [regionCandidates, page, hideMarks]
  );

  // Designer annotations on the current page — independent of hideMarks
  // (notes are drawing communication, not takeoff data).
  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageNumber === page),
    [annotations, page]
  );

  // Left-rail page thumbnails — rendered once per document (small, cheap).
  useEffect(() => {
    if (!doc || doc.numPages < 2) {
      setPageThumbs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const thumbs: string[] = [];
      const count = Math.min(doc.numPages, 30);
      for (let n = 1; n <= count; n++) {
        try {
          const pdfPage = await doc.getPage(n);
          const probe = pdfPage.getViewport({ scale: 1 });
          const scale = 120 / probe.width;
          const viewport = pdfPage.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
          thumbs.push(canvas.toDataURL("image/png"));
        } catch {
          thumbs.push("");
        }
        if (cancelled) return;
      }
      if (!cancelled) setPageThumbs(thumbs);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

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
      // Middle/right button never drags a mark — let it bubble to the
      // overlay so middle-button panning works even over markers.
      if (e.pointerType === "mouse" && e.button !== 0) return;
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
      // Side effects (parent onMove callbacks) must live OUTSIDE the setState
      // updater — React may run updaters during render and calling a parent
      // setState from there throws "Cannot update a component while
      // rendering a different component".
      const prev = markerDrag;
      if (!prev || prev.pointerId !== e.pointerId) return;
      setMarkerDrag(null);
      // Final offset straight from the pointer event — exact even if the
      // last pointermove state update hasn't re-rendered yet.
      const dxPx = e.clientX - prev.startClientX;
      const dyPx = e.clientY - prev.startClientY;
      const moved =
        prev.moved ||
        Math.abs(dxPx) > MARKER_DRAG_THRESHOLD_PX ||
        Math.abs(dyPx) > MARKER_DRAG_THRESHOLD_PX;
      if (!moved || canvasSize.width === 0 || canvasSize.height === 0) return;
      const nextViewRect: NormalizedRect = {
        x: clamp01(prev.originViewRect.x + dxPx / canvasSize.width),
        y: clamp01(prev.originViewRect.y + dyPx / canvasSize.height),
        width: prev.originViewRect.width,
        height: prev.originViewRect.height,
      };
      const finalNormalized = fromView(nextViewRect);
      suppressClickRef.current = true;
      if (prev.kind === "occurrence") onOccurrenceMove?.(prev.id, finalNormalized);
      else onCandidateMove?.(prev.id, finalNormalized);
    },
    [markerDrag, canvasSize, fromView, onOccurrenceMove, onCandidateMove]
  );

  // Deleting from the plan ALWAYS asks first — via an in-app dialog, never
  // window.confirm (browsers may silently suppress repeated native dialogs,
  // which made the (x) look completely broken).
  const [deleteAsk, setDeleteAsk] = useState<
    | { kind: "occurrence"; id: string; label: string }
    | { kind: "candidate"; candidate: AnalyzeRegionCandidateDto; label: string }
    | { kind: "measurement"; id: string; label: string }
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
    else if (deleteAsk.kind === "measurement") onMeasurementDelete?.(deleteAsk.id);
    else onCandidateDelete?.(deleteAsk.candidate);
    setDeleteAsk(null);
  }, [deleteAsk, onOccurrenceDelete, onCandidateDelete, onMeasurementDelete]);

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
          {(() => {
            const visible = MODE_BUTTONS.filter(
              (b) =>
                (showAnalyzeRegionMode || b.mode !== "analyze_region") &&
                (onIdentifyPoint || b.mode !== "identify") &&
                (allowMarking || (b.mode !== "point" && b.mode !== "rect" && b.mode !== "analyze_region"))
            );
            const renderModeButton = ({ mode, icon: Icon, labelKey }: (typeof MODE_BUTTONS)[number]) => (
              <button
                key={mode}
                type="button"
                data-testid={mode === "identify" ? "mode-identify" : undefined}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                  markerMode === mode
                    ? mode === "analyze_region"
                      ? "bg-[#e06737] text-white"
                      : mode === "identify"
                        ? "bg-violet-600 text-white"
                        : "bg-primary text-primary-foreground"
                    : mode === "identify"
                      ? "text-violet-700 hover:bg-violet-100"
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
            );
            // "Merať" sits between "Nakresliť rámik" and "Analyzovať oblasť".
            const splitIdx = visible.findIndex((b) => b.mode === "analyze_region");
            const before = splitIdx === -1 ? visible : visible.slice(0, splitIdx);
            const after = splitIdx === -1 ? [] : visible.slice(splitIdx);
            return (
              <>
                {before.map(renderModeButton)}
                {measureEnabled ? (
                  <div className="relative" ref={scaleMenuRef}>
                    {pageCalibration ? (
                      <>
                        <button
                          type="button"
                          data-testid="measure-scale-badge"
                          className={cn(
                            "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                            markerMode === "measure_calibrate"
                              ? "bg-blue-600 text-white"
                              : "text-blue-700 hover:bg-blue-50"
                          )}
                          onClick={() => setScaleMenuOpen((v) => !v)}
                          aria-expanded={scaleMenuOpen}
                          aria-haspopup="menu"
                          title={t("takeoff.measure.scaleSet")}
                          disabled={analyzingRegion || scanningWholePage || scanningWholePageWithAi}
                        >
                          <Ruler className="size-3.5" />
                          <span className="hidden lg:inline">
                            {t("takeoff.measure.scaleLabel", {
                              length: String(pageCalibration.realLengthM),
                            })}
                          </span>
                          <ChevronDown className="size-3" />
                        </button>
                        {scaleMenuOpen ? (
                          <div
                            role="menu"
                            className="absolute left-0 top-full z-50 mt-1 w-52 rounded-md border border-border bg-popover p-1 shadow-lg"
                            data-testid="scale-menu"
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                              data-testid="measure-calibrate"
                              onClick={startCalibration}
                            >
                              <Ruler className="size-3.5 shrink-0 text-blue-700" />
                              {t("takeoff.measure.editScale")}
                            </button>
                            {onCalibrationReset ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                data-testid="measure-reset-scale"
                                onClick={() => {
                                  setScaleMenuOpen(false);
                                  onCalibrationReset(page);
                                }}
                              >
                                <Trash2 className="size-3.5 shrink-0" />
                                {t("takeoff.measure.resetScale")}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        data-testid="measure-calibrate"
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                          markerMode === "measure_calibrate"
                            ? "bg-blue-600 text-white"
                            : "text-blue-700 hover:bg-blue-50"
                        )}
                        onClick={startCalibration}
                        aria-pressed={markerMode === "measure_calibrate"}
                        title={t("takeoff.measure.calibrateHint")}
                        disabled={analyzingRegion || scanningWholePage || scanningWholePageWithAi}
                      >
                        <Ruler className="size-3.5" />
                        <span className="hidden lg:inline">
                          {t("takeoff.measure.setScale")}
                        </span>
                      </button>
                    )}
                  </div>
                ) : null}
                {measureEnabled ? (
                  <div className="relative" ref={measureMenuRef}>
                    <button
                      type="button"
                      data-testid="mode-measure"
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                        markerMode === "measure_length" || markerMode === "measure_cable"
                          ? "bg-emerald-600 text-white"
                          : "text-emerald-700 hover:bg-emerald-50"
                      )}
                      onClick={() => setMeasureMenuOpen((v) => !v)}
                      aria-expanded={measureMenuOpen}
                      aria-haspopup="menu"
                      title={t("takeoff.measure.title")}
                      disabled={analyzingRegion || scanningWholePage || scanningWholePageWithAi}
                    >
                      <Ruler className="size-3.5" />
                      <span className="hidden lg:inline">{t("takeoff.measure.title")}</span>
                      <ChevronDown className="size-3" />
                    </button>
                    {measureMenuOpen ? (
                      <div
                        role="menu"
                        className="absolute left-0 top-full z-50 mt-1 w-60 rounded-md border border-border bg-popover p-1 shadow-lg"
                        data-testid="measure-menu"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                          data-testid="measure-length"
                          onClick={() => selectMeasureMode("measure_length")}
                        >
                          <MoveHorizontal className="size-3.5 shrink-0 text-emerald-700" />
                          {t("takeoff.measure.length")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                          data-testid="measure-cable"
                          onClick={() => selectMeasureMode("measure_cable")}
                        >
                          <ScanLine className="size-3.5 shrink-0 text-emerald-700" />
                          {t("takeoff.measure.cableRun")}
                        </button>
                        {isMeasureMode || measurePoints.length > 0 ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                            data-testid="measure-cancel"
                            onClick={() => {
                              setMeasureMenuOpen(false);
                              setMeasurePoints([]);
                              setMeasureHover(null);
                              onMarkerModeChange("select");
                            }}
                          >
                            <X className="size-3.5 shrink-0 text-muted-foreground" />
                            {t("takeoff.measure.cancel")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {after.map(renderModeButton)}
              </>
            );
          })()}
        </div>

        {/* Annotation tools — designer notes (text / sticky note / shapes).
            Presentation only: they never count into the takeoff. */}
        {onAnnotationCreate ? (
          <div
            className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
            data-testid="annotation-tools"
          >
            {(
              [
                { mode: "annotate_text", icon: Type, labelKey: "takeoff.annotate.text" },
                { mode: "annotate_note", icon: StickyNote, labelKey: "takeoff.annotate.note" },
                { mode: "annotate_rect", icon: Square, labelKey: "takeoff.annotate.rect" },
                { mode: "annotate_ellipse", icon: Circle, labelKey: "takeoff.annotate.ellipse" },
              ] as const
            ).map(({ mode, icon: Icon, labelKey }) => (
              <button
                key={mode}
                type="button"
                data-testid={`mode-${mode}`}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                  markerMode === mode
                    ? "bg-[#DC2626] text-white"
                    : "text-[#B91C1C] hover:bg-red-50"
                )}
                onClick={() => onMarkerModeChange(mode)}
                aria-pressed={markerMode === mode}
                title={t(labelKey)}
                disabled={analyzingRegion || scanningWholePage || scanningWholePageWithAi}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        ) : null}

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
          {highlightAll ||
          highlightedIdSet.size > 0 ||
          selectedCandidateId ||
          selectedOccurrenceId ||
          focusEvidence ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              data-testid="hide-all-highlights"
              onClick={() => {
                setHighlightAll(false);
                onClearHighlights?.();
              }}
              title={t("takeoff.viewer.hideHighlightsHint")}
            >
              <EyeOff className="size-3.5" />
              <span className="hidden lg:inline">
                {t("takeoff.viewer.hideHighlights")}
              </span>
            </Button>
          ) : null}
          {regionCandidates.length > 0 || occurrences.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1",
                hideMarks &&
                  "border-[#1D376A] bg-[#1D376A]/10 text-[#1D376A] hover:bg-[#1D376A]/20"
              )}
              data-testid="hide-marks"
              onClick={() => setHideMarks((v) => !v)}
              aria-pressed={hideMarks}
              title={t("takeoff.viewer.hideMarksHint")}
            >
              {hideMarks ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              <span className="hidden lg:inline">
                {hideMarks
                  ? t("takeoff.viewer.showMarks")
                  : t("takeoff.viewer.hideMarks")}
              </span>
            </Button>
          ) : null}
          {measureEnabled &&
          (pageMeasurements.length > 0 || pageCableRuns.length > 0 || pageCalibration) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1",
                hideMeasurements &&
                  "border-emerald-600 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20"
              )}
              data-testid="hide-measurements"
              onClick={() => setHideMeasurements((v) => !v)}
              aria-pressed={hideMeasurements}
              title={t("takeoff.measure.hideMeasurementsHint")}
            >
              <Ruler className="size-3.5" />
              <span className="hidden lg:inline">
                {hideMeasurements
                  ? t("takeoff.measure.showMeasurements")
                  : t("takeoff.measure.hideMeasurements")}
              </span>
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
              : scanningWholePageWithAi || markerMode === "identify"
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
                  : markerMode === "identify"
                    ? identifyingSymbol
                      ? t("takeoff.identify.busy")
                      : t("takeoff.viewer.identifyHint")
                    : isAnnotateMode
                      ? t("takeoff.annotate.hint")
                      : markerMode === "measure_calibrate"
                        ? t("takeoff.measure.calibrateHint")
                        : markerMode === "measure_length"
                          ? t("takeoff.measure.lengthHint")
                          : markerMode === "measure_cable"
                            ? t("takeoff.measure.cableHint")
                            : markerMode === "point"
                              ? pointModeHint ?? t("takeoff.viewer.pointHint")
                              : markerMode === "analyze_region"
                                ? t("takeoff.viewer.analyzeHint")
                                : markerMode === "select"
                                  ? `${t("takeoff.viewer.dragMarkHint")} ${t("takeoff.viewer.keyboardHint")}`
                                  : t("takeoff.viewer.rectHint")}
        </p>
      ) : null}

      {/* Measure warning — e.g. "set the drawing scale first". */}
      {measureNotice ? (
        <p
          className="flex items-center gap-2 border-b border-border bg-amber-500/15 px-3 py-1.5 text-xs text-amber-900"
          role="alert"
          data-testid="measure-notice"
        >
          <span className="flex-1">{measureNotice}</span>
          <button
            type="button"
            className="shrink-0 hover:opacity-70"
            aria-label={t("common.close")}
            onClick={() => setMeasureNotice(null)}
          >
            <X className="size-3.5" />
          </button>
        </p>
      ) : null}

      <div className="flex items-stretch">
        {/* Left rail — sibling documents + page thumbnails (like a desktop
            PDF editor's Pages panel). Hidden for single-page single-doc. */}
        {doc && (documents.length > 1 || (doc.numPages > 1 && pageThumbs.length > 0)) ? (
          railOpen ? (
            <div
              className={cn(
                "flex w-[148px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-muted/30 p-2",
                heightClassName
              )}
              data-testid="pages-rail"
            >
              <button
                type="button"
                className="flex items-center gap-1 self-start rounded px-1 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                onClick={() => setRailOpen(false)}
                title={t("takeoff.rail.collapse")}
              >
                <PanelLeft className="size-3.5" />
                {t("takeoff.rail.title")}
              </button>
              {documents.length > 1 ? (
                <div className="space-y-1">
                  {documents.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight",
                        d.id === activeDocumentId
                          ? "border-primary bg-primary/10 font-semibold text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      )}
                      onClick={() => d.id !== activeDocumentId && onSelectDocument?.(d.id)}
                      title={d.fileName}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{d.fileName}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {doc.numPages > 1
                ? pageThumbs.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      className={cn(
                        "rounded-md border-2 bg-white p-0.5",
                        page === i + 1
                          ? "border-primary"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setPage(i + 1)}
                      aria-label={`${t("takeoff.rail.title")} ${i + 1}`}
                      aria-current={page === i + 1}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full" draggable={false} />
                      <span className="block pt-0.5 text-center text-[10px] tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                    </button>
                  ))
                : null}
            </div>
          ) : (
            <button
              type="button"
              className="flex shrink-0 items-start border-r border-border bg-muted/30 px-1 pt-2 text-muted-foreground hover:bg-muted"
              onClick={() => setRailOpen(true)}
              title={t("takeoff.rail.expand")}
            >
              <PanelLeft className="size-4" />
            </button>
          )
        ) : null}

      {/* Canvas + overlay */}
      <div
        ref={scrollRef}
        className={cn("relative min-w-0 flex-1 overflow-auto bg-muted/60 p-2", heightClassName)}
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
        {/* Cable-route drawing controls — sticky so they stay visible while
            panning/zooming around a large plan mid-draw. */}
        {markerMode === "measure_cable" ? (
          <div className="sticky left-2 top-2 z-30 h-0 w-0 overflow-visible">
            <div
              className="flex w-max items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-white/95 px-2 py-1.5 shadow-md"
              data-testid="measure-cable-bar"
            >
              <span className="px-1 text-xs font-bold tabular-nums text-emerald-800">
                {measurePoints.length === 0
                  ? t("takeoff.measure.cableStartHint")
                  : measureDraftLengthM !== null
                    ? `${measureDraftLengthM} m`
                    : `${measurePoints.length}`}
              </span>
              <Button
                type="button"
                size="sm"
                className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                disabled={measurePoints.length < 2}
                onClick={() => finishCableRun(false)}
                data-testid="measure-finish-run"
                title={`${t("takeoff.measure.finishRun")} (Enter)`}
              >
                <CheckCircle2 className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">{t("takeoff.measure.finishRun")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-emerald-600/50 text-xs text-emerald-700 hover:bg-emerald-50"
                disabled={measurePoints.length < 2}
                onClick={() => finishCableRun(true)}
                data-testid="measure-finish-run-next"
                title={t("takeoff.measure.finishRunNextHint")}
              >
                <Plus className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">{t("takeoff.measure.finishRunNext")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant={measureGapPending ? "default" : "outline"}
                className={cn(
                  "h-7 text-xs",
                  measureGapPending
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "border-amber-500/60 text-amber-700 hover:bg-amber-50"
                )}
                disabled={measurePoints.length === 0}
                onClick={() => setMeasureGapPending((v) => !v)}
                data-testid="measure-gap-jump"
                title={`${t("takeoff.measure.gapJumpHint")} (P)`}
              >
                <MoveHorizontal className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">
                  {measureGapPending
                    ? t("takeoff.measure.gapJumpArmed")
                    : t("takeoff.measure.gapJump")}
                </span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                disabled={measurePoints.length === 0 && !measureGapPending}
                onClick={undoMeasurePoint}
                title={`${t("takeoff.measure.undoPoint")} (Backspace)`}
              >
                <Undo2 className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">{t("takeoff.measure.undoPoint")}</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMeasurePoints([]);
                  setMeasureGapIndexes([]);
                  setMeasureGapPending(false);
                  setMeasureHover(null);
                  onMarkerModeChange("select");
                }}
                title={`${t("takeoff.measure.cancel")} (Esc)`}
              >
                <X className="size-3.5 lg:mr-1" />
                <span className="hidden lg:inline">{t("takeoff.measure.cancel")}</span>
              </Button>
            </div>
          </div>
        ) : null}
        {/* Selected saved route — entry to on-plan vertex editing. */}
        {markerMode === "select" && selectedCableRunOnPage && onCableRunEdit ? (
          <div className="sticky left-2 top-2 z-30 h-0 w-0 overflow-visible">
            <div
              className="flex w-max items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-white/95 px-2 py-1.5 shadow-md"
              data-testid="cable-run-edit-bar"
            >
              <span className="max-w-[220px] truncate px-1 text-xs font-bold text-emerald-800">
                {selectedCableRunOnPage.name}
                {" · "}
                <span className="tabular-nums">
                  {editingCableRunId && editDraftLengthM !== null
                    ? `${editDraftLengthM} m`
                    : `${selectedCableRunOnPage.measured2dLengthM} m`}
                </span>
              </span>
              {editingCableRunId === selectedCableRunOnPage.id ? (
                <>
                  <span className="hidden max-w-[300px] px-1 text-[10px] leading-tight text-muted-foreground lg:inline">
                    {t("takeoff.measure.editRunHint")}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    onClick={stopCableRunEdit}
                    data-testid="cable-run-edit-done"
                    title={`${t("takeoff.measure.editRunDone")} (Esc)`}
                  >
                    <CheckCircle2 className="size-3.5 mr-1" />
                    {t("takeoff.measure.editRunDone")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-emerald-600/50 text-xs text-emerald-700 hover:bg-emerald-50"
                  onClick={() => startCableRunEdit(selectedCableRunOnPage)}
                  data-testid="cable-run-edit-start"
                >
                  <Pencil className="size-3.5 mr-1" />
                  {t("takeoff.measure.editRun")}
                </Button>
              )}
            </div>
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
                : markerMode === "identify"
                  ? // Distinct "what is this?" cursor for the AI identify mode.
                    "cursor-help touch-none"
                  : markerMode !== "select" && "cursor-crosshair touch-none"
            )}
            style={{
              width: canvasSize.width || undefined,
              height: canvasSize.height || undefined,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={() => {
              if (markerMode === "measure_cable") finishCableRun();
            }}
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
                  (isRectDrawMode || panActive || isMeasureMode) && "pointer-events-none"
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

          {/* Designer annotations (text / note / shapes). Click in select
              mode opens the editor (edit text / delete). */}
          {canvasSize.width > 0
            ? pageAnnotations.map((a) => {
                const vr = toView(a.normalizedPosition);
                const left = vr.x * canvasSize.width;
                const top = vr.y * canvasSize.height;
                const width = vr.width * canvasSize.width;
                const height = vr.height * canvasSize.height;
                const clickable = markerMode === "select" && !!(onAnnotationUpdate || onAnnotationDelete);
                const openEditor = clickable
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setAnnEditor({ id: a.id, kind: a.kind, text: a.text });
                    }
                  : undefined;
                if (a.kind === "rect" || a.kind === "ellipse") {
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={cn(
                        "absolute z-20 border-2 bg-transparent",
                        a.kind === "ellipse" && "rounded-full",
                        clickable ? "cursor-pointer" : "pointer-events-none"
                      )}
                      style={{ left, top, width, height, borderColor: a.color }}
                      onClick={openEditor}
                      title={a.text || t("takeoff.annotate.shapeTitle")}
                      aria-label={a.text || t("takeoff.annotate.shapeTitle")}
                    />
                  );
                }
                if (a.kind === "note") {
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={cn(
                        "absolute z-30 flex items-center justify-center rounded-sm shadow",
                        clickable ? "cursor-pointer" : "pointer-events-none"
                      )}
                      style={{
                        left,
                        top,
                        width: Math.max(20, width),
                        height: Math.max(20, height),
                        backgroundColor: "#FDE047",
                        border: "1px solid #CA8A04",
                      }}
                      onClick={openEditor}
                      title={a.text}
                      aria-label={a.text || t("takeoff.annotate.note")}
                    >
                      <StickyNote className="size-3.5 text-yellow-900" />
                    </button>
                  );
                }
                // kind === "text" — the text itself sits on the plan.
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={cn(
                      "absolute z-30 whitespace-pre-wrap bg-transparent text-left font-semibold leading-tight",
                      clickable ? "cursor-pointer" : "pointer-events-none"
                    )}
                    style={{
                      left,
                      top,
                      color: a.color,
                      fontSize: Math.max(11, height * 0.9),
                      textShadow:
                        "1px 1px 0 #fff, -1px 1px 0 #fff, 1px -1px 0 #fff, -1px -1px 0 #fff",
                      maxWidth: canvasSize.width - left - 4,
                    }}
                    onClick={openEditor}
                    title={a.text}
                  >
                    {a.text}
                  </button>
                );
              })
            : null}

          {/* Measure overlay — calibration line, simple lengths, cable
              routes. SVG scaled to canvasSize, so everything follows zoom,
              pan, rotation and refresh exactly like the marks do. */}
          {measureEnabled && canvasSize.width > 0 && !hideMeasurements ? (
            <svg
              className="pointer-events-none absolute inset-0 z-20"
              width={canvasSize.width}
              height={canvasSize.height}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              data-testid="measure-overlay"
            >
              {/* Calibration line */}
              {pageCalibration
                ? (() => {
                    const a = measurePx(pageCalibration.pointA);
                    const b = measurePx(pageCalibration.pointB);
                    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                    return (
                      <g>
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="#2563EB"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                        <circle cx={a.x} cy={a.y} r={3.5} fill="#2563EB" />
                        <circle cx={b.x} cy={b.y} r={3.5} fill="#2563EB" />
                        <text
                          x={mid.x}
                          y={mid.y - 7}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={700}
                          fill="#1D4ED8"
                          stroke="#fff"
                          strokeWidth={3}
                          paintOrder="stroke"
                        >
                          {t("takeoff.measure.scaleLabel", {
                            length: String(pageCalibration.realLengthM),
                          })}
                        </text>
                      </g>
                    );
                  })()
                : null}

              {/* Simple length measurements — deletable by click. Works in
                  select mode AND right after measuring (measure_length):
                  pointer events are stopped so the click never places a new
                  measure point. Hover shows an explicit red ×. */}
              {pageMeasurements.map((m) => {
                const a = measurePx(m.pointA);
                const b = measurePx(m.pointB);
                const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                const clickable =
                  Boolean(onMeasurementDelete) &&
                  (markerMode === "select" || markerMode === "measure_length");
                const isHovered = clickable && m.id === hoveredMeasurementId;
                const askDelete = () =>
                  setDeleteAsk({
                    kind: "measurement",
                    id: m.id,
                    label: m.label ?? `${m.measuredLengthM} m`,
                  });
                return (
                  <g key={m.id}>
                    {clickable ? (
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="transparent"
                        strokeWidth={14}
                        className="pointer-events-auto cursor-pointer"
                        data-testid="measurement-hit"
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          askDelete();
                        }}
                        onMouseEnter={() => setHoveredMeasurementId(m.id)}
                        onMouseLeave={() =>
                          setHoveredMeasurementId((prev) =>
                            prev === m.id ? null : prev
                          )
                        }
                      >
                        <title>{t("takeoff.measure.deleteMeasurementHint")}</title>
                      </line>
                    ) : null}
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={isHovered ? "#DC2626" : "#0D9488"}
                      strokeWidth={isHovered ? 3 : 2}
                    />
                    <circle cx={a.x} cy={a.y} r={3} fill={isHovered ? "#DC2626" : "#0D9488"} />
                    <circle cx={b.x} cy={b.y} r={3} fill={isHovered ? "#DC2626" : "#0D9488"} />
                    <text
                      x={mid.x}
                      y={mid.y - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={700}
                      fill={isHovered ? "#DC2626" : "#0F766E"}
                      stroke="#fff"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {m.measuredLengthM} m
                    </text>
                    {isHovered ? (
                      // Explicit delete affordance — a red × badge above the
                      // label, clickable on its own.
                      <g
                        className="pointer-events-auto cursor-pointer"
                        data-testid="measurement-delete-badge"
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          askDelete();
                        }}
                        onMouseEnter={() => setHoveredMeasurementId(m.id)}
                        onMouseLeave={() =>
                          setHoveredMeasurementId((prev) =>
                            prev === m.id ? null : prev
                          )
                        }
                      >
                        <circle cx={mid.x} cy={mid.y - 22} r={8} fill="#DC2626" />
                        <path
                          d={`M ${mid.x - 3.2} ${mid.y - 25.2} L ${mid.x + 3.2} ${mid.y - 18.8} M ${mid.x + 3.2} ${mid.y - 25.2} L ${mid.x - 3.2} ${mid.y - 18.8}`}
                          stroke="#fff"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                        />
                      </g>
                    ) : null}
                  </g>
                );
              })}

              {/* Cable routes */}
              {pageCableRuns.map((run) => {
                const isEditingThis = run.id === editingCableRunId && !!editDraft;
                const pagePoints = isEditingThis ? editDraft!.points : run.points;
                const gapList = isEditingThis
                  ? editDraft!.gapIndexes
                  : (run.gapIndexes ?? []);
                if (pagePoints.length < 2) return null;
                const pts = pagePoints.map(measurePx);
                const pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(" ");
                const color = categoryColorForKey(categoryKeyForLabel(run.cableTypeName));
                const isPicked = run.id === selectedCableRunId;
                const isHovered = run.id === hoveredCableRunId;
                // Highlight filter: with an active selection everything else
                // fades so the picked routes stand out on a busy plan.
                const highlightActive = highlightedCableRunIds.length > 0;
                const isHighlighted = highlightedCableRunIds.includes(run.id);
                const dimmed =
                  highlightActive &&
                  !isHighlighted &&
                  !isPicked &&
                  !isHovered &&
                  !isEditingThis;
                const emphasized = isPicked || isHovered || isEditingThis || isHighlighted;
                const strokeColor = isPicked ? SELECTED_HIGHLIGHT_COLOR : color;
                const clickable =
                  Boolean(onCableRunClick) && !isMeasureMode && !panActive && !isEditingThis;
                const labelAnchor = pts[Math.floor((pts.length - 1) / 2)];
                return (
                  <g key={run.id}>
                    {clickable ? (
                      <polyline
                        points={pointsAttr}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        className="pointer-events-auto cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCableRunClick?.(run.id);
                        }}
                        onMouseEnter={() => setHoveredCableRunId(run.id)}
                        onMouseLeave={() =>
                          setHoveredCableRunId((prev) => (prev === run.id ? null : prev))
                        }
                      />
                    ) : null}
                    {/* White casing under the route (map-style) — keeps the
                        colored line readable on top of a busy drawing. */}
                    {!dimmed ? (
                      <polyline
                        points={pointsAttr}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={emphasized ? 7 : 5.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={0.85}
                      />
                    ) : null}
                    {/* Per-segment lines: "pen-up" jumps stay visible as
                        dashed thin connectors that are clearly not cable. */}
                    {(() => {
                      const gaps = new Set(gapList);
                      return pts.slice(0, -1).map((p, i) => {
                        const q = pts[i + 1];
                        const isGap = gaps.has(i + 1);
                        return (
                          <line
                            key={i}
                            x1={p.x}
                            y1={p.y}
                            x2={q.x}
                            y2={q.y}
                            stroke={strokeColor}
                            strokeWidth={
                              isGap ? 1.5 : emphasized ? 4 : dimmed ? 1.5 : 2.5
                            }
                            strokeDasharray={isGap ? "3 5" : undefined}
                            strokeLinecap="round"
                            opacity={
                              dimmed ? 0.15 : isGap ? 0.55 : emphasized ? 1 : 0.9
                            }
                            style={
                              isPicked && !isGap
                                ? {
                                    filter: `drop-shadow(0 0 4px ${SELECTED_HIGHLIGHT_COLOR})`,
                                  }
                                : undefined
                            }
                          />
                        );
                      });
                    })()}
                    {isEditingThis
                      ? // Editing: midpoint diamonds insert a vertex and start
                        // dragging it right away (classic polyline editing).
                        pts.slice(0, -1).map((p, i) => {
                          const q = pts[i + 1];
                          const mid = {
                            x: (pagePoints[i].x + pagePoints[i + 1].x) / 2,
                            y: (pagePoints[i].y + pagePoints[i + 1].y) / 2,
                          };
                          return (
                            <rect
                              key={`mid_${i}`}
                              x={(p.x + q.x) / 2 - 4}
                              y={(p.y + q.y) / 2 - 4}
                              width={8}
                              height={8}
                              transform={`rotate(45 ${(p.x + q.x) / 2} ${(p.y + q.y) / 2})`}
                              fill="#fff"
                              stroke={strokeColor}
                              strokeWidth={1.5}
                              opacity={0.85}
                              className="pointer-events-auto cursor-copy"
                              data-testid="cable-run-edit-midpoint"
                              onPointerDown={(e) => {
                                if (e.pointerType === "mouse" && e.button !== 0) return;
                                e.stopPropagation();
                                if (!editDraft) return;
                                const next = insertCableRunPoint(
                                  editDraft.points,
                                  editDraft.gapIndexes,
                                  i,
                                  mid
                                );
                                setEditDraft(next);
                                editDragIndexRef.current = i + 1;
                                overlayRef.current?.setPointerCapture?.(e.pointerId);
                              }}
                            />
                          );
                        })
                      : null}
                    {pts.map((p, i) =>
                      isEditingThis ? (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={6}
                          fill="#fff"
                          stroke={strokeColor}
                          strokeWidth={2.5}
                          className="pointer-events-auto cursor-move"
                          data-testid="cable-run-edit-vertex"
                          onPointerDown={(e) => {
                            if (e.pointerType === "mouse" && e.button !== 0) return;
                            e.stopPropagation();
                            if (e.altKey) {
                              deleteEditVertex(i);
                              return;
                            }
                            editDragIndexRef.current = i;
                            overlayRef.current?.setPointerCapture?.(e.pointerId);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            deleteEditVertex(i);
                          }}
                        >
                          <title>{t("takeoff.measure.editVertexHint")}</title>
                        </circle>
                      ) : // Vertex dots only on emphasized routes — 18 routes
                      // × all dots would bury the plan in white circles.
                      isPicked || isHovered ? (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={4}
                          fill="#fff"
                          stroke={strokeColor}
                          strokeWidth={2}
                        />
                      ) : null
                    )}
                    {/* Label only for emphasized routes — the biggest source
                        of clutter when many routes overlap. */}
                    {emphasized ? (
                      <text
                        x={labelAnchor.x}
                        y={labelAnchor.y - 8}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={700}
                        fill={strokeColor}
                        stroke="#fff"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {`${run.name} – ${run.cableTypeName} – ${run.finalLengthM} m`}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {/* In-progress measure drawing (calibrate / length / cable) */}
              {isMeasureMode && measurePoints.length > 0
                ? (() => {
                    const pts = measurePoints.map(measurePx);
                    const hoverPx = measureHover ? measurePx(measureHover) : null;
                    const color =
                      markerMode === "measure_calibrate"
                        ? "#2563EB"
                        : markerMode === "measure_length"
                          ? "#0D9488"
                          : "#059669";
                    const gapColor = "#D97706";
                    const gaps = new Set(measureGapIndexes);
                    const last = pts[pts.length - 1];
                    const labelPos = hoverPx ?? last;
                    return (
                      <g>
                        {/* Segment-by-segment so "pen-up" jumps render as
                            dashed amber connectors that clearly don't count. */}
                        {pts.slice(0, -1).map((p, i) => {
                          const q = pts[i + 1];
                          const isGap = gaps.has(i + 1);
                          return (
                            <line
                              key={i}
                              x1={p.x}
                              y1={p.y}
                              x2={q.x}
                              y2={q.y}
                              stroke={isGap ? gapColor : color}
                              strokeWidth={isGap ? 2 : 2.5}
                              strokeDasharray={isGap ? "3 5" : undefined}
                              strokeLinecap="round"
                              opacity={isGap ? 0.8 : 1}
                            />
                          );
                        })}
                        {hoverPx ? (
                          <line
                            x1={last.x}
                            y1={last.y}
                            x2={hoverPx.x}
                            y2={hoverPx.y}
                            stroke={measureGapPending ? gapColor : color}
                            strokeWidth={2}
                            strokeDasharray={measureGapPending ? "3 5" : "5 4"}
                          />
                        ) : null}
                        {pts.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={3.5}
                            fill="#fff"
                            stroke={color}
                            strokeWidth={2}
                          />
                        ))}
                        {measureDraftLengthM !== null ? (
                          <text
                            x={labelPos.x + 10}
                            y={labelPos.y - 10}
                            fontSize={12}
                            fontWeight={700}
                            fill={color}
                            stroke="#fff"
                            strokeWidth={3}
                            paintOrder="stroke"
                          >
                            {measureDraftLengthM} m
                          </text>
                        ) : null}
                      </g>
                    );
                  })()
                : null}
            </svg>
          ) : null}

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
                  : markerMode === "identify"
                    ? "border-violet-600 bg-violet-600/10"
                    : markerMode === "annotate_rect" || markerMode === "annotate_ellipse"
                      ? "border-[#DC2626] bg-[#DC26261A]"
                      : "border-[#2563EB] bg-[#2563EB1A]",
                markerMode === "annotate_ellipse" && "rounded-full"
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

      {/* Scale calibration — two points picked, ask for the real length. */}
      <Dialog
        open={!!calibDraft}
        onOpenChange={(open) => {
          if (!open) setCalibDraft(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.measure.calibrateDialogTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("takeoff.measure.calibrateDialogBody")}
          </p>
          <input
            type="text"
            inputMode="decimal"
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
            value={calibLengthText}
            onChange={(e) => setCalibLengthText(e.target.value)}
            placeholder={t("takeoff.measure.calibrateInputPlaceholder")}
            autoFocus
            data-testid="measure-calibrate-input"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              document
                .querySelector<HTMLButtonElement>("[data-testid='measure-calibrate-save']")
                ?.click();
            }}
          />
          {calibLengthText.trim() && parseRealLengthToMeters(calibLengthText) === null ? (
            <p className="text-xs text-red-600">
              {t("takeoff.measure.calibrateInputInvalid")}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCalibDraft(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              data-testid="measure-calibrate-save"
              disabled={parseRealLengthToMeters(calibLengthText) === null}
              onClick={() => {
                if (!calibDraft || !pagePtSize || pagePtSize.pageNum !== calibDraft.pageNumber)
                  return;
                const realLengthM = parseRealLengthToMeters(calibLengthText);
                if (realLengthM === null) return;
                const result = computeScaleCalibration({
                  pointA: calibDraft.pointA,
                  pointB: calibDraft.pointB,
                  pageWidthPt: pagePtSize.widthPt,
                  pageHeightPt: pagePtSize.heightPt,
                  realLengthM,
                });
                if (!result) {
                  setMeasureNotice(t("takeoff.measure.calibratePointsTooClose"));
                  setCalibDraft(null);
                  return;
                }
                onCalibrationSave?.({
                  pageNumber: calibDraft.pageNumber,
                  pointA: calibDraft.pointA,
                  pointB: calibDraft.pointB,
                  pageWidthPt: pagePtSize.widthPt,
                  pageHeightPt: pagePtSize.heightPt,
                  realLengthM,
                  pdfDistancePt: result.pdfDistancePt,
                  metersPerPdfPoint: result.metersPerPdfPoint,
                });
                setCalibDraft(null);
                setMeasureNotice(null);
                onMarkerModeChange("select");
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New text/note annotation — collect the text before creating. */}
      <Dialog
        open={!!annDraft}
        onOpenChange={(open) => {
          if (!open) setAnnDraft(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {annDraft?.kind === "note"
                ? t("takeoff.annotate.newNoteTitle")
                : t("takeoff.annotate.newTextTitle")}
            </DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"
            value={annDraftText}
            onChange={(e) => setAnnDraftText(e.target.value)}
            placeholder={t("takeoff.annotate.textPlaceholder")}
            autoFocus
            data-testid="annotation-text-input"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAnnDraft(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              data-testid="annotation-save"
              disabled={!annDraftText.trim()}
              onClick={() => {
                if (!annDraft || !annDraftText.trim()) return;
                const text = annDraftText.trim();
                // Text height drives the rendered font size; scale with the
                // note anchor so it stays readable but proportional.
                const normalized =
                  annDraft.kind === "text"
                    ? {
                        ...annDraft.normalized,
                        height: Math.max(annDraft.normalized.height, 14 / (canvasSize.height || 800)),
                      }
                    : annDraft.normalized;
                onAnnotationCreate?.({
                  kind: annDraft.kind,
                  pageNumber: annDraft.pageNumber,
                  normalized,
                  text,
                });
                setAnnDraft(null);
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit / delete an existing annotation. */}
      <Dialog
        open={!!annEditor}
        onOpenChange={(open) => {
          if (!open) setAnnEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("takeoff.annotate.editTitle")}</DialogTitle>
          </DialogHeader>
          {annEditor?.kind === "rect" || annEditor?.kind === "ellipse" ? (
            <p className="text-sm text-muted-foreground">
              {t("takeoff.annotate.shapeEditHint")}
            </p>
          ) : (
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm"
              value={annEditor?.text ?? ""}
              onChange={(e) =>
                setAnnEditor((prev) => (prev ? { ...prev, text: e.target.value } : prev))
              }
              autoFocus
              data-testid="annotation-edit-input"
            />
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {onAnnotationDelete ? (
              <Button
                type="button"
                variant="destructive"
                data-testid="annotation-delete"
                onClick={() => {
                  if (annEditor) onAnnotationDelete(annEditor.id);
                  setAnnEditor(null);
                }}
              >
                <Trash2 className="mr-1 size-3.5" />
                {t("takeoff.review.delete")}
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setAnnEditor(null)}>
                {t("common.cancel")}
              </Button>
              {annEditor && annEditor.kind !== "rect" && annEditor.kind !== "ellipse" && onAnnotationUpdate ? (
                <Button
                  type="button"
                  data-testid="annotation-edit-save"
                  disabled={!annEditor.text.trim()}
                  onClick={() => {
                    onAnnotationUpdate(annEditor.id, { text: annEditor.text.trim() });
                    setAnnEditor(null);
                  }}
                >
                  {t("common.save")}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Re-export for the workbench so screen positioning helpers stay in one place.
export { occurrenceColor };
