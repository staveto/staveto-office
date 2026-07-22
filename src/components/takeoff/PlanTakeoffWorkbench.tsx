"use client";

/**
 * Plan Takeoff Workbench — split view: interactive PDF drawing on the left,
 * linked occurrence list + detail + quote draft on the right.
 *
 * Manual-first: marking, editing, confirming and quoting all work without
 * any AI. "Find similar symbols" adds candidates (needs_review) on top and
 * never auto-confirms anything.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nContext";
import type {
  DrawingOccurrence,
  DrawingOccurrenceInput,
  NormalizedRect,
  TakeoffTrade,
} from "@/types/drawingTakeoff";
import type {
  AnalyzeRegionCandidateDto,
  AnalyzeRegionResponse,
  CableInstallationType,
  CableRun,
  DrawingAnnotation,
  DrawingAnnotationKind,
  DrawingMeasurement,
  DrawingScaleCalibration,
  NormalizedPoint,
  TakeoffItem,
} from "@/types/pdfTakeoff";
import { defaultUnitFor, typesForTrade } from "@/lib/takeoff/drawingTakeoff";
import { buildQuoteLinesFromOccurrences } from "@/lib/takeoff/quoteGeneration";
import {
  listDrawingOccurrences,
  createDrawingOccurrence,
  createDrawingOccurrences,
  updateDrawingOccurrence,
  deleteDrawingOccurrence,
} from "@/services/takeoff/drawingOccurrenceService";
import { findSimilarSymbols } from "@/services/takeoff/similarSymbolDetectionService";
import {
  findSimilarForCandidate,
  findSimilarForConfirmedSymbol,
} from "@/services/takeoff/confirmedSymbolSimilarService";
import { analyzeDrawingRegion, scanWholeDrawingPage } from "@/services/takeoff/analyzeRegionService";
import {
  identifySymbolWithAi,
  scanWholeDrawingPageWithAi,
  symbolTypeForAiCategory,
  type IdentifySymbolResult,
} from "@/services/takeoff/aiSymbolScanService";
import {
  deleteTakeoffItem,
  listTakeoffEvidenceForItem,
  listTakeoffItems,
  listSymbolCandidatesForDrawing,
  saveSymbolCandidates,
  updateSymbolCandidateStatus,
  upsertTakeoffItem,
  watchTakeoffItems,
} from "@/services/takeoff/pdfTakeoffRegionService";
import {
  createDrawingAnnotation,
  deleteDrawingAnnotation,
  updateDrawingAnnotation,
  watchDrawingAnnotations,
} from "@/services/takeoff/drawingAnnotationsService";
import {
  deleteCableRun,
  deleteDrawingMeasurement,
  deleteScaleCalibration,
  upsertCableRun,
  upsertDrawingMeasurement,
  upsertScaleCalibration,
  watchCableRuns,
  watchDrawingMeasurements,
  watchScaleCalibrations,
} from "@/services/takeoff/drawingMeasurementsService";
import {
  CABLE_RUN_DEFAULTS,
  cableRunGroupKey,
  computeCableRunTotals,
  convertCableRunsToTakeoffItems,
  polylineLengthMeters,
} from "@/lib/takeoff/cableMeasurement";
import { CableRunsPanel } from "./CableRunsPanel";
import {
  changeConfirmedSymbolType,
  changeSymbolCandidateType,
  confirmAllProbableCandidates,
  confirmSymbolCandidate,
  deleteCandidate,
  DuplicateConfirmedSymbolError,
  markSymbolCandidateUnknownType,
  moveCandidateOrConfirmedSymbol,
  moveConfirmedSymbolToCategory,
  rejectSymbolCandidate,
  unconfirmAndDeleteSymbol,
} from "@/services/takeoff/symbolCandidateReviewService";
import {
  buildManualCandidateDto,
  defaultLabelForSymbolType,
  dtoFromSymbolCandidate,
} from "@/lib/takeoff/candidateReview";
import {
  categoryKeyForLabel,
  categoryLabelForCandidate,
} from "@/lib/takeoff/takeoffCategories";
import {
  addTakeoffLinesToQuoteDraft,
  syncCatalogMarkedQtyToQuote,
} from "@/services/takeoff/takeoffQuoteService";
import {
  isPdfTakeoffAiScanEnabled,
  isPdfTakeoffRegionAnalyzerEnabled,
  isTakeoffDetectionDebugEnabled,
} from "@/lib/ai/aiEstimatorFeature";
import {
  deriveAnalyzeNotice,
  type AnalyzeNoticeKind,
  type RegionAnalyzeDebug,
} from "@/lib/takeoff/regionAnalyzer";
import { TakeoffDetectionDebugPanel } from "./TakeoffDetectionDebugPanel";
import { DrawingPdfViewer, type MarkerMode } from "./DrawingPdfViewer";
import { TakeoffRightPanel } from "./TakeoffRightPanel";
import {
  SymbolCandidateReviewPanel,
  type EvidenceThumb,
} from "./SymbolCandidateReviewPanel";
import { QuoteDraftPanel } from "./QuoteDraftPanel";
import { TradeTypeSelector } from "./TradeTypeSelector";
import { setProjectVisualTakeoffStatus } from "@/services/takeoff/ensureDraftForVisualTakeoff";
import { buildDrawingTakeoffSummary } from "@/lib/takeoff/drawingTakeoffSummary";
import { visualTakeoffResumeHref } from "@/lib/takeoff/visualTakeoffResume";
import {
  resolveTakeoffPermissions,
  takeoffRoute,
  type TakeoffMode,
} from "@/lib/takeoff/takeoffMode";
import {
  ArrowLeft,
  CheckCircle2,
  Maximize2,
  Minimize2,
  ScanSearch,
  Square,
  X,
} from "lucide-react";

/**
 * Legacy modes ("default", "quote-precheck") map onto the shared TakeoffMode
 * contract: default → project, quote-precheck → quote (+ precheck banner).
 */
export type TakeoffWorkbenchMode = "default" | "quote-precheck" | TakeoffMode;
export type TakeoffReturnTo = "new-project-proposal" | "quote-review" | "documents";

type CatalogMarkBinding = {
  productId: string;
  unitPrice: number;
  unit: string;
  note?: string;
  quoteItemId?: string;
};

type Props = {
  projectId: string;
  drawingId: string;
  fileName: string;
  fileUrl: string | null;
  mode?: TakeoffWorkbenchMode;
  quoteId?: string | null;
  documentId?: string | null;
  /** Deep link: open on this page (1-based). */
  initialPage?: number;
  /** Deep link: focus this bbox (normalized page coords). */
  initialBbox?: NormalizedRect | null;
  /** Permission overrides — defaults come from the mode. */
  allowEdit?: boolean;
  allowAnalyze?: boolean;
  allowConfirm?: boolean;
  allowCreateQuoteItems?: boolean;
  allowCreateProjectTasks?: boolean;
  /** False for users without project edit rights — forces view-only. */
  canEditProject?: boolean;
  onClose?: () => void;
  returnTo?: TakeoffReturnTo;
  showFinishButton?: boolean;
  onFinished?: (destination: string) => void;
  /** Sibling PDF documents for the viewer's left rail (stacked switcher). */
  documents?: Array<{ id: string; fileName: string }>;
  onSelectDocument?: (documentId: string) => void;
};

type PendingMarker = { pageNumber: number; rect: NormalizedRect };

function normalizeTakeoffMode(mode: TakeoffWorkbenchMode): TakeoffMode {
  if (mode === "default") return "project";
  if (mode === "quote-precheck") return "quote";
  return mode;
}

