"use client";

/**
 * Plan Takeoff Workbench — split view: interactive PDF drawing on the left,
 * linked occurrence list + detail + quote draft on the right.
 *
 * Manual-first: marking, editing, confirming and quoting all work without
 * any AI. "Find similar symbols" adds candidates (needs_review) on top and
 * never auto-confirms anything.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
import { analyzeDrawingRegion } from "@/services/takeoff/analyzeRegionService";
import {
  listTakeoffEvidenceForItem,
  listTakeoffItems,
  listSymbolCandidatesForDrawing,
  saveSymbolCandidates,
} from "@/services/takeoff/pdfTakeoffRegionService";
import {
  changeSymbolCandidateType,
  confirmAllProbableCandidates,
  confirmSymbolCandidate,
  DuplicateConfirmedSymbolError,
  markSymbolCandidateUnknownType,
  rejectSymbolCandidate,
} from "@/services/takeoff/symbolCandidateReviewService";
import {
  buildManualCandidateDto,
  dtoFromSymbolCandidate,
} from "@/lib/takeoff/candidateReview";
import { addTakeoffLinesToQuoteDraft } from "@/services/takeoff/takeoffQuoteService";
import {
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
}: Props) {
  const { t } = useI18n();
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
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
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

  const refreshTakeoffItems = useCallback(async () => {
    const items = await listTakeoffItems(projectId, drawingId);
    setTakeoffItems(items);
  }, [projectId, drawingId]);

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
  // search for the same symbol elsewhere on the plan.
  const handleFindSimilarFromCandidate = useCallback(
    async (candidateId: string) => {
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
          scope: "page",
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

  const handleEvidenceThumbClick = useCallback((thumb: EvidenceThumb) => {
    if (!thumb.normalized) return;
    setFocusEvidence({
      pageNumber: thumb.pageNumber,
      normalized: thumb.normalized,
      token: Date.now(),
    });
  }, []);

  const handleMarkerDrawn = useCallback(
    (pageNumber: number, rect: NormalizedRect) => {
      if (markerMode === "analyze_region") {
        void handleAnalyzeRegion(pageNumber, rect);
        return;
      }
      setPendingMarker({ pageNumber, rect });
      const typeDef = typesForTrade(formTrade).find((d) => d.id === formType);
      setFormLabel(typeDef ? t(typeDef.labelKey) : "");
      setFormNote("");
    },
    [formTrade, formType, t, markerMode, handleAnalyzeRegion]
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
        // Skip candidates overlapping existing occurrences on the same page.
        const existing = occurrences.filter((o) => o.pageNumber === reference.pageNumber);
        const overlapsExisting = (rect: NormalizedRect) =>
          existing.some((o) => {
            const a = o.normalizedPosition;
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
    [fileUrl, projectId, drawingId, occurrences, showToast, t]
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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        {/* Left: interactive PDF */}
        <div>
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
            showAnalyzeRegionMode={regionAnalyzerEnabled && perms.allowAnalyze}
            allowMarking={perms.allowEdit}
            initialPage={initialPage}
            analyzingRegion={analyzeBusy}
            focusEvidence={focusEvidence}
          />
        </div>

        {/* Right: candidates review / occurrence list + quote */}
        <div
          className={`flex flex-col gap-3 ${
            isFullscreen ? "max-h-[calc(100vh-100px)]" : "max-h-[720px]"
          }`}
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
              <div className="min-h-0 flex-1">
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
                    onMarkUnknown={handleMarkUnknown}
                    onConfirmAllProbable={handleConfirmAllProbable}
                    onEvidenceClick={(id) => void handleEvidenceClick(id)}
                    evidenceThumbs={evidenceThumbs}
                    onEvidenceThumbClick={handleEvidenceThumbClick}
                    canReview={perms.allowConfirm}
                    onFindSimilar={
                      perms.allowAnalyze
                        ? (id) => void handleFindSimilarFromCandidate(id)
                        : undefined
                    }
                    findSimilarBusy={similarFromConfirmedBusy}
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