export function PlanTakeoffWorkbench({
  projectId,
  drawingId,
  fileName,
  fileUrl,
  mode = "default",
  quoteId = null,
  documentId = null,
  initialPage,
  initialBbox = null,
  allowEdit,
  allowAnalyze,
  allowConfirm,
  allowCreateQuoteItems,
  allowCreateProjectTasks,
  canEditProject = true,
  onClose,
  returnTo = "documents",
  showFinishButton,
  onFinished,
  documents = [],
  onSelectDocument,
}: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const quotePrecheck = mode === "quote-precheck";
  const takeoffMode = normalizeTakeoffMode(mode);
  const perms = resolveTakeoffPermissions({
    mode: takeoffMode,
    canEditProject,
    overrides: {
      ...(allowEdit !== undefined ? { allowEdit } : {}),
      ...(allowAnalyze !== undefined ? { allowAnalyze } : {}),
      ...(allowConfirm !== undefined ? { allowConfirm } : {}),
      ...(allowCreateQuoteItems !== undefined ? { allowCreateQuoteItems } : {}),
      ...(allowCreateProjectTasks !== undefined ? { allowCreateProjectTasks } : {}),
    },
  });
  void allowCreateProjectTasks;
  const finishEnabled = (showFinishButton ?? quotePrecheck) && perms.allowConfirm;
  const [occurrences, setOccurrences] = useState<DrawingOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markerMode, setMarkerMode] = useState<MarkerMode>("select");
  const [pendingMarker, setPendingMarker] = useState<PendingMarker | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [findSimilarBusy, setFindSimilarBusy] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState<string | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const regionAnalyzerEnabled = isPdfTakeoffRegionAnalyzerEnabled();
  const aiScanEnabled = isPdfTakeoffAiScanEnabled();
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [scanningWholePage, setScanningWholePage] = useState(false);
  const [scanningWholePageWithAi, setScanningWholePageWithAi] = useState(false);
  // "Čo je táto značka?" — AI identification dialog. Two entry points:
  // an existing mark (candidateId) or a bare click in "identify" mode
  // BEFORE any mark exists (candidateId null + point).
  const [identifyFor, setIdentifyFor] = useState<{
    candidateId: string | null;
    /** Where the user clicked in identify mode (no mark exists yet). */
    point?: { pageNumber: number; clickedRect: NormalizedRect };
    busy: boolean;
    result: IdentifySymbolResult | null;
    failed: boolean;
    /** Underlying error message — shown small under the failure text. */
    failedDetail?: string;
  } | null>(null);
  const [regionCandidates, setRegionCandidates] = useState<AnalyzeRegionCandidateDto[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [lastAnalyzeSummary, setLastAnalyzeSummary] = useState<AnalyzeRegionResponse["summary"] | null>(
    null
  );
  const [planQualityLabel, setPlanQualityLabel] = useState<string | null>(null);
  // Dev-only detection diagnostics (never persisted).
  const detectionDebugEnabled = isTakeoffDetectionDebugEnabled();
  const [lastDebug, setLastDebug] = useState<RegionAnalyzeDebug | null>(null);
  const [lastRegionImageUrl, setLastRegionImageUrl] = useState<string | null>(null);
  // Inline analyze feedback shown right at the viewer (not just a toast).
  const [analyzeNotice, setAnalyzeNotice] = useState<
    AnalyzeNoticeKind | "failed" | null
  >(null);
  const [takeoffItems, setTakeoffItems] = useState<TakeoffItem[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [focusEvidence, setFocusEvidence] = useState<{
    pageNumber: number;
    normalized: NormalizedRect;
    token: number;
  } | null>(null);
  const [evidenceThumbs, setEvidenceThumbs] = useState<{
    itemId: string;
    itemName: string;
    thumbs: EvidenceThumb[];
  } | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    candidateId: string;
    existingSymbolId: string;
    existingPageNumber: number;
    existingNormalized: NormalizedRect;
  } | null>(null);
  const [lastConfirmedSymbol, setLastConfirmedSymbol] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [similarFromConfirmedBusy, setSimilarFromConfirmedBusy] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Rapid category marking — the operator picks/creates a position (e.g.
  // "Svetlo LED 12W") and click-counts its symbols on the plan. Every click
  // creates AND confirms a mark of that category — no per-click dialog.
  // Catalog bindings keep quote draft qty/price in sync while marking.
  const [activeCategory, setActiveCategory] = useState<{
    key: string;
    label: string;
    symbolType: string;
    catalog?: CatalogMarkBinding;
  } | null>(null);
  const catalogBindingsRef = useRef<Map<string, CatalogMarkBinding>>(new Map());
  // "Zvýrazniť" on category rows — each toggles independently, so any
  // combination of positions can glow on the plan at once. Mark ids are
  // derived (not stored) so marks added later to a highlighted category
  // start glowing immediately.
  const [highlightedCategoryKeys, setHighlightedCategoryKeys] = useState<string[]>([]);

  // Side-panel width is only meaningful in the side-by-side layout — below
  // that both columns stack full-width and the drag handle is hidden.
  // IMPORTANT: wide vs stacked is decided by the CONTAINER width, not the
  // viewport — embedded in a narrow quote column the viewport can be huge
  // while the workbench itself has ~600px; side-by-side there would squeeze
  // the PDF into a useless sliver next to the fixed-width panel.
  const RIGHT_PANEL_MIN_PX = 320;
  const RIGHT_PANEL_MAX_PX = 900;
  /** Minimum container width for PDF + panel side by side (PDF keeps ≥560px). */
  const WIDE_LAYOUT_MIN_CONTAINER_PX = 1024;
  const RIGHT_PANEL_STORAGE_KEY = "takeoff.rightPanelWidthPx";
  const [isWideLayout, setIsWideLayout] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(440);
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const layoutContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = layoutContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () =>
      setIsWideLayout(el.clientWidth >= WIDE_LAYOUT_MIN_CONTAINER_PX);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(RIGHT_PANEL_STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= RIGHT_PANEL_MIN_PX && saved <= RIGHT_PANEL_MAX_PX) {
      setRightPanelWidth(saved);
    }
  }, []);

  const handlePanelResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      panelResizeRef.current = { startX: e.clientX, startWidth: rightPanelWidth };
      const onMove = (ev: PointerEvent) => {
        const drag = panelResizeRef.current;
        if (!drag) return;
        // Panel sits on the right — dragging the handle LEFT (negative delta) widens it.
        const next = drag.startWidth + (drag.startX - ev.clientX);
        setRightPanelWidth(Math.min(RIGHT_PANEL_MAX_PX, Math.max(RIGHT_PANEL_MIN_PX, next)));
      };
      const onUp = () => {
        panelResizeRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setRightPanelWidth((w) => {
          window.localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(w));
          return w;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [rightPanelWidth]
  );

  // Fullscreen review mode — Escape exits, body scroll stays locked.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);
  // "candidates" (Kandidáti) is the primary, actively-maintained list.
  // "occurrences" (Značky) only holds older manual marks — see the effect
  // below that keeps the user off an empty legacy tab.
  const [rightTab, setRightTab] = useState<"occurrences" | "candidates">("candidates");
  useEffect(() => {
    if (rightTab === "occurrences" && occurrences.length === 0) setRightTab("candidates");
  }, [rightTab, occurrences.length]);

  // Add-dialog form state (remembers last trade/type for fast repeated marking).
  const [formTrade, setFormTrade] = useState<TakeoffTrade>("electrical");
  const [formType, setFormType] = useState<string>("socket");
  const [formLabel, setFormLabel] = useState("");
  const [formNote, setFormNote] = useState("");

  // Deep link (evidence from quote/project): focus the bbox once on mount.
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkAppliedRef.current || !initialBbox) return;
    deepLinkAppliedRef.current = true;
    setFocusEvidence({
      pageNumber: Math.max(1, initialPage ?? 1),
      normalized: initialBbox,
      token: Date.now(),
    });
  }, [initialBbox, initialPage]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Load persisted occurrences + active candidates + takeoff items.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listDrawingOccurrences(projectId, drawingId),
      // All statuses — panel sections split candidates / confirmed / rejected.
      regionAnalyzerEnabled
        ? listSymbolCandidatesForDrawing(projectId, drawingId)
        : Promise.resolve([]),
      regionAnalyzerEnabled
        ? listTakeoffItems(projectId, drawingId)
        : Promise.resolve([]),
    ])
      .then(([list, candidates, items]) => {
        if (cancelled) return;
        setOccurrences(list);
        if (candidates.length) {
          setRegionCandidates(candidates.map(dtoFromSymbolCandidate));
          setRightTab("candidates");
        }
        setTakeoffItems(items);
      })
      .catch(() => {
        if (!cancelled) showToast(t("takeoff.toast.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, drawingId, showToast, t, regionAnalyzerEnabled]);

  // ---- Marking / region analyze ---------------------------------------------

  const handleAnalyzeRegion = useCallback(
    async (pageNumber: number, rect: NormalizedRect) => {
      if (analyzeBusy) return;
      if (!fileUrl) {
        // Never end in "nothing happened" — tell the user why.
        setAnalyzeNotice("failed");
        return;
      }
      setAnalyzeBusy(true);
      setSelectedCandidateId(null);
      setAnalyzeNotice(null);
      try {
        const result = await analyzeDrawingRegion({
          projectId,
          drawingId,
          fileUrl,
          pageNumber,
          normalizedBbox: rect,
          profession: formTrade,
        });
        // Analyze replaces the working set with fresh candidates; keep already
        // confirmed/rejected rows so the panel sections stay complete.
        setRegionCandidates((prev) => [
          ...prev.filter((c) => c.status === "confirmed" || c.status === "rejected"),
          ...result.candidates,
        ]);
        setLastAnalyzeSummary(result.summary);
        setLastDebug(result.debug ?? null);
        setLastRegionImageUrl(result.region_image_url ?? null);
        setPlanQualityLabel(
          t("takeoff.analyzeRegion.planQualityDetail", {
            type: result.plan_quality.detected_plan_type,
            ocr: result.plan_quality.ocr_required
              ? t("takeoff.analyzeRegion.ocrYes")
              : t("takeoff.analyzeRegion.ocrNo"),
          })
        );
        // Inline notice next to the viewer — visible feedback is mandatory
        // (global toast alone is easy to miss in fullscreen).
        setAnalyzeNotice(
          deriveAnalyzeNotice({
            candidateCount: result.candidates.length,
            autoExpanded: result.region_expanded ?? false,
          })
        );
        showToast(
          t("takeoff.toast.analyzeRegionDone", { count: result.candidates.length })
        );
        setMarkerMode("select");
        setRightTab("candidates");
      } catch {
        setAnalyzeNotice("failed");
        showToast(t("takeoff.toast.analyzeRegionFailed"));
      } finally {
        setAnalyzeBusy(false);
      }
    },
    [fileUrl, analyzeBusy, projectId, drawingId, formTrade, showToast, t]
  );

  // "Skenovať celú stranu" — tiled whole-page scan (Task 5). Same guarantees
  // as region analyze: only symbolCandidates, never confirmed/items/evidence.
  const handleScanWholePage = useCallback(
    async (pageNumber: number) => {
      if (scanningWholePage || analyzeBusy) return;
      if (!fileUrl) {
        setAnalyzeNotice("failed");
        return;
      }
      setScanningWholePage(true);
      setSelectedCandidateId(null);
      setAnalyzeNotice(null);
      try {
        const result = await scanWholeDrawingPage({
          projectId,
          drawingId,
          fileUrl,
          pageNumber,
          profession: formTrade,
        });
        setRegionCandidates((prev) => [
          ...prev.filter((c) => c.status === "confirmed" || c.status === "rejected"),
          ...result.candidates,
        ]);
        setLastAnalyzeSummary(result.summary);
        setLastDebug(result.debug ?? null);
        setLastRegionImageUrl(null);
        setPlanQualityLabel(
          t("takeoff.analyzeRegion.planQualityDetail", {
            type: result.plan_quality.detected_plan_type,
            ocr: result.plan_quality.ocr_required
              ? t("takeoff.analyzeRegion.ocrYes")
              : t("takeoff.analyzeRegion.ocrNo"),
          })
        );
        setAnalyzeNotice(result.candidates.length === 0 ? "empty" : null);
        showToast(t("takeoff.toast.scanWholePageDone", { count: result.candidates.length }));
        setMarkerMode("select");
        setRightTab("candidates");
      } catch {
        setAnalyzeNotice("failed");
        showToast(t("takeoff.toast.scanWholePageFailed"));
      } finally {
        setScanningWholePage(false);
      }
    },
    [scanningWholePage, analyzeBusy, fileUrl, projectId, drawingId, formTrade, showToast, t]
  );

  // "Skenovať AI (Gemini)" — explicit, paid opt-in scan using vision AI
  // instead of the local color/template pipeline. Only ever adds review
  // candidates (source: "gemini"); existing candidates/confirmed symbols on
  // the page are never touched or duplicated.
  const handleScanWholePageWithAi = useCallback(
    async (pageNumber: number) => {
      if (scanningWholePageWithAi || scanningWholePage || analyzeBusy) return;
      if (!fileUrl) {
        setAnalyzeNotice("failed");
        return;
      }
      setScanningWholePageWithAi(true);
      setSelectedCandidateId(null);
      setAnalyzeNotice(null);
      try {
        // Everything already marked on this page blocks duplicate proposals:
        // candidates + confirmed marks AND legacy manual occurrence marks.
        const existingOnPage = [
          ...regionCandidates.filter((c) => (c.page_number ?? 1) === pageNumber),
          ...occurrences
            .filter((o) => o.pageNumber === pageNumber)
            .map((o) => ({
              page_number: o.pageNumber,
              // Occurrence statuses don't map 1:1 to candidate statuses —
              // for duplicate-blocking only "rejected or not" matters.
              status:
                o.status === "rejected"
                  ? ("rejected" as const)
                  : ("confirmed" as const),
              normalized_position: o.normalizedPosition,
            })),
        ];
        const result = await scanWholeDrawingPageWithAi({
          projectId,
          drawingId,
          fileUrl,
          pageNumber,
          profession: formTrade,
          language: locale,
          existingCandidates: existingOnPage,
        });
        setRegionCandidates((prev) => [...prev, ...result.candidates]);
        // Unlike the local scan, "0 new candidates" from AI usually means
        // "everything it saw is already marked" rather than "found nothing"
        // — the generic empty-region banner would be misleading here, so
        // this state only gets the dedicated toast below, no inline notice.
        if (result.candidates.length === 0 && result.text_like_filtered > 0) {
          showToast(t("takeoff.toast.scanWholePageAiOnlyText", { count: result.text_like_filtered }));
        } else {
          showToast(
            result.candidates.length === 0
              ? t("takeoff.toast.scanWholePageAiEmpty")
              : t("takeoff.toast.scanWholePageAiDone", { count: result.candidates.length })
          );
        }
        setMarkerMode("select");
        setRightTab("candidates");
      } catch {
        setAnalyzeNotice("failed");
        showToast(t("takeoff.toast.scanWholePageAiFailed"));
      } finally {
        setScanningWholePageWithAi(false);
      }
    },
    [
      scanningWholePageWithAi,
      scanningWholePage,
      analyzeBusy,
      fileUrl,
      projectId,
      drawingId,
      formTrade,
      locale,
      regionCandidates,
      occurrences,
      showToast,
      t,
    ]
  );

  const refreshTakeoffItems = useCallback(async () => {
    const items = await listTakeoffItems(projectId, drawingId);
    setTakeoffItems(items);
  }, [projectId, drawingId]);

  // Live takeoff-items mirror — quantities edited from the quote "Výkaz a
  // ceny" (or any other surface sharing the canonical drawingId) show up in
  // this panel's item list immediately, not only after a local action.
  useEffect(() => {
    if (!regionAnalyzerEnabled) return;
    return watchTakeoffItems(projectId, drawingId, setTakeoffItems);
  }, [regionAnalyzerEnabled, projectId, drawingId]);

  // Designer annotations (text/notes/shapes) — live, shared across quote
  // and Documents views via the canonical drawingId. Never takeoff data.
  const [annotations, setAnnotations] = useState<DrawingAnnotation[]>([]);
  useEffect(() => {
    return watchDrawingAnnotations(projectId, drawingId, setAnnotations);
  }, [projectId, drawingId]);

  const handleAnnotationCreate = useCallback(
    (input: {
      kind: DrawingAnnotationKind;
      pageNumber: number;
      normalized: NormalizedRect;
      text: string;
    }) => {
      void createDrawingAnnotation({
        projectId,
        drawingId,
        pageNumber: input.pageNumber,
        kind: input.kind,
        normalizedPosition: input.normalized,
        text: input.text,
      }).catch(() => showToast(t("takeoff.toast.saveFailed")));
    },
    [projectId, drawingId, showToast, t]
  );

  const handleAnnotationUpdate = useCallback(
    (annotationId: string, patch: { text: string }) => {
      void updateDrawingAnnotation(projectId, annotationId, patch).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, showToast, t]
  );

  const handleAnnotationDelete = useCallback(
    (annotationId: string) => {
      void deleteDrawingAnnotation(projectId, annotationId).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, showToast, t]
  );

  // ---- Measure tool (scale calibration, lengths, cable runs) ---------------

  const [calibrations, setCalibrations] = useState<DrawingScaleCalibration[]>([]);
  const [drawingMeasurements, setDrawingMeasurements] = useState<DrawingMeasurement[]>([]);
  const [cableRuns, setCableRuns] = useState<CableRun[]>([]);
  const [selectedCableRunId, setSelectedCableRunId] = useState<string | null>(null);
  /** Highlight filter for routes — non-empty fades all other routes. */
  const [highlightedCableRunIds, setHighlightedCableRunIds] = useState<string[]>([]);
  /** One-shot request forwarded to the viewer: open vertex editing. */
  const [cableRunEditRequest, setCableRunEditRequest] = useState<{
    runId: string;
    requestId: number;
  } | null>(null);
  const [cableExportBusy, setCableExportBusy] = useState(false);
  const [cableExportMessage, setCableExportMessage] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState(initialPage ?? 1);

  useEffect(() => {
    return watchScaleCalibrations(projectId, drawingId, setCalibrations);
  }, [projectId, drawingId]);
  useEffect(() => {
    return watchDrawingMeasurements(projectId, drawingId, setDrawingMeasurements);
  }, [projectId, drawingId]);
  useEffect(() => {
    return watchCableRuns(projectId, drawingId, setCableRuns);
  }, [projectId, drawingId]);

  const calibrationForPage = useCallback(
    (pageNumber: number) =>
      calibrations.find((c) => c.pageNumber === pageNumber) ?? null,
    [calibrations]
  );

  const handleCalibrationSave = useCallback(
    (input: {
      pageNumber: number;
      pointA: NormalizedPoint;
      pointB: NormalizedPoint;
      pageWidthPt: number;
      pageHeightPt: number;
      realLengthM: number;
      pdfDistancePt: number;
      metersPerPdfPoint: number;
    }) => {
      void (async () => {
        try {
          const saved = await upsertScaleCalibration(projectId, {
            projectId,
            drawingId,
            ...input,
          });
          // Re-scale everything already measured on this page — a changed
          // calibration must not leave stale lengths behind.
          const pageRuns = cableRuns.filter((r) => r.pageNumber === input.pageNumber);
          for (const run of pageRuns) {
            const totals = computeCableRunTotals(run, saved);
            if (!totals) continue;
            await upsertCableRun(projectId, {
              ...run,
              measured2dLengthM: totals.measured2dLengthM,
              finalLengthM: totals.finalLengthM,
            });
          }
          const pageMeasurements = drawingMeasurements.filter(
            (m) => m.pageNumber === input.pageNumber
          );
          for (const m of pageMeasurements) {
            const lengthM = polylineLengthMeters([m.pointA, m.pointB], saved);
            if (lengthM === null) continue;
            await upsertDrawingMeasurement(projectId, {
              ...m,
              measuredLengthM: Math.round(lengthM * 100) / 100,
            });
          }
          showToast(t("takeoff.measure.toastScaleSaved"));
        } catch {
          showToast(t("takeoff.toast.saveFailed"));
        }
      })();
    },
    [projectId, drawingId, cableRuns, drawingMeasurements, showToast, t]
  );

  const handleCalibrationReset = useCallback(
    (pageNumber: number) => {
      void deleteScaleCalibration(projectId, drawingId, pageNumber).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, drawingId, showToast, t]
  );

  const handleMeasurementCreate = useCallback(
    (input: {
      pageNumber: number;
      pointA: NormalizedPoint;
      pointB: NormalizedPoint;
      measuredLengthM: number;
    }) => {
      void upsertDrawingMeasurement(projectId, {
        projectId,
        drawingId,
        pageNumber: input.pageNumber,
        type: "length",
        pointA: input.pointA,
        pointB: input.pointB,
        measuredLengthM: input.measuredLengthM,
      }).catch(() => showToast(t("takeoff.toast.saveFailed")));
    },
    [projectId, drawingId, showToast, t]
  );

  const handleMeasurementDelete = useCallback(
    (measurementId: string) => {
      void deleteDrawingMeasurement(projectId, measurementId).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, showToast, t]
  );

  const handleCableRunDrawn = useCallback(
    (pageNumber: number, points: NormalizedPoint[], gapIndexes: number[] = []) => {
      const calibration = calibrationForPage(pageNumber);
      if (!calibration) {
        showToast(t("takeoff.measure.scaleMissing"));
        return;
      }
      const draft = {
        points,
        gapIndexes,
        verticalLengthM: CABLE_RUN_DEFAULTS.verticalLengthM,
        fixedReserveM: CABLE_RUN_DEFAULTS.fixedReserveM,
        reservePercent: CABLE_RUN_DEFAULTS.reservePercent,
        roundingStepM: CABLE_RUN_DEFAULTS.roundingStepM,
      };
      const totals = computeCableRunTotals(draft, calibration);
      if (!totals) {
        showToast(t("takeoff.measure.scaleMissing"));
        return;
      }
      const pageRunCount = cableRuns.filter((r) => r.pageNumber === pageNumber).length;
      void upsertCableRun(projectId, {
        projectId,
        drawingId,
        pageNumber,
        name: `${t("takeoff.measure.defaultRunName")} ${pageRunCount + 1}`,
        cableTypeName: CABLE_RUN_DEFAULTS.cableTypeName,
        installationType: CABLE_RUN_DEFAULTS.installationType,
        points,
        gapIndexes,
        measured2dLengthM: totals.measured2dLengthM,
        verticalLengthM: CABLE_RUN_DEFAULTS.verticalLengthM,
        fixedReserveM: CABLE_RUN_DEFAULTS.fixedReserveM,
        reservePercent: CABLE_RUN_DEFAULTS.reservePercent,
        roundingStepM: CABLE_RUN_DEFAULTS.roundingStepM,
        finalLengthM: totals.finalLengthM,
        status: "draft",
        color: CABLE_RUN_DEFAULTS.color,
        strokeWidth: CABLE_RUN_DEFAULTS.strokeWidth,
      })
        .then((run) => {
          setSelectedCableRunId(run.id);
          showToast(
            t("takeoff.measure.toastRunSaved", {
              length: String(totals.finalLengthM),
            })
          );
        })
        .catch(() => showToast(t("takeoff.toast.saveFailed")));
    },
    [projectId, drawingId, cableRuns, calibrationForPage, showToast, t]
  );

  const handleCableRunUpdate = useCallback(
    (runId: string, patch: Partial<CableRun>) => {
      const current = cableRuns.find((r) => r.id === runId);
      if (!current) return;
      const merged: CableRun = { ...current, ...patch };
      const calibration = calibrationForPage(merged.pageNumber);
      const totals = computeCableRunTotals(merged, calibration);
      if (totals) {
        merged.measured2dLengthM = totals.measured2dLengthM;
        merged.finalLengthM = totals.finalLengthM;
      }
      // Optimistic local echo — typing in the panel must not lag on the
      // Firestore roundtrip.
      setCableRuns((prev) => prev.map((r) => (r.id === runId ? merged : r)));
      void upsertCableRun(projectId, merged).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, cableRuns, calibrationForPage, showToast, t]
  );

  const handleCableRunDelete = useCallback(
    (runId: string) => {
      setSelectedCableRunId((prev) => (prev === runId ? null : prev));
      setHighlightedCableRunIds((prev) => prev.filter((id) => id !== runId));
      void deleteCableRun(projectId, runId).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, showToast, t]
  );

  /**
   * What the quote currently contains per cable group — lets the panel show
   * "V ponuke / preniesť / neschválené" so nothing silently goes missing.
   */
  const exportedCableGroupQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of takeoffItems) {
      const md = item.metadata;
      if (!md || md.sourceType !== "cable_run_group") continue;
      const key = cableRunGroupKey({
        cableTypeName:
          typeof md.cableTypeName === "string" ? md.cableTypeName : item.name,
        installationType: (typeof md.installationType === "string"
          ? md.installationType
          : "other") as CableInstallationType,
        catalogItemId:
          typeof md.catalogItemId === "string" ? md.catalogItemId : undefined,
      });
      map[key] = Math.round(((map[key] ?? 0) + item.quantity) * 100) / 100;
    }
    return map;
  }, [takeoffItems]);

  const handleToggleCableRunHighlight = useCallback((runId: string) => {
    setHighlightedCableRunIds((prev) =>
      prev.includes(runId) ? prev.filter((id) => id !== runId) : [...prev, runId]
    );
  }, []);

  /** Panel's "Upraviť na pláne" — select the run and ask the viewer to edit. */
  const handleCableRunEditOnPlan = useCallback((runId: string) => {
    setSelectedCableRunId(runId);
    setCableRunEditRequest({ runId, requestId: Date.now() });
  }, []);

  /**
   * "Pridať schválené do ponuky" — approved cable runs become quote takeoff
   * items via the existing takeoffItems mechanism. Idempotent: item ids are
   * deterministic per (cableType, installation, catalog) group, and stale
   * cable-run items from a previous export are removed.
   */
  const handleExportApprovedCableRuns = useCallback(() => {
    setCableExportBusy(true);
    setCableExportMessage(null);
    void (async () => {
      try {
        const approved = cableRuns.filter((r) => r.status === "approved");
        const pages = [...new Set(approved.map((r) => r.pageNumber))];
        const items = pages.flatMap((pageNumber) =>
          convertCableRunsToTakeoffItems(
            approved.filter((r) => r.pageNumber === pageNumber),
            { projectId, drawingId, pageNumber }
          )
        );
        const newIds = new Set(items.map((i) => i.id));
        // Preserve createdAt of previously exported groups.
        const existing = takeoffItems.filter(
          (i) => i.metadata?.sourceType === "cable_run_group"
        );
        const existingById = new Map(existing.map((i) => [i.id, i]));
        for (const item of items) {
          const prev = existingById.get(item.id);
          await upsertTakeoffItem(
            prev ? { ...item, createdAt: prev.createdAt } : item
          );
        }
        // Remove leftovers from earlier exports (e.g. a run un-approved).
        for (const stale of existing) {
          if (!newIds.has(stale.id)) {
            await deleteTakeoffItem(projectId, stale.id).catch(() => undefined);
          }
        }
        const totalM = items.reduce((sum, i) => sum + i.quantity, 0);
        setCableExportMessage(
          t("takeoff.measure.exportDone", {
            count: String(items.length),
            length: String(Math.round(totalM * 100) / 100),
          })
        );
      } catch {
        showToast(t("takeoff.toast.saveFailed"));
      } finally {
        setCableExportBusy(false);
      }
    })();
  }, [projectId, drawingId, cableRuns, takeoffItems, showToast, t]);

  const patchCandidateLocal = useCallback(
    (id: string, patch: Partial<AnalyzeRegionCandidateDto>) => {
      setRegionCandidates((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const handleConfirmCandidate = useCallback(
    async (
      candidateId: string,
      symbolType: string,
      dtoOverride?: AnalyzeRegionCandidateDto
    ) => {
      const dto = dtoOverride ?? regionCandidates.find((c) => c.id === candidateId);
      setReviewBusy(true);
      try {
        const result = await confirmSymbolCandidate({
          projectId,
          candidateId,
          symbol_type: symbolType,
          create_template: false,
          candidateDto: dto,
          fileUrl,
        });
        patchCandidateLocal(candidateId, { status: "confirmed" });
        setLastConfirmedSymbol({
          id: result.confirmedSymbolId,
          label: dto?.label_suggestions[0]?.label ?? symbolType,
        });
        await refreshTakeoffItems();
        showToast(t("takeoff.toast.candidateConfirmed"));
      } catch (err) {
        if (err instanceof DuplicateConfirmedSymbolError) {
          // No writes happened — let the operator resolve the conflict.
          setDuplicateConflict({
            candidateId,
            existingSymbolId: err.existingSymbolId,
            existingPageNumber: err.existingPageNumber,
            existingNormalized: err.existingNormalizedPosition,
          });
        } else {
          showToast(t("takeoff.toast.reviewFailed"));
        }
      } finally {
        setReviewBusy(false);
      }
    },
    [
      regionCandidates,
      projectId,
      fileUrl,
      patchCandidateLocal,
      refreshTakeoffItems,
      showToast,
      t,
    ]
  );

  const handleRejectCandidate = useCallback(
    async (candidateId: string) => {
      setReviewBusy(true);
      try {
        await rejectSymbolCandidate({ projectId, candidateId });
        patchCandidateLocal(candidateId, { status: "rejected" });
        showToast(t("takeoff.toast.candidateRejected"));
      } catch {
        showToast(t("takeoff.toast.reviewFailed"));
      } finally {
        setReviewBusy(false);
      }
    },
    [projectId, patchCandidateLocal, showToast, t]
  );

  const removeCandidateLocal = useCallback((id: string) => {
    setRegionCandidates((prev) => prev.filter((c) => c.id !== id));
    setSelectedCandidateId((sel) => (sel === id ? null : sel));
  }, []);

  /** Permanently remove a candidate/probable/rejected/unknown row — never a confirmed one. */
  const handleDeleteCandidate = useCallback(
    async (candidateId: string) => {
      setReviewBusy(true);
      try {
        await deleteCandidate({ projectId, candidateId });
        removeCandidateLocal(candidateId);
        showToast(t("takeoff.toast.candidateDeleted"));
      } catch {
        showToast(t("takeoff.toast.reviewFailed"));
      } finally {
        setReviewBusy(false);
      }
    },
    [projectId, removeCandidateLocal, showToast, t]
  );

  /** Delete all rejected/hidden candidates in one go — clears review-list clutter. */
  const handleDeleteAllRejected = useCallback(async () => {
    const targets = regionCandidates.filter((c) => c.status === "rejected");
    if (targets.length === 0) return;
    setReviewBusy(true);
    try {
      let removed = 0;
      for (const c of targets) {
        try {
          await deleteCandidate({ projectId, candidateId: c.id });
          removed++;
        } catch {
          /* keep going — one bad row must not block the rest */
        }
      }
      setRegionCandidates((prev) => prev.filter((c) => c.status !== "rejected"));
      showToast(t("takeoff.toast.rejectedCleared", { count: removed }));
    } finally {
      setReviewBusy(false);
    }
  }, [projectId, regionCandidates, showToast, t]);

  /**
   * Delete EVERY candidate still awaiting review (candidate/probable/
   * unknown/needs_info) — the "Kandidáti na kontrolu" section only. Never
   * touches confirmed symbols (those need the symmetric reversal above) or
   * already-rejected rows (use "Vymazať všetky" in that section instead).
   * Meant for a bad/noisy scan that isn't worth reviewing row by row.
   */
  const handleDeleteAllCandidates = useCallback(async () => {
    const targets = regionCandidates.filter(
      (c) => c.status !== "rejected" && c.status !== "confirmed"
    );
    if (targets.length === 0) return;
    setReviewBusy(true);
    try {
      let removed = 0;
      for (const c of targets) {
        try {
          await deleteCandidate({ projectId, candidateId: c.id });
          removed++;
        } catch {
          /* keep going — one bad row must not block the rest */
        }
      }
      setRegionCandidates((prev) =>
        prev.filter((c) => c.status === "rejected" || c.status === "confirmed")
      );
      setSelectedCandidateId(null);
      showToast(t("takeoff.toast.candidatesCleared", { count: removed }));
    } finally {
      setReviewBusy(false);
    }
  }, [projectId, regionCandidates, showToast, t]);

  /**
   * Delete a CONFIRMED symbol — reverses the exact quantity/evidence it
   * added (symmetric with confirm), then removes it and its originating
   * candidate. This is the only way to fully remove a confirmed mark;
   * rejecting only hides it and never applies to confirmed rows.
   */
  const handleDeleteConfirmedSymbol = useCallback(
    async (candidateId: string) => {
      const dto = regionCandidates.find((c) => c.id === candidateId);
      if (!dto) return;
      setReviewBusy(true);
      try {
        await unconfirmAndDeleteSymbol({ projectId, candidateId });
        removeCandidateLocal(candidateId);
        await refreshTakeoffItems();
        showToast(t("takeoff.toast.confirmedDeleted"));
      } catch {
        showToast(t("takeoff.toast.reviewFailed"));
      } finally {
        setReviewBusy(false);
      }
    },
    [projectId, regionCandidates, removeCandidateLocal, refreshTakeoffItems, showToast, t]
  );

  /**
   * Delete a candidate or confirmed symbol from the overlay's inline (x)
   * button — dispatches to the right service so confirmed rows still
   * reverse their quantity/evidence instead of just vanishing.
   */
  const handleDeleteCandidateFromViewer = useCallback(
    (candidate: AnalyzeRegionCandidateDto) => {
      if (candidate.status === "confirmed") {
        void handleDeleteConfirmedSymbol(candidate.id);
      } else {
        void handleDeleteCandidate(candidate.id);
      }
    },
    [handleDeleteCandidate, handleDeleteConfirmedSymbol]
  );

  /** Drag-to-reposition a candidate/confirmed symbol mark on the plan. */
  const handleMoveCandidate = useCallback(
    (candidateId: string, normalized: NormalizedRect) => {
      const dto = regionCandidates.find((c) => c.id === candidateId);
      patchCandidateLocal(candidateId, { normalized_position: normalized });
      moveCandidateOrConfirmedSymbol({
        projectId,
        candidateId,
        newNormalizedPosition: normalized,
        candidateDto: dto,
      }).catch(() => showToast(t("takeoff.toast.saveFailed")));
    },
    [projectId, regionCandidates, patchCandidateLocal, showToast, t]
  );

  const handleChangeCandidateType = useCallback(
    async (candidateId: string, symbolType: string) => {
      const dto = regionCandidates.find((c) => c.id === candidateId);
      setReviewBusy(true);
      try {
        const updated = await changeSymbolCandidateType({
          projectId,
          candidateId,
          symbol_type: symbolType,
          candidateDto: dto,
        });
        patchCandidateLocal(candidateId, updated);
      } catch {
        showToast(t("takeoff.toast.reviewFailed"));
      } finally {
        setReviewBusy(false);
      }
    },
    [regionCandidates, projectId, patchCandidateLocal, showToast, t]
  );

  /**
   * Retype an already-CONFIRMED symbol — e.g. a light wrongly marked as a
   * switch. Moves its quantity from the old takeoff item bucket to the new
   * one (never both), keeping the confirmedSymbol/evidence rows intact so
   * evidence in the plan stays traceable.
   */
  const handleChangeConfirmedType = useCallback(
    async (candidateId: string, symbolType: string) => {
      setReviewBusy(true);
      try {
        const label = defaultLabelForSymbolType(symbolType);
        await changeConfirmedSymbolType({ projectId, candidateId, symbol_type: symbolType });
        patchCandidateLocal(candidateId, {
          label_suggestions: [{ label, confidence: 1 }],
        });
        await refreshTakeoffItems();
        showToast(t("takeoff.toast.confirmedTypeChanged"));
      } catch {
        showToast(t("takeoff.toast.reviewFailed"));
      } finally {
        setReviewBusy(false);
      }
    },
    [projectId, patchCandidateLocal, refreshTakeoffItems, showToast, t]
  );

  const handleMarkUnknown = useCallback(
    async (candidateId: string) => {
      setReviewBusy(true);
      try {
        await markSymbolCandidateUnknownType({ projectId, candidateId });
        patchCandidateLocal(candidateId, { status: "unknown_type" });
      } catch {
        showToast(t("takeoff.toast.reviewFailed"));
      } finally {
        setReviewBusy(false);
      }
    },
    [projectId, patchCandidateLocal, showToast, t]
  );

  const handleConfirmAllProbable = useCallback(async () => {
    setReviewBusy(true);
    try {
      const result = await confirmAllProbableCandidates({
        projectId,
        candidates: regionCandidates,
        fileUrl,
      });
      setRegionCandidates((prev) =>
        prev.map((c) =>
          c.status === "probable" || (c.status === "candidate" && c.confidence >= 0.55)
            ? { ...c, status: "confirmed" as const }
            : c
        )
      );
      await refreshTakeoffItems();
      showToast(
        t("takeoff.toast.confirmAllDone", {
          count: result.confirmed,
        })
      );
    } catch {
      showToast(t("takeoff.toast.reviewFailed"));
    } finally {
      setReviewBusy(false);
    }
  }, [projectId, regionCandidates, fileUrl, refreshTakeoffItems, showToast, t]);

  const handleEvidenceClick = useCallback(
    async (takeoffItemId: string) => {
      try {
        const evidence = await listTakeoffEvidenceForItem(projectId, takeoffItemId);
        // Phase 2.5 — thumbnails when images exist; bbox focus works either way.
        const item = takeoffItems.find((i) => i.id === takeoffItemId);
        setEvidenceThumbs({
          itemId: takeoffItemId,
          itemName: item?.name ?? "",
          thumbs: evidence.map((e) => ({
            id: e.id,
            url: e.evidenceImageUrl ?? null,
            pageNumber: e.pageNumber,
            normalized: e.normalizedPosition,
          })),
        });
        const first = evidence.find((e) => e.normalizedPosition) ?? evidence[0];
        if (!first?.normalizedPosition) {
          showToast(t("takeoff.toast.noEvidence"));
          return;
        }
        // Evidence links to a confirmed symbol — offer "find similar" from it.
        if (first.confirmedSymbolId) {
          setLastConfirmedSymbol({
            id: first.confirmedSymbolId,
            label: item?.name ?? "",
          });
        }
        setFocusEvidence({
          pageNumber: first.pageNumber,
          normalized: first.normalizedPosition,
          token: Date.now(),
        });
        setRightTab("candidates");
      } catch {
        showToast(t("takeoff.toast.noEvidence"));
      }
    },
    [projectId, takeoffItems, showToast, t]
  );

  // Phase 3A — find visually similar symbols from a confirmed symbol.
  // Results are PROBABLE candidates only; quantities change after confirm.
  const handleFindSimilarFromConfirmed = useCallback(
    async (symbolId: string, scope: "page" | "drawing") => {
      if (!fileUrl || similarFromConfirmedBusy) return;
      setSimilarFromConfirmedBusy(true);
      try {
        const result = await findSimilarForConfirmedSymbol({
          projectId,
          drawingId,
          symbolId,
          fileUrl,
          scope,
        });
        if (result.unavailableReason) {
          showToast(t("takeoff.toast.similarUnavailable"));
          return;
        }
        if (result.candidates.length === 0) {
          showToast(t("takeoff.toast.noSimilarFound"));
          return;
        }
        setRegionCandidates((prev) => {
          const known = new Set(prev.map((c) => c.id));
          return [...prev, ...result.candidates.filter((c) => !known.has(c.id))];
        });
        setRightTab("candidates");
        showToast(t("takeoff.toast.similarFound", { count: result.candidates.length }));
      } catch {
        showToast(t("takeoff.toast.similarUnavailable"));
      } finally {
        setSimilarFromConfirmedBusy(false);
      }
    },
    [fileUrl, similarFromConfirmedBusy, projectId, drawingId, showToast, t]
  );

  // "Find similar" straight from a pending/unconfirmed candidate — a manual
  // mark or single detection shouldn't need a confirm step first just to
  // search for the same symbol elsewhere on the plan. Pre-confirm this
  // defaults to the current page only (the mark itself is still unverified);
  // an already-CONFIRMED row is a trustworthy template, so its own button
  // (see handleFindSimilarConfirmedRow below) searches the WHOLE drawing.
  const handleFindSimilarFromCandidate = useCallback(
    async (candidateId: string, scope: "page" | "drawing" = "page") => {
      if (!fileUrl || similarFromConfirmedBusy) return;
      const candidate = regionCandidates.find((c) => c.id === candidateId);
      if (!candidate) return;
      setSimilarFromConfirmedBusy(true);
      try {
        const result = await findSimilarForCandidate({
          projectId,
          drawingId,
          candidate,
          fileUrl,
          scope,
        });
        if (result.unavailableReason) {
          showToast(t("takeoff.toast.similarUnavailable"));
          return;
        }
        if (result.candidates.length === 0) {
          showToast(t("takeoff.toast.noSimilarFound"));
          return;
        }
        setRegionCandidates((prev) => {
          const known = new Set(prev.map((c) => c.id));
          return [...prev, ...result.candidates.filter((c) => !known.has(c.id))];
        });
        showToast(t("takeoff.toast.similarFound", { count: result.candidates.length }));
      } catch {
        showToast(t("takeoff.toast.similarUnavailable"));
      } finally {
        setSimilarFromConfirmedBusy(false);
      }
    },
    [fileUrl, similarFromConfirmedBusy, projectId, drawingId, regionCandidates, showToast, t]
  );

  /** "Nájsť podobné" on an already-confirmed row — always scans every page. */
  const handleFindSimilarConfirmedRow = useCallback(
    (candidateId: string) => void handleFindSimilarFromCandidate(candidateId, "drawing"),
    [handleFindSimilarFromCandidate]
  );

  const handleEvidenceThumbClick = useCallback((thumb: EvidenceThumb) => {
    if (!thumb.normalized) return;
    setFocusEvidence({
      pageNumber: thumb.pageNumber,
      normalized: thumb.normalized,
      token: Date.now(),
    });
  }, []);

  /**
   * One click = one counted piece. Builds a manual candidate with the active
   * category's label/type, saves it and runs the NORMAL confirm flow
   * (duplicate check, evidence, takeoff quantity) — identical data to
   * confirming a detected candidate, just without the per-click dialog.
   */
  const handleRapidCategoryMark = useCallback(
    async (pageNumber: number, rect: NormalizedRect) => {
      if (!activeCategory) return;
      const dto = buildManualCandidateDto({
        pageNumber,
        normalizedPosition: rect,
        symbolType: activeCategory.symbolType,
        label: activeCategory.label,
        note: null,
      });
      // Optimistic — the mark appears under the cursor immediately.
      setRegionCandidates((prev) => [...prev, dto]);
      try {
        await saveSymbolCandidates(projectId, null, drawingId, pageNumber, [dto]);
        await handleConfirmCandidate(dto.id, activeCategory.symbolType, dto);

        const binding =
          activeCategory.catalog ??
          catalogBindingsRef.current.get(activeCategory.key);
        if (binding) {
          const priorConfirmed = regionCandidates.filter(
            (c) =>
              c.id !== dto.id &&
              c.status === "confirmed" &&
              categoryKeyForLabel(categoryLabelForCandidate(c)) ===
                activeCategory.key
          ).length;
          try {
            const quoteItemId = await syncCatalogMarkedQtyToQuote({
              projectId,
              drawingId,
              name: activeCategory.label,
              qty: priorConfirmed + 1,
              unitPrice: binding.unitPrice,
              unit: binding.unit,
              note: binding.note,
              quoteItemId: binding.quoteItemId,
            });
            const next: CatalogMarkBinding = { ...binding, quoteItemId };
            catalogBindingsRef.current.set(activeCategory.key, next);
            setActiveCategory((prev) =>
              prev && prev.key === activeCategory.key
                ? { ...prev, catalog: next }
                : prev
            );
          } catch {
            /* marking succeeded — quote sync is best-effort (e.g. non-draft) */
          }
        }
      } catch {
        setRegionCandidates((prev) => prev.filter((c) => c.id !== dto.id));
        showToast(t("takeoff.toast.saveFailed"));
      }
    },
    [activeCategory, projectId, drawingId, handleConfirmCandidate, regionCandidates, showToast, t]
  );

  const handleStartCategoryMarking = useCallback(
    (category: {
      key: string;
      label: string;
      symbolType: string;
      catalog?: Omit<CatalogMarkBinding, "quoteItemId"> & { quoteItemId?: string };
    }) => {
      const prev = catalogBindingsRef.current.get(category.key);
      const catalog = category.catalog
        ? {
            ...category.catalog,
            quoteItemId: category.catalog.quoteItemId ?? prev?.quoteItemId,
          }
        : prev;
      if (catalog) {
        catalogBindingsRef.current.set(category.key, catalog);
      }
      setActiveCategory({
        key: category.key,
        label: category.label,
        symbolType: category.symbolType,
        ...(catalog ? { catalog } : {}),
      });
      setMarkerMode("point");
      setRightTab("candidates");
    },
    []
  );

  const handleStopCategoryMarking = useCallback(() => {
    setActiveCategory(null);
    setMarkerMode("select");
  }, []);

  /** Catalog / AI price → quote draft (confirm happens in AiPriceLookupDialog). */
  const handleApplyPrice = useCallback(
    async (input: { name: string; unitPrice: number; note?: string }) => {
      const key = categoryKeyForLabel(input.name);
      const qty = Math.max(
        1,
        regionCandidates.filter(
          (c) =>
            c.status === "confirmed" &&
            categoryKeyForLabel(categoryLabelForCandidate(c)) === key
        ).length
      );
      const binding = catalogBindingsRef.current.get(key);
      try {
        const quoteItemId = await syncCatalogMarkedQtyToQuote({
          projectId,
          drawingId,
          name: input.name,
          qty,
          unitPrice: input.unitPrice,
          unit: binding?.unit ?? "ks",
          note: input.note ?? binding?.note,
          quoteItemId: binding?.quoteItemId,
        });
        catalogBindingsRef.current.set(key, {
          productId: binding?.productId ?? `price:${key}`,
          unitPrice: input.unitPrice,
          unit: binding?.unit ?? "ks",
          note: input.note ?? binding?.note,
          quoteItemId,
        });
        showToast(t("takeoff.priceLookup.toastApplied"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        showToast(
          message.includes("draft jobs")
            ? t("takeoff.quote.draftOnly")
            : t("takeoff.priceLookup.applyError")
        );
        throw err;
      }
    },
    [projectId, drawingId, regionCandidates, showToast, t]
  );

  // Leaving point mode by ANY path (Esc, toolbar mode buttons, scan actions)
  // always ends the rapid-marking session — no stale "still adding Svetlo"
  // state once the cursor stops placing marks.
  useEffect(() => {
    if (markerMode !== "point") setActiveCategory(null);
  }, [markerMode]);

  const handleToggleHighlightCategory = useCallback((key: string) => {
    setHighlightedCategoryKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  const highlightedCandidateIds = useMemo(() => {
    if (highlightedCategoryKeys.length === 0) return null;
    const keys = new Set(highlightedCategoryKeys);
    return regionCandidates
      .filter(
        (c) =>
          c.status === "confirmed" &&
          keys.has(categoryKeyForLabel(categoryLabelForCandidate(c)))
      )
      .map((c) => c.id);
  }, [highlightedCategoryKeys, regionCandidates]);

  /**
   * Move one confirmed mark to a different position/category — its
   * quantity+evidence move buckets server-side; locally just relabel so
   * grouping, colors and counts follow instantly.
   */
  const handleMoveConfirmedToCategory = useCallback(
    async (candidateId: string, label: string) => {
      setReviewBusy(true);
      try {
        await moveConfirmedSymbolToCategory({ projectId, candidateId, label });
        patchCandidateLocal(candidateId, {
          label_suggestions: [{ label, confidence: 1 }],
        });
        await refreshTakeoffItems();
        showToast(t("takeoff.toast.markMoved", { label }));
      } catch {
        showToast(t("takeoff.toast.reviewFailed"));
      } finally {
        setReviewBusy(false);
      }
    },
    [projectId, patchCandidateLocal, refreshTakeoffItems, showToast, t]
  );

  /** Rename a position — relabels every confirmed mark in it (merge on clash). */
  const handleRenameCategory = useCallback(
    async (categoryKey: string, newLabel: string) => {
      const targets = regionCandidates.filter(
        (c) =>
          c.status === "confirmed" &&
          categoryKeyForLabel(categoryLabelForCandidate(c)) === categoryKey
      );
      if (targets.length === 0) return;
      setReviewBusy(true);
      try {
        for (const c of targets) {
          try {
            await moveConfirmedSymbolToCategory({
              projectId,
              candidateId: c.id,
              label: newLabel,
            });
            patchCandidateLocal(c.id, {
              label_suggestions: [{ label: newLabel, confidence: 1 }],
            });
          } catch {
            /* keep going — one bad row must not block the rest */
          }
        }
        await refreshTakeoffItems();
        showToast(t("takeoff.toast.categoryRenamed", { label: newLabel }));
      } finally {
        setReviewBusy(false);
      }
    },
    [projectId, regionCandidates, patchCandidateLocal, refreshTakeoffItems, showToast, t]
  );

  /**
   * "Čo je táto značka?" — send the neighborhood of ONE mark to Gemini and
   * show its identification (name/type) in a dialog. Answers the operator's
   * "which switch type is this when there is no legend?" question in-app.
   */
  const handleIdentifySymbol = useCallback(
    async (candidateId: string) => {
      const candidate = regionCandidates.find((c) => c.id === candidateId);
      if (!candidate || !fileUrl) return;
      setSelectedCandidateId(candidateId);
      setIdentifyFor({ candidateId, busy: true, result: null, failed: false });
      try {
        const result = await identifySymbolWithAi({
          fileUrl,
          pageNumber: candidate.page_number ?? 1,
          normalizedPosition: candidate.normalized_position,
          language: locale,
        });
        setIdentifyFor((prev) =>
          prev?.candidateId === candidateId
            ? { candidateId, busy: false, result, failed: false }
            : prev
        );
      } catch (err) {
        setIdentifyFor((prev) =>
          prev?.candidateId === candidateId
            ? {
                candidateId,
                busy: false,
                result: null,
                failed: true,
                failedDetail: err instanceof Error ? err.message : String(err),
              }
            : prev
        );
      }
    },
    [regionCandidates, fileUrl, locale]
  );

  /**
   * "Zistiť značku (AI)" toolbar mode — identify BEFORE marking. The click
   * creates nothing; AI answers "what is this?" and the dialog then offers
   * to create the mark pre-filled with the AI name/type/bbox.
   */
  const handleIdentifyAtPoint = useCallback(
    async (pageNumber: number, clickedRect: NormalizedRect) => {
      if (!fileUrl) return;
      const entry = {
        candidateId: null,
        point: { pageNumber, clickedRect },
        busy: true,
        result: null,
        failed: false,
      };
      setIdentifyFor(entry);
      try {
        const result = await identifySymbolWithAi({
          fileUrl,
          pageNumber,
          normalizedPosition: clickedRect,
          language: locale,
        });
        setIdentifyFor((prev) =>
          prev === entry ? { ...entry, busy: false, result } : prev
        );
      } catch (err) {
        setIdentifyFor((prev) =>
          prev === entry
            ? {
                ...entry,
                busy: false,
                failed: true,
                failedDetail: err instanceof Error ? err.message : String(err),
              }
            : prev
        );
      }
    },
    [fileUrl, locale]
  );

  /**
   * Take the AI answer over as the mark's position name: confirmed marks
   * move to that category (quantities follow), unconfirmed candidates just
   * get the label so a later confirm buckets them under it.
   */
  const handleApplyIdentifiedName = useCallback(async () => {
    if (!identifyFor?.result) return;
    const { candidateId, point, result } = identifyFor;

    // Identify-before-marking: no mark exists yet — open the normal "add
    // marker" dialog pre-filled with the AI answer (name, type, tight bbox),
    // so the user reviews and saves/confirms through the standard flow.
    if (candidateId === null) {
      setIdentifyFor(null);
      if (!point) return;
      const aiRect = result.normalizedPosition;
      const rect =
        aiRect && aiRect.width > 0 && aiRect.height > 0 ? aiRect : point.clickedRect;
      const mappedType = symbolTypeForAiCategory(result.category);
      if (mappedType && typesForTrade(formTrade).some((d) => d.id === mappedType)) {
        setFormType(mappedType);
      }
      setFormLabel(result.name);
      setFormNote("");
      setPendingMarker({ pageNumber: point.pageNumber, rect });
      return;
    }

    const candidate = regionCandidates.find((c) => c.id === candidateId);
    setIdentifyFor(null);
    if (!candidate) return;
    if (candidate.status === "confirmed") {
      await handleMoveConfirmedToCategory(candidateId, result.name);
      return;
    }
    setReviewBusy(true);
    try {
      await updateSymbolCandidateStatus(projectId, candidateId, {
        labelSuggestions: [{ label: result.name, confidence: 1 }],
      });
      patchCandidateLocal(candidateId, {
        label_suggestions: [{ label: result.name, confidence: 1 }],
      });
      showToast(t("takeoff.toast.markMoved", { label: result.name }));
    } catch {
      showToast(t("takeoff.toast.reviewFailed"));
    } finally {
      setReviewBusy(false);
    }
  }, [
    identifyFor,
    regionCandidates,
    projectId,
    formTrade,
    handleMoveConfirmedToCategory,
    patchCandidateLocal,
    showToast,
    t,
  ]);

  const handleMarkerDrawn = useCallback(
    (pageNumber: number, rect: NormalizedRect) => {
      if (markerMode === "analyze_region") {
        void handleAnalyzeRegion(pageNumber, rect);
        return;
      }
      // Rapid category marking — skip the dialog entirely.
      if (
        markerMode === "point" &&
        activeCategory &&
        regionAnalyzerEnabled &&
        perms.allowConfirm
      ) {
        void handleRapidCategoryMark(pageNumber, rect);
        return;
      }
      setPendingMarker({ pageNumber, rect });
      const typeDef = typesForTrade(formTrade).find((d) => d.id === formType);
      setFormLabel(typeDef ? t(typeDef.labelKey) : "");
      setFormNote("");
    },
    [
      formTrade,
      formType,
      t,
      markerMode,
      handleAnalyzeRegion,
      activeCategory,
      regionAnalyzerEnabled,
      perms.allowConfirm,
      handleRapidCategoryMark,
    ]
  );

  /**
   * Manual mark save. With the region analyzer enabled, manual marks join the
   * SHARED candidate model (symbolCandidates), so quote and project see the
   * same data. `confirmNow` runs the normal confirm flow (duplicate checks,
   * evidence, takeoff quantity) — identical to confirming a detected candidate.
   */
  const savePendingMarker = async (opts?: { confirmNow?: boolean }) => {
    if (!pendingMarker) return;
    const label = formLabel.trim() || t("takeoff.type.generic");
    const marker = pendingMarker;
    setPendingMarker(null);

    if (regionAnalyzerEnabled) {
      const dto = buildManualCandidateDto({
        pageNumber: marker.pageNumber,
        normalizedPosition: marker.rect,
        symbolType: formType,
        label,
        note: formNote.trim() || null,
      });
      setReviewBusy(true);
      try {
        await saveSymbolCandidates(projectId, null, drawingId, marker.pageNumber, [dto]);
        setRegionCandidates((prev) => [...prev, dto]);
        setRightTab("candidates");
        setSelectedCandidateId(dto.id);
        if (opts?.confirmNow && perms.allowConfirm) {
          await handleConfirmCandidate(dto.id, formType, dto);
        } else {
          showToast(t("takeoff.manual.savedAsCandidate"));
        }
      } catch {
        showToast(t("takeoff.toast.saveFailed"));
      } finally {
        setReviewBusy(false);
      }
      return;
    }

    // Legacy path (analyzer disabled): drawing occurrences.
    const input: DrawingOccurrenceInput = {
      projectId,
      drawingId,
      pageNumber: marker.pageNumber,
      type: formType,
      trade: formTrade,
      label,
      source: "manual",
      status: "draft",
      normalizedPosition: marker.rect,
      note: formNote.trim() || undefined,
    };
    try {
      const created = await createDrawingOccurrence(input);
      setOccurrences((prev) => [...prev, created]);
      setSelectedId(created.id);
    } catch {
      showToast(t("takeoff.toast.saveFailed"));
    }
  };

  // ---- Edit / status / delete ----------------------------------------------

  const handleUpdate = useCallback(
    (
      id: string,
      patch: Partial<Pick<DrawingOccurrence, "label" | "trade" | "type" | "status" | "note">>
    ) => {
      setOccurrences((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o
        )
      );
      updateDrawingOccurrence(projectId, id, patch).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, showToast, t]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setOccurrences((prev) => prev.filter((o) => o.id !== id));
      setSelectedId((sel) => (sel === id ? null : sel));
      deleteDrawingOccurrence(projectId, id).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, showToast, t]
  );

  /** Drag-to-reposition a legacy manual mark on the plan. */
  const handleMoveOccurrence = useCallback(
    (id: string, normalized: NormalizedRect) => {
      setOccurrences((prev) =>
        prev.map((o) => (o.id === id ? { ...o, normalizedPosition: normalized } : o))
      );
      updateDrawingOccurrence(projectId, id, { normalizedPosition: normalized }).catch(() =>
        showToast(t("takeoff.toast.saveFailed"))
      );
    },
    [projectId, showToast, t]
  );

  // ---- Find similar ----------------------------------------------------------

  const handleFindSimilar = useCallback(
    async (reference: DrawingOccurrence) => {
      if (!fileUrl) return;
      setFindSimilarBusy(true);
      try {
        const result = await findSimilarSymbols({
          projectId,
          drawingId,
          fileUrl,
          pageNumber: reference.pageNumber,
          referenceBbox: reference.normalizedPosition,
        });
        if (result.unavailableReason) {
          showToast(
            result.unavailableReason === "reference_too_small"
              ? t("takeoff.toast.referenceTooSmall")
              : t("takeoff.toast.similarUnavailable")
          );
          return;
        }
        // Skip proposals overlapping ANY existing mark on the same page —
        // legacy occurrences AND new-model candidates/confirmed symbols.
        const existingRects = [
          ...occurrences
            .filter((o) => o.pageNumber === reference.pageNumber)
            .map((o) => o.normalizedPosition),
          ...regionCandidates
            .filter(
              (c) =>
                (c.page_number ?? 1) === reference.pageNumber && c.status !== "rejected"
            )
            .map((c) => c.normalized_position),
        ];
        const overlapsExisting = (rect: NormalizedRect) =>
          existingRects.some((a) => {
            const ix =
              Math.min(a.x + a.width, rect.x + rect.width) - Math.max(a.x, rect.x);
            const iy =
              Math.min(a.y + a.height, rect.y + rect.height) - Math.max(a.y, rect.y);
            return ix > 0 && iy > 0;
          });
        const fresh = result.candidates.filter((c) => !overlapsExisting(c.normalizedPosition));
        if (fresh.length === 0) {
          showToast(t("takeoff.toast.noSimilarFound"));
          return;
        }
        const created = await createDrawingOccurrences(
          fresh.map((c) => ({
            projectId,
            drawingId,
            pageNumber: c.pageNumber,
            type: reference.type,
            trade: reference.trade,
            label: reference.label,
            source: "similar_symbol_detected" as const,
            status: "needs_review" as const,
            confidence: c.matchScore,
            normalizedPosition: c.normalizedPosition,
          }))
        );
        setOccurrences((prev) => [...prev, ...created]);
        showToast(t("takeoff.toast.similarFound", { count: created.length }));
      } catch {
        showToast(t("takeoff.toast.similarUnavailable"));
      } finally {
        setFindSimilarBusy(false);
      }
    },
    [fileUrl, projectId, drawingId, occurrences, regionCandidates, showToast, t]
  );

  const handleBulkCandidates = useCallback(
    (action: "confirm" | "reject") => {
      const status = action === "confirm" ? ("confirmed" as const) : ("rejected" as const);
      const targets = occurrences.filter(
        (o) => o.status === "needs_review" && o.source === "similar_symbol_detected"
      );
      setOccurrences((prev) =>
        prev.map((o) =>
          targets.some((c) => c.id === o.id) ? { ...o, status } : o
        )
      );
      for (const c of targets) {
        updateDrawingOccurrence(projectId, c.id, { status }).catch(() =>
          showToast(t("takeoff.toast.saveFailed"))
        );
      }
    },
    [occurrences, projectId, showToast, t]
  );

  // ---- Quote -----------------------------------------------------------------

  const handleAddToQuote = useCallback(
    async (expandAssemblies: boolean) => {
      setQuoteBusy(true);
      setQuoteMessage(null);
      try {
        const lines = buildQuoteLinesFromOccurrences(occurrences, {
          expandAssemblies,
          translate: t,
        });
        const result = await addTakeoffLinesToQuoteDraft(projectId, lines, drawingId);
        const usedIds = new Set(lines.flatMap((l) => l.sourceOccurrenceIds));
        setOccurrences((prev) =>
          prev.map((o) => (usedIds.has(o.id) ? { ...o, status: "used_in_quote" } : o))
        );
        setQuoteMessage(
          t("takeoff.quote.addedResult", {
            added: result.added,
            skipped: result.skippedExisting,
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        setQuoteMessage(
          message.includes("draft jobs")
            ? t("takeoff.quote.draftOnly")
            : t("takeoff.toast.saveFailed")
        );
      } finally {
        setQuoteBusy(false);
      }
    },
    [occurrences, projectId, drawingId, t]
  );

  const resolveReturnHref = useCallback(() => {
    if (returnTo === "documents") return `/app/projects/${projectId}?tab=documents`;
    if (returnTo === "quote-review") return `/app/projects/${projectId}?tab=quote`;
    // new-project-proposal → restore AI review ("Kontrola podkladov")
    return visualTakeoffResumeHref(projectId);
  }, [projectId, returnTo]);

  const finishReview = useCallback(
    async (opts?: { skipManual?: boolean }) => {
      setFinishBusy(true);
      try {
        if (opts?.skipManual) {
          await setProjectVisualTakeoffStatus(projectId, "skipped_manual");
        } else {
          const summary = buildDrawingTakeoffSummary(occurrences);
          const status =
            summary.takeoffStatus === "not_started" ? "in_progress" : summary.takeoffStatus;
          await setProjectVisualTakeoffStatus(projectId, status);
        }
        const dest = resolveReturnHref();
        onFinished?.(dest);
      } catch {
        showToast(t("takeoff.toast.saveFailed"));
      } finally {
        setFinishBusy(false);
      }
    },
    [occurrences, projectId, resolveReturnHref, onFinished, showToast, t]
  );

  return (
    <div
      className={
        isFullscreen
          ? // z-50 + later DOM order paints above the app sidebar (also z-50);
            // portaled dialogs (z-50, appended to <body>) still render on top.
            "fixed inset-0 z-50 space-y-3 overflow-y-auto bg-background p-3 md:p-4"
          : "space-y-3"
      }
    >
      {quotePrecheck || finishEnabled ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="mr-auto text-sm text-muted-foreground">
            {quotePrecheck ? t("takeoff.precheck.banner") : t("takeoff.pageTitle")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={finishBusy}
            onClick={() => void finishReview()}
          >
            <ArrowLeft className="size-3.5 mr-1" />
            {t("takeoff.precheck.backToReview")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={finishBusy}
            onClick={() => void finishReview({ skipManual: true })}
          >
            {t("takeoff.precheck.continueManual")}
          </Button>
          {finishEnabled ? (
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={finishBusy}
              data-testid="takeoff-finish-review"
              onClick={() => void finishReview()}
            >
              <CheckCircle2 className="size-3.5 mr-1" />
              {finishBusy ? t("common.loading") : t("takeoff.precheck.finish")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {toast ? (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {toast}
        </div>
      ) : null}

      {/* Document mode = preview of the SAME takeoff; full tool one click away. */}
      {takeoffMode === "document" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <p className="mr-auto text-sm text-muted-foreground">
            {t("takeoff.documentMode.banner")}
          </p>
          <Button
            type="button"
            size="sm"
            className="h-8"
            data-testid="open-full-takeoff"
            onClick={() =>
              router.push(
                takeoffRoute({
                  projectId,
                  drawingId,
                  quoteId,
                  documentId,
                  mode: "project",
                })
              )
            }
          >
            {t("takeoff.documentMode.openFull")}
          </Button>
          {onClose ? (
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={onClose}>
              {t("common.close")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!perms.allowEdit && takeoffMode === "readonly" ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("takeoff.readonly.banner")}
        </p>
      ) : null}

      {perms.allowEdit && !loading && occurrences.length === 0 && regionCandidates.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium text-foreground">{t("takeoff.empty.title")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("takeoff.empty.body")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#e06737] text-white hover:bg-[#C9552B]"
              onClick={() => setMarkerMode("rect")}
            >
              <Square className="size-3.5 mr-1" />
              {t("takeoff.empty.drawRect")}
            </Button>
            {regionAnalyzerEnabled && perms.allowAnalyze ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                data-testid="takeoff-analyze-region"
                disabled={analyzeBusy || !fileUrl}
                onClick={() => setMarkerMode("analyze_region")}
              >
                <ScanSearch className="size-3.5 mr-1" />
                {t("takeoff.analyzeRegion.button")}
              </Button>
            ) : null}
            {regionAnalyzerEnabled && perms.allowAnalyze ? (
              <p className="basis-full text-[11px] text-muted-foreground">
                {t("takeoff.empty.scanHint")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {regionAnalyzerEnabled && (lastAnalyzeSummary || planQualityLabel) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{t("takeoff.analyzeRegion.planQuality")}</span>
          {planQualityLabel ? <span>{planQualityLabel}</span> : null}
          {lastAnalyzeSummary ? (
            <span>
              {t("takeoff.analyzeRegion.summary", {
                green: lastAnalyzeSummary.green_candidates,
                red: lastAnalyzeSummary.red_candidates,
                orange: lastAnalyzeSummary.orange_candidates,
                total: regionCandidates.length,
              })}
            </span>
          ) : null}
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            {t("takeoff.analyzeRegion.reviewHint")}
          </span>
          {regionCandidates.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-xs"
              onClick={() => {
                setRegionCandidates([]);
                setLastAnalyzeSummary(null);
                setSelectedCandidateId(null);
              }}
            >
              {t("takeoff.analyzeRegion.clear")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {detectionDebugEnabled && lastDebug ? (
        <TakeoffDetectionDebugPanel debug={lastDebug} regionImageUrl={lastRegionImageUrl} />
      ) : null}

      {regionAnalyzerEnabled && perms.allowAnalyze && occurrences.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#e06737] text-white hover:bg-[#C9552B]"
            data-testid="takeoff-analyze-region"
            disabled={analyzeBusy || !fileUrl}
            onClick={() => setMarkerMode("analyze_region")}
          >
            <ScanSearch className="size-3.5 mr-1" />
            {analyzeBusy ? t("common.loading") : t("takeoff.analyzeRegion.button")}
          </Button>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          data-testid="takeoff-fullscreen-toggle"
          aria-pressed={isFullscreen}
          onClick={() => setIsFullscreen((v) => !v)}
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="size-3.5 mr-1" />
              {t("takeoff.viewer.exitFullscreen")}
            </>
          ) : (
            <>
              <Maximize2 className="size-3.5 mr-1" />
              {t("takeoff.viewer.fullscreen")}
            </>
          )}
        </Button>
      </div>

      <div
        ref={layoutContainerRef}
        className={
          isWideLayout ? "flex flex-row items-start gap-3" : "flex flex-col gap-3"
        }
      >
        {/* Left: interactive PDF */}
        <div className={isWideLayout ? "min-w-0 flex-1" : "min-w-0"}>
          {analyzeNotice ? (
            <div
              data-testid="analyze-inline-notice"
              role="status"
              className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                analyzeNotice === "expanded"
                  ? "border-blue-300 bg-blue-50 text-blue-900"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <div className="flex-1 space-y-0.5">
                {analyzeNotice === "expanded" || analyzeNotice === "expanded_empty" ? (
                  <p>{t("takeoff.analyzeRegion.expandedNotice")}</p>
                ) : null}
                {analyzeNotice === "empty" || analyzeNotice === "expanded_empty" ? (
                  <p className="font-medium">
                    {t("takeoff.analyzeRegion.emptyNotice")}
                  </p>
                ) : null}
                {analyzeNotice === "failed" ? (
                  <p className="font-medium">
                    {t("takeoff.analyzeRegion.failedNotice")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 text-current/70 hover:text-current"
                aria-label={t("common.close")}
                onClick={() => setAnalyzeNotice(null)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <DrawingPdfViewer
            fileUrl={fileUrl}
            fileName={fileName}
            occurrences={occurrences}
            selectedOccurrenceId={selectedId}
            onMarkerClick={(id) => setSelectedId(id)}
            onMarkerDrawn={handleMarkerDrawn}
            onOccurrenceMove={perms.allowEdit ? handleMoveOccurrence : undefined}
            onOccurrenceDelete={perms.allowEdit ? handleDelete : undefined}
            markerMode={markerMode}
            onMarkerModeChange={setMarkerMode}
            heightClassName={
              isFullscreen ? "h-[calc(100vh-140px)]" : "h-[640px]"
            }
            regionCandidates={regionCandidates}
            selectedCandidateId={selectedCandidateId}
            onCandidateClick={(id) => {
              setSelectedCandidateId(id);
              setRightTab("candidates");
            }}
            onCandidateMove={perms.allowConfirm ? handleMoveCandidate : undefined}
            onCandidateDelete={perms.allowConfirm ? handleDeleteCandidateFromViewer : undefined}
            showAnalyzeRegionMode={regionAnalyzerEnabled && perms.allowAnalyze}
            allowMarking={perms.allowEdit}
            initialPage={initialPage}
            analyzingRegion={analyzeBusy}
            onScanVisibleArea={
              regionAnalyzerEnabled && perms.allowAnalyze && fileUrl
                ? (pageNumber, rect) => void handleAnalyzeRegion(pageNumber, rect)
                : undefined
            }
            onScanWholePage={
              regionAnalyzerEnabled && perms.allowAnalyze && fileUrl
                ? (pageNumber) => void handleScanWholePage(pageNumber)
                : undefined
            }
            scanningWholePage={scanningWholePage}
            onScanWholePageWithAi={
              aiScanEnabled && perms.allowAnalyze && fileUrl
                ? (pageNumber) => void handleScanWholePageWithAi(pageNumber)
                : undefined
            }
            scanningWholePageWithAi={scanningWholePageWithAi}
            onIdentifyPoint={
              aiScanEnabled && perms.allowAnalyze && fileUrl
                ? (pageNumber, rect) => void handleIdentifyAtPoint(pageNumber, rect)
                : undefined
            }
            identifyingSymbol={identifyFor?.busy ?? false}
            focusEvidence={focusEvidence}
            highlightedCandidateIds={highlightedCandidateIds}
            onClearHighlights={() => {
              setHighlightedCategoryKeys([]);
              setSelectedCandidateId(null);
              setSelectedId(null);
              setFocusEvidence(null);
            }}
            pointModeHint={
              activeCategory
                ? t("takeoff.category.markingBanner", {
                    label: activeCategory.label,
                    count: regionCandidates.filter(
                      (c) =>
                        c.status === "confirmed" &&
                        categoryKeyForLabel(categoryLabelForCandidate(c)) ===
                          activeCategory.key
                    ).length,
                  })
                : null
            }
            annotations={annotations}
            onAnnotationCreate={perms.allowEdit ? handleAnnotationCreate : undefined}
            onAnnotationUpdate={perms.allowEdit ? handleAnnotationUpdate : undefined}
            onAnnotationDelete={perms.allowEdit ? handleAnnotationDelete : undefined}
            documents={documents}
            activeDocumentId={documentId ?? drawingId}
            onSelectDocument={onSelectDocument}
            onPageChange={setViewerPage}
            calibrations={calibrations}
            measurements={drawingMeasurements}
            cableRuns={cableRuns}
            selectedCableRunId={selectedCableRunId}
            onCableRunClick={(id) =>
              setSelectedCableRunId((prev) => (prev === id ? null : id))
            }
            onCableRunDrawn={perms.allowEdit ? handleCableRunDrawn : undefined}
            onCableRunEdit={perms.allowEdit ? handleCableRunUpdate : undefined}
            highlightedCableRunIds={highlightedCableRunIds}
            cableRunEditRequest={perms.allowEdit ? cableRunEditRequest : null}
            onCalibrationSave={perms.allowEdit ? handleCalibrationSave : undefined}
            onCalibrationReset={perms.allowEdit ? handleCalibrationReset : undefined}
            onMeasurementCreate={perms.allowEdit ? handleMeasurementCreate : undefined}
            onMeasurementDelete={perms.allowEdit ? handleMeasurementDelete : undefined}
          />
        </div>

        {isWideLayout ? (
          <div
            role="separator"
            aria-orientation="vertical"
            title={t("takeoff.viewer.resizePanelHint")}
            className="flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center self-stretch"
            onPointerDown={handlePanelResizeStart}
          >
            <div className="h-16 w-1 rounded-full bg-border transition-colors hover:bg-primary/60" />
          </div>
        ) : null}

        {/* Right: candidates review / occurrence list + quote.
            Card surface — embedded on gray pages (quote setup) the lists
            otherwise float on the page background with too little contrast. */}
        <div
          // overflow-y-auto is the safety net: if every panel is expanded at
          // once the column scrolls instead of letting panels paint over
          // each other.
          className={`flex min-w-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-sm ${
            isFullscreen ? "max-h-[calc(100vh-100px)]" : "max-h-[720px]"
          }`}
          style={isWideLayout ? { width: rightPanelWidth, flexShrink: 0 } : undefined}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              {/* The legacy "Značky" tab only appears once there is legacy
                  data to show — new marks always go through "Kandidáti", so
                  most drawings never see a second, disconnected list. */}
              {regionAnalyzerEnabled && occurrences.length > 0 ? (
                <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                      rightTab === "candidates"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => setRightTab("candidates")}
                  >
                    {t("takeoff.review.tabCandidates")}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                      rightTab === "occurrences"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => setRightTab("occurrences")}
                    data-testid="tab-legacy-marks"
                  >
                    {t("takeoff.review.tabMarks")}
                  </button>
                </div>
              ) : null}
              {regionAnalyzerEnabled && rightTab === "occurrences" && occurrences.length > 0 ? (
                <p
                  className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300"
                  data-testid="legacy-marks-notice"
                >
                  {t("takeoff.review.legacyMarksNotice")}
                </p>
              ) : null}
              {regionAnalyzerEnabled &&
              perms.allowAnalyze &&
              rightTab === "candidates" &&
              lastConfirmedSymbol ? (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
                  data-testid="find-similar-confirmed-bar"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {t("takeoff.findSimilar.confirmedHint", {
                      label: lastConfirmedSymbol.label,
                    })}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={similarFromConfirmedBusy || !fileUrl}
                    data-testid="find-similar-confirmed-page"
                    onClick={() =>
                      void handleFindSimilarFromConfirmed(lastConfirmedSymbol.id, "page")
                    }
                  >
                    {similarFromConfirmedBusy
                      ? t("common.loading")
                      : t("takeoff.findSimilar.confirmedButton")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={similarFromConfirmedBusy || !fileUrl}
                    data-testid="find-similar-confirmed-drawing"
                    onClick={() =>
                      void handleFindSimilarFromConfirmed(lastConfirmedSymbol.id, "drawing")
                    }
                  >
                    {t("takeoff.findSimilar.confirmedWholeDrawing")}
                  </Button>
                </div>
              ) : null}
              {/* min-h keeps the candidate list usable even when the cable
                  and quote panels below are expanded — the column scrolls
                  rather than squeezing this list to nothing. */}
              <div className="min-h-[240px] flex-1">
                {regionAnalyzerEnabled && rightTab === "candidates" ? (
                  <SymbolCandidateReviewPanel
                    candidates={regionCandidates}
                    selectedId={selectedCandidateId}
                    onSelect={setSelectedCandidateId}
                    takeoffItems={takeoffItems}
                    busy={reviewBusy}
                    onConfirm={handleConfirmCandidate}
                    onReject={handleRejectCandidate}
                    onChangeType={handleChangeCandidateType}
                    onChangeConfirmedType={
                      perms.allowConfirm ? handleChangeConfirmedType : undefined
                    }
                    onMarkUnknown={handleMarkUnknown}
                    onConfirmAllProbable={handleConfirmAllProbable}
                    onDeleteCandidate={perms.allowConfirm ? handleDeleteCandidate : undefined}
                    onDeleteConfirmed={
                      perms.allowConfirm ? handleDeleteConfirmedSymbol : undefined
                    }
                    onDeleteAllRejected={
                      perms.allowConfirm ? handleDeleteAllRejected : undefined
                    }
                    onDeleteAllCandidates={
                      perms.allowConfirm ? handleDeleteAllCandidates : undefined
                    }
                    onEvidenceClick={(id) => void handleEvidenceClick(id)}
                    evidenceThumbs={evidenceThumbs}
                    onEvidenceThumbClick={handleEvidenceThumbClick}
                    canReview={perms.allowConfirm}
                    onFindSimilar={
                      perms.allowAnalyze
                        ? (id) => void handleFindSimilarFromCandidate(id)
                        : undefined
                    }
                    onFindSimilarConfirmed={
                      perms.allowAnalyze ? handleFindSimilarConfirmedRow : undefined
                    }
                    findSimilarBusy={similarFromConfirmedBusy}
                    onIdentifySymbol={
                      aiScanEnabled && perms.allowAnalyze && fileUrl
                        ? (id) => void handleIdentifySymbol(id)
                        : undefined
                    }
                    identifyBusy={identifyFor?.busy ?? false}
                    activeCategoryKey={activeCategory?.key ?? null}
                    onStartCategoryMarking={
                      perms.allowConfirm && perms.allowEdit
                        ? handleStartCategoryMarking
                        : undefined
                    }
                    onStopCategoryMarking={handleStopCategoryMarking}
                    highlightedCategoryKeys={highlightedCategoryKeys}
                    onHighlightCategory={handleToggleHighlightCategory}
                    onSetHighlightedCategories={setHighlightedCategoryKeys}
                    onMoveConfirmedToCategory={
                      perms.allowConfirm ? handleMoveConfirmedToCategory : undefined
                    }
                    onRenameCategory={
                      perms.allowConfirm ? handleRenameCategory : undefined
                    }
                    onApplyPrice={
                      perms.allowEdit ? handleApplyPrice : undefined
                    }
                    persistKey={`${projectId}:${drawingId}`}
                  />
                ) : (
                  <TakeoffRightPanel
                    occurrences={occurrences}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onFindSimilar={(o) => void handleFindSimilar(o)}
                    findSimilarBusy={findSimilarBusy}
                    onBulkCandidates={handleBulkCandidates}
                  />
                )}
              </div>
              {perms.allowEdit || cableRuns.length > 0 ? (
                <CableRunsPanel
                  runs={cableRuns}
                  selectedRunId={selectedCableRunId}
                  onSelectRun={setSelectedCableRunId}
                  onStartNewRun={
                    perms.allowEdit ? () => setMarkerMode("measure_cable") : undefined
                  }
                  hasCalibration={Boolean(calibrationForPage(viewerPage))}
                  onUpdateRun={perms.allowEdit ? handleCableRunUpdate : undefined}
                  onDeleteRun={perms.allowEdit ? handleCableRunDelete : undefined}
                  onEditRunOnPlan={perms.allowEdit ? handleCableRunEditOnPlan : undefined}
                  highlightedRunIds={highlightedCableRunIds}
                  onToggleRunHighlight={handleToggleCableRunHighlight}
                  onSetHighlightedRuns={setHighlightedCableRunIds}
                  onExportApproved={
                    perms.allowCreateQuoteItems ? handleExportApprovedCableRuns : undefined
                  }
                  exportBusy={cableExportBusy}
                  exportMessage={cableExportMessage}
                  exportedGroupQuantities={exportedCableGroupQuantities}
                />
              ) : null}
              {perms.allowCreateQuoteItems ? (
                <QuoteDraftPanel
                  occurrences={occurrences}
                  onAddToQuote={handleAddToQuote}
                  busy={quoteBusy}
                  resultMessage={quoteMessage}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* "Čo je táto značka?" — AI identification result */}
      <Dialog
        open={!!identifyFor}
        onOpenChange={(open) => {
          if (!open) setIdentifyFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("takeoff.identify.title")}</DialogTitle>
          </DialogHeader>
          {identifyFor?.busy ? (
            <p className="text-sm text-muted-foreground">
              {t("takeoff.identify.busy")}
            </p>
          ) : identifyFor?.result ? (
            <div className="space-y-2">
              <p className="text-base font-semibold">{identifyFor.result.name}</p>
              <p className="text-sm text-muted-foreground">
                {t("takeoff.identify.category")}: {identifyFor.result.category}
                {" · "}
                {t("takeoff.identify.confidence")}:{" "}
                {t(`takeoff.identify.confidence_${identifyFor.result.confidence}`)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("takeoff.identify.applyHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                {identifyFor?.failed
                  ? t("takeoff.identify.failed")
                  : t("takeoff.identify.empty")}
              </p>
              {identifyFor?.failed && identifyFor.failedDetail ? (
                <p className="break-words font-mono text-[11px] leading-relaxed text-muted-foreground/80">
                  {identifyFor.failedDetail}
                </p>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIdentifyFor(null)}
            >
              {t("common.close")}
            </Button>
            {identifyFor?.failed ? (
              <Button
                type="button"
                data-testid="identify-retry"
                onClick={() => {
                  const { candidateId, point } = identifyFor;
                  if (candidateId !== null) {
                    void handleIdentifySymbol(candidateId);
                  } else if (point) {
                    void handleIdentifyAtPoint(point.pageNumber, point.clickedRect);
                  }
                }}
              >
                {t("takeoff.identify.retry")}
              </Button>
            ) : null}
            {identifyFor?.result ? (
              <Button
                type="button"
                data-testid="identify-apply"
                onClick={() => void handleApplyIdentifiedName()}
              >
                {identifyFor.candidateId === null
                  ? t("takeoff.identify.createMark")
                  : t("takeoff.identify.apply")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add marker dialog */}
      <Dialog
        open={!!pendingMarker}
        onOpenChange={(open) => {
          if (!open) setPendingMarker(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("takeoff.addDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <TradeTypeSelector
              trade={formTrade}
              typeId={formType}
              onTradeChange={(trade) => {
                setFormTrade(trade);
                const first = typesForTrade(trade)[0];
                if (first) {
                  setFormType(first.id);
                  setFormLabel(t(first.labelKey));
                }
              }}
              onTypeChange={(typeId, defaultLabel) => {
                setFormType(typeId);
                setFormLabel(defaultLabel);
              }}
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("takeoff.field.label")}</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("takeoff.field.note")}</Label>
              <Input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder={t("takeoff.field.notePlaceholder")}
                className="h-9 text-sm"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("takeoff.addDialog.unitHint", {
                unit: defaultUnitFor(formTrade, formType),
              })}
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingMarker(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant={regionAnalyzerEnabled && perms.allowConfirm ? "outline" : "default"}
              data-testid="manual-save-candidate"
              onClick={() => void savePendingMarker()}
            >
              {regionAnalyzerEnabled
                ? t("takeoff.manual.saveAsCandidate")
                : t("takeoff.addDialog.save")}
            </Button>
            {regionAnalyzerEnabled && perms.allowConfirm ? (
              <Button
                type="button"
                data-testid="manual-save-confirm"
                onClick={() => void savePendingMarker({ confirmNow: true })}
              >
                {t("takeoff.manual.saveAndConfirm")}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate confirmed symbol — operator resolution (no writes happened) */}
      <Dialog
        open={!!duplicateConflict}
        onOpenChange={(open) => {
          if (!open) setDuplicateConflict(null);
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="duplicate-conflict-dialog">
          <DialogHeader>
            <DialogTitle>{t("takeoff.duplicate.title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("takeoff.duplicate.description")}
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDuplicateConflict(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={reviewBusy}
              data-testid="duplicate-reject-candidate"
              onClick={() => {
                const conflict = duplicateConflict;
                setDuplicateConflict(null);
                if (conflict) void handleRejectCandidate(conflict.candidateId);
              }}
            >
              {t("takeoff.duplicate.rejectCandidate")}
            </Button>
            <Button
              type="button"
              data-testid="duplicate-open-evidence"
              onClick={() => {
                const conflict = duplicateConflict;
                setDuplicateConflict(null);
                if (conflict) {
                  setFocusEvidence({
                    pageNumber: conflict.existingPageNumber,
                    normalized: conflict.existingNormalized,
                    token: Date.now(),
                  });
                }
              }}
            >
              {t("takeoff.duplicate.openEvidence")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
