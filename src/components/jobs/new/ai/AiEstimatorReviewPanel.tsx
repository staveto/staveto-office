"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  ListPlus,
  Loader2,
  PenLine,
  Ruler,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import {
  isAiEstimatorDebugEnabled,
  isAiVisualSymbolCounterEnabled,
} from "@/lib/ai/aiEstimatorFeature";
import { openAiDraftAttachment } from "@/lib/ai/aiDraftAttachmentPreview";
import { AiEstimatorSymbolAssemblySection } from "./AiEstimatorSymbolAssemblySection";
import { foldLegendIntoEstimatorFacts } from "@/lib/ai/foldLegendIntoEstimatorFacts";
import {
  applyManualQuantityOverride,
  buildSymbolCountComparisonRows,
  getSymbolCountingSummary,
  resolveQuantitySource,
  type SymbolCountRowStatus,
} from "@/lib/ai/quantitySource";
import { createUnavailableSymbolCounting } from "@/lib/ai/symbolOccurrenceService";
import {
  buildEstimatorExtractionQualityReport,
} from "@/lib/ai/estimatorExtractionQuality";
import {
  estimatorFactsAsReviewSuggestions,
  resolveMvpQuoteGate,
  type MvpConfirmedTakeoffRow,
} from "@/lib/ai/estimatorMvpTakeoffGate";
import {
  buildDrawingTakeoffSummary,
  type DrawingTakeoffSummary,
} from "@/lib/takeoff/drawingTakeoffSummary";
import { getDrawingTakeoffSummary } from "@/services/takeoff/drawingTakeoffSummaryService";
import { cn } from "@/lib/utils";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import type {
  AiEstimateLine,
  AiEstimatorFacts,
  AiExtractedItem,
  AiQuantityUnit,
  AiQuoteDraft,
  QuantitySource,
} from "@/types/aiEstimator";
import type { VisualNormalizedPoint } from "@/types/visualSymbols";
import { njNavPrimary, njNavSecondary } from "../newJobFormStyles";

type CockpitTab =
  | "review"
  | "breakdown"
  | "counts"
  | "symbols"
  | "visual"
  | "offer"
  | "details";

type VisualReviewAction = "confirmed" | "ignored" | null;

const visualPointLabel: Record<VisualNormalizedPoint, string> = {
  switch_point: "Vypínač",
  socket_point: "Zásuvka",
  double_socket_point: "Dvojzásuvka",
  light_output: "Svetelný vývod",
  led_strip_point: "LED prvok",
  unknown: "Neznáma značka",
};

type BreakdownFilter =
  | "all"
  | "review"
  | "lighting"
  | "led"
  | "socket"
  | "material"
  | "labor";

type Props = {
  facts: AiEstimatorFacts;
  sessionId: string;
  estimateLines?: AiEstimateLine[];
  quoteDraft?: AiQuoteDraft | null;
  busy?: boolean;
  onBuildEstimate?: () => Promise<void>;
  onBuildQuote?: () => Promise<void>;
  onCreateQuoteProject?: () => Promise<void>;
  onCreateProjectOnly?: () => void;
  attachmentFileNames?: string[];
  attachmentFiles?: UploadedAiDraftFile[];
  /** Draft project created for visual takeoff (same flow). */
  linkedProjectId?: string | null;
  visualTakeoffBusy?: boolean;
  onStartVisualTakeoff?: () => Promise<void> | void;
  onSkipVisualTakeoff?: () => Promise<void> | void;
};

const symbolTypeLabel: Record<string, string> = {
  pendant_light: "Visiace svietidlo",
  ceiling_light: "Stropné svietidlo",
  wall_light: "Nástenné osvetlenie",
  led_strip: "LED pás",
  lighting_profile: "LED profil / lišta",
  mirror_light_output: "Podsvietenie zrkadla",
  furniture_light: "Podsvietenie nábytku",
  socket: "Zásuvka",
  switch: "Vypínač",
  distribution_board: "Rozvádzač",
  cable_route: "Trasa kábla",
  unknown: "Neznáma značka",
};

function confidenceLabel(c: string, t: (k: string) => string): string {
  if (c === "high") return t("projects.aiEstimator.confidence.high");
  if (c === "low") return t("projects.aiEstimator.confidence.low");
  return t("projects.aiEstimator.confidence.medium");
}

function originLabel(o: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    from_document: t("projects.aiEstimator.origin.fromDocument"),
    from_photo: t("projects.aiEstimator.origin.fromPhoto"),
    from_user_text: t("projects.aiEstimator.origin.fromText"),
    inferred: t("projects.aiEstimator.origin.inferred"),
    assumption: t("projects.aiEstimator.origin.assumption"),
    missing: t("projects.aiEstimator.origin.missing"),
  };
  return map[o] ?? o;
}

function riskLevelLabel(c: string, t: (k: string) => string): string {
  if (c === "high") return t("projects.aiEstimator.riskLevel.high");
  if (c === "low") return t("projects.aiEstimator.riskLevel.low");
  return t("projects.aiEstimator.riskLevel.medium");
}

function quantitySourceBadgeKey(source: QuantitySource): string {
  switch (source) {
    case "schedule":
      return "projects.aiEstimator.qtySource.schedule";
    case "drawing_detection":
      return "projects.aiEstimator.qtySource.drawing";
    case "manual":
      return "projects.aiEstimator.qtySource.manual";
    case "legend":
      return "projects.aiEstimator.qtySource.legend";
    case "ai_estimate":
      return "projects.aiEstimator.qtySource.estimate";
    default:
      return "projects.aiEstimator.qtySource.unknown";
  }
}

function countRowStatusLabel(status: SymbolCountRowStatus, t: (k: string) => string): string {
  switch (status) {
    case "ok":
      return t("projects.aiEstimator.countStatus.ok");
    case "needs_confirm":
      return t("projects.aiEstimator.countStatus.needsConfirm");
    case "missing_on_drawing":
      return t("projects.aiEstimator.countStatus.missingOnDrawing");
    case "missing_in_legend":
      return t("projects.aiEstimator.countStatus.missingInLegend");
    case "unknown_symbol":
      return t("projects.aiEstimator.countStatus.unknownSymbol");
    case "unmeasured_length":
      return t("projects.aiEstimator.countStatus.unmeasuredLength");
    default:
      return status;
  }
}

function matchesFilter(item: AiExtractedItem, filter: BreakdownFilter): boolean {
  if (filter === "all") return true;
  if (filter === "review") return item.needsReview || item.confidence === "low";
  if (filter === "lighting")
    return item.category === "lighting" || /svietidl|osvetlen/i.test(item.title);
  if (filter === "led")
    return item.category === "led_strip" || /led/i.test(item.title);
  if (filter === "socket")
    return (
      item.category === "socket" ||
      item.category === "switch" ||
      /zásuv|vypínač|vypinac/i.test(item.title)
    );
  if (filter === "material")
    return (
      item.category !== "labor" &&
      item.category !== "travel" &&
      item.origin !== "assumption"
    );
  if (filter === "labor") return item.category === "labor" || item.category === "travel";
  return true;
}

export function AiEstimatorReviewPanel({
  facts,
  sessionId,
  estimateLines = [],
  quoteDraft = null,
  busy,
  onBuildEstimate,
  onBuildQuote,
  onCreateQuoteProject,
  onCreateProjectOnly,
  attachmentFileNames = [],
  attachmentFiles = [],
  linkedProjectId = null,
  visualTakeoffBusy = false,
  onStartVisualTakeoff,
  onSkipVisualTakeoff,
}: Props) {
  const { t } = useI18n();
  const debug = isAiEstimatorDebugEnabled();
  const displayFacts = useMemo(() => {
    const folded = foldLegendIntoEstimatorFacts(facts);
    if (folded.symbolCounting) return folded;
    return {
      ...folded,
      symbolCounting: createUnavailableSymbolCounting(folded.legendEntries ?? []),
    };
  }, [facts]);
  // Estimator-ready review: "Na kontrolu" is always the entry screen.
  const [tab, setTab] = useState<CockpitTab>("review");
  const [breakdownFilter, setBreakdownFilter] = useState<BreakdownFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(() => new Set());
  const [showAllSymbols, setShowAllSymbols] = useState(false);
  const [showFullLegend, setShowFullLegend] = useState(
    () => (facts.legendEntries?.length ?? 0) > 0
  );
  const [showMoreReview, setShowMoreReview] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [manualOverrides, setManualOverrides] = useState<
    Record<string, Partial<AiExtractedItem>>
  >({});
  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    quantity: string;
    roomName: string;
    unit: string;
    included: boolean;
  }>({ quantity: "", roomName: "", unit: "ks", included: true });
  const [takeoffSummary, setTakeoffSummary] = useState<DrawingTakeoffSummary | null>(null);
  const [takeoffSkippedLocal, setTakeoffSkippedLocal] = useState(false);
  const [confirmedRows, setConfirmedRows] = useState<MvpConfirmedTakeoffRow[]>([]);
  const [ignoredSuggestionIds, setIgnoredSuggestionIds] = useState<Set<string>>(() => new Set());
  const [showManualForm, setShowManualForm] = useState(false);
  const [showListPlaceholder, setShowListPlaceholder] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    label: "",
    quantity: "1",
    unit: "ks",
    roomName: "",
    category: "other",
  });

  const previewFiles = attachmentFiles.length
    ? attachmentFiles
    : attachmentFileNames.map((fileName) => ({
        id: `name:${fileName}`,
        fileName,
        mimeType: fileName.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/octet-stream",
        storagePath: "",
      }));

  const hasPdfAttachments = previewFiles.some(
    (f) =>
      (f.mimeType ?? "").toLowerCase() === "application/pdf" ||
      f.fileName.toLowerCase().endsWith(".pdf")
  );

  useEffect(() => {
    if (!linkedProjectId) return;
    let cancelled = false;
    getDrawingTakeoffSummary(linkedProjectId)
      .then((summary) => {
        if (!cancelled) setTakeoffSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setTakeoffSummary(buildDrawingTakeoffSummary([]));
      });
    return () => {
      cancelled = true;
    };
  }, [linkedProjectId]);

  const resolvedTakeoffSummary = useMemo(() => {
    const base =
      takeoffSummary ??
      buildDrawingTakeoffSummary([], { skippedManual: takeoffSkippedLocal });
    if (takeoffSkippedLocal) {
      return { ...base, takeoffStatus: "skipped_manual" as const };
    }
    return base;
  }, [takeoffSummary, takeoffSkippedLocal]);

  const rows = useMemo(() => {
    const all = [...displayFacts.extractedItems, ...displayFacts.inferredItems];
    return all
      .map((i) => {
        const o = manualOverrides[i.id];
        return o ? applyManualQuantityOverride(i, o) : i;
      })
      .filter((i) => i.included !== false);
  }, [displayFacts, manualOverrides]);

  const aiSuggestions = useMemo(
    () =>
      estimatorFactsAsReviewSuggestions(displayFacts).filter(
        (i) => !ignoredSuggestionIds.has(i.id) && !i.id.startsWith("legend_item_")
      ),
    [displayFacts, ignoredSuggestionIds]
  );

  const reviewItems = useMemo(
    () => rows.filter((i) => i.needsReview || i.confidence === "low" || i.origin === "assumption"),
    [rows]
  );

  const criticalQs = useMemo(
    () =>
      displayFacts.missingQuestions.filter(
        (q) => q.blocksFixedQuote || q.importance === "critical"
      ),
    [displayFacts.missingQuestions]
  );
  const confirmQs = useMemo(
    () =>
      displayFacts.missingQuestions.filter(
        (q) => !q.blocksFixedQuote && q.importance !== "critical"
      ),
    [displayFacts.missingQuestions]
  );

  const legendEntries = displayFacts.legendEntries ?? [];
  const symbolOccurrences = displayFacts.symbolOccurrences ?? [];
  const unknownSymbols = displayFacts.unknownSymbols ?? [];
  const unclearSymbols = useMemo(
    () => [
      ...unknownSymbols,
      ...symbolOccurrences.filter((s) => s.needsReview || s.confidence === "low"),
    ],
    [unknownSymbols, symbolOccurrences]
  );

  const symbolCounting = useMemo(
    () => getSymbolCountingSummary(displayFacts),
    [displayFacts]
  );

  // Visual symbol counter (feature-flagged): heuristic pixel-level detections.
  const visualCounterEnabled = isAiVisualSymbolCounterEnabled();
  const visualDetections = useMemo(
    () => (visualCounterEnabled ? (displayFacts.visualDetections ?? []) : []),
    [visualCounterEnabled, displayFacts.visualDetections]
  );
  const [visualActions, setVisualActions] = useState<Record<string, VisualReviewAction>>({});
  const [visualTypeOverrides, setVisualTypeOverrides] = useState<
    Record<string, VisualNormalizedPoint>
  >({});

  const quality = useMemo(
    () => buildEstimatorExtractionQualityReport({ facts: displayFacts }),
    [displayFacts]
  );

  const comparisonRows = useMemo(
    () => buildSymbolCountComparisonRows(displayFacts, manualOverrides),
    [displayFacts, manualOverrides]
  );

  const priceMissingFromEstimate = useMemo(
    () =>
      (quoteDraft?.lines ?? estimateLines).filter(
        (l) => l.totalPrice == null && (l.unitPrice == null || l.unitPrice <= 0)
      ).length,
    [quoteDraft, estimateLines]
  );

  const mvpGate = useMemo(
    () =>
      resolveMvpQuoteGate({
        facts: displayFacts,
        takeoffSummary: resolvedTakeoffSummary,
        confirmedRows,
        priceMissingCount: priceMissingFromEstimate,
        reviewPendingCount: criticalQs.length + reviewItems.length + unclearSymbols.length,
        criticalQuestionCount: criticalQs.length,
      }),
    [
      displayFacts,
      resolvedTakeoffSummary,
      confirmedRows,
      priceMissingFromEstimate,
      criticalQs.length,
      reviewItems.length,
      unclearSymbols.length,
    ]
  );

  const readyForQuote = mvpGate.allowFixedQuote;
  const quoteActionsEnabled = mvpGate.hasConfirmedTakeoff;
  const preliminaryOnly = mvpGate.preliminaryOnly;

  const recommendation = !mvpGate.hasConfirmedTakeoff
    ? t("projects.aiEstimator.mvp.takeoffNotConfirmed")
    : readyForQuote
      ? t("projects.aiEstimator.cockpit.ready")
      : criticalQs.length > 0
        ? t("projects.aiEstimator.cockpit.recommendation", {
            count: String(criticalQs.length),
          })
        : t("projects.aiEstimator.mvp.quotePreliminary");

  const stickyStatus = readyForQuote
    ? t("projects.aiEstimator.cockpit.statusReady")
    : quoteActionsEnabled
      ? t("projects.aiEstimator.cockpit.statusPartial")
      : t("projects.aiEstimator.cockpit.statusBlocked", {
          count: String(Math.max(mvpGate.reasons.length, 1)),
        });

  const addConfirmedManualRow = (row: Omit<MvpConfirmedTakeoffRow, "id" | "quantityConfirmed">) => {
    setConfirmedRows((prev) => [
      ...prev,
      {
        ...row,
        id: `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        quantityConfirmed: true,
      },
    ]);
  };

  const roomsGrouped = useMemo(() => {
    const map = new Map<string, AiExtractedItem[]>();
    const q = search.trim().toLowerCase();
    for (const item of rows) {
      if (!matchesFilter(item, breakdownFilter)) continue;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !(item.roomName ?? "").toLowerCase().includes(q)
      ) {
        continue;
      }
      const room = item.roomName?.trim() || t("projects.aiEstimator.cockpit.noRoom");
      const list = map.get(room) ?? [];
      list.push(item);
      map.set(room, list);
    }
    return [...map.entries()];
  }, [rows, breakdownFilter, search, t]);

  const openPreview = async (file: UploadedAiDraftFile) => {
    if (!file.storagePath) {
      setPreviewError(t("projects.aiEstimator.cockpit.previewUnavailable"));
      return;
    }
    setPreviewBusy(true);
    setPreviewError(null);
    const result = await openAiDraftAttachment(file);
    setPreviewBusy(false);
    if (!result.ok) setPreviewError(result.error);
  };

  useEffect(() => {
    if (tab !== "breakdown") return;
    setExpandedRooms((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const [room, items] of roomsGrouped) {
        if (items.some((i) => i.needsReview || i.confidence === "low")) next.add(room);
      }
      if (next.size === 0 && roomsGrouped[0]) next.add(roomsGrouped[0][0]);
      return next;
    });
  }, [tab, roomsGrouped]);

  const tabs: { id: CockpitTab; label: string }[] = [
    { id: "review", label: t("projects.aiEstimator.tab.review") },
    { id: "breakdown", label: t("projects.aiEstimator.tab.breakdown") },
    { id: "counts", label: t("projects.aiEstimator.tab.counts") },
    { id: "symbols", label: t("projects.aiEstimator.tab.symbolsShort") },
    ...(visualCounterEnabled && visualDetections.length > 0
      ? [{ id: "visual" as const, label: t("projects.aiEstimator.tab.visual") }]
      : []),
    { id: "offer", label: t("projects.aiEstimator.tab.offer") },
    { id: "details", label: t("projects.aiEstimator.tab.details") },
  ];

  const toggleRoom = (room: string) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(room)) next.delete(room);
      else next.add(room);
      return next;
    });
  };

  const saveManualEdit = (itemId: string) => {
    const qty = Number(editDraft.quantity);
    setManualOverrides((prev) => ({
      ...prev,
      [itemId]: {
        quantity: Number.isFinite(qty) ? qty : undefined,
        roomName: editDraft.roomName || undefined,
        unit: (editDraft.unit as AiQuantityUnit) || "ks",
        included: editDraft.included,
        quantitySource: "manual",
      },
    }));
    const sourceItem = rows.find((r) => r.id === itemId);
    if (sourceItem && Number.isFinite(qty) && qty > 0 && editDraft.included) {
      addConfirmedManualRow({
        label: sourceItem.title,
        category: sourceItem.category,
        quantity: qty,
        unit: (editDraft.unit as string) || "ks",
        roomName: editDraft.roomName || undefined,
        source: "manual",
      });
    }
    setEditingCountId(null);
  };

  const reviewCardsLimit = showMoreReview ? 40 : 8;

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5"
      data-testid="ai-estimator-review"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {t("projects.aiEstimator.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("projects.aiEstimator.subtitle")}
          </p>
          {debug ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Session {sessionId.slice(0, 8)} · {t("projects.aiEstimator.confidence")}:{" "}
              {confidenceLabel(displayFacts.confidence, t)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPdfAttachments && onStartVisualTakeoff ? (
            <Button
              type="button"
              className={njNavPrimary()}
              disabled={busy || visualTakeoffBusy}
              data-testid="start-visual-takeoff"
              onClick={() => void onStartVisualTakeoff()}
            >
              {visualTakeoffBusy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Ruler className="mr-2 size-4" />
              )}
              {t("projects.aiEstimator.visualTakeoff.ctaStart")}
            </Button>
          ) : previewFiles.some((f) => f.storagePath) ? (
            previewFiles
              .filter((f) => f.storagePath)
              .slice(0, 1)
              .map((file) => (
                <Button
                  key={file.id}
                  type="button"
                  variant="outline"
                  className={njNavSecondary()}
                  disabled={busy || previewBusy}
                  onClick={() => void openPreview(file)}
                >
                  {previewBusy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 size-4" />
                  )}
                  {t("projects.aiEstimator.cockpit.openPdf")}
                  <ExternalLink className="ml-1.5 size-3.5 opacity-70" />
                </Button>
              ))
          ) : null}
          {onBuildQuote ? (
            <Button
              type="button"
              variant={quoteActionsEnabled && !preliminaryOnly ? "default" : "outline"}
              className={
                quoteActionsEnabled && !preliminaryOnly ? njNavPrimary() : njNavSecondary()
              }
              disabled={!!busy || !quoteActionsEnabled}
              data-testid="create-quote-from-review"
              title={
                !quoteActionsEnabled
                  ? t("projects.aiEstimator.mvp.quotePreliminary")
                  : undefined
              }
              onClick={() => {
                if (!quoteActionsEnabled) return;
                setTab("offer");
                void onBuildQuote();
              }}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {t("projects.aiEstimator.createQuote")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* MVP honesty banner — until takeoff is user-confirmed */}
      {!mvpGate.hasConfirmedTakeoff ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-1"
          data-testid="mvp-takeoff-honesty"
          role="status"
        >
          <p className="text-sm font-semibold text-amber-950">
            {t("projects.aiEstimator.mvp.takeoffNotConfirmed")}
          </p>
          <p className="text-xs text-amber-900">
            {t("projects.aiEstimator.mvp.verifyInSetup")}
          </p>
          <p className="text-xs text-amber-900">
            {t("projects.aiEstimator.mvp.aiHelpedRead")}
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2"
          data-testid="mvp-takeoff-confirmed"
          role="status"
        >
          <p className="text-xs font-medium text-emerald-900">
            {t("projects.aiEstimator.mvp.aiHelpedRead")}
          </p>
        </div>
      )}

      {previewError ? (
        <p className="text-sm text-amber-700 dark:text-amber-200" role="alert">
          {previewError}
        </p>
      ) : null}

      {hasPdfAttachments ? (
        <div
          className="rounded-xl border border-[#1D376A]/25 bg-[#EFF6FF] px-4 py-3 space-y-2"
          data-testid="visual-takeoff-block"
        >
          <p className="text-sm font-semibold text-[#1D376A]">
            {t("projects.aiEstimator.visualTakeoff.title")}
          </p>
          <p className="text-xs text-[#475569] leading-relaxed">
            {t("projects.aiEstimator.mvp.verifyInSetup")}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {onStartVisualTakeoff ? (
              <Button
                type="button"
                size="sm"
                className="h-8 bg-[#1D376A] text-white hover:bg-[#162952]"
                disabled={busy || visualTakeoffBusy}
                data-testid="start-visual-takeoff-secondary"
                onClick={() => void onStartVisualTakeoff()}
              >
                {visualTakeoffBusy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Ruler className="mr-1.5 size-3.5" />
                )}
                {t("projects.aiEstimator.visualTakeoff.ctaStart")}
              </Button>
            ) : null}
            {onSkipVisualTakeoff && !mvpGate.hasConfirmedTakeoff ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#CBD5E1]"
                disabled={busy || visualTakeoffBusy}
                data-testid="skip-visual-takeoff"
                onClick={() => {
                  setTakeoffSkippedLocal(true);
                  setShowManualForm(true);
                  void onSkipVisualTakeoff();
                }}
              >
                {t("projects.aiEstimator.visualTakeoff.ctaSkipManual")}
              </Button>
            ) : null}
          </div>
          {!mvpGate.hasConfirmedTakeoff ? (
            <p className="text-xs text-amber-800">
              {t("projects.aiEstimator.mvp.quotePreliminary")}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Create takeoff — three modes */}
      <div
        className="rounded-xl border-2 border-[#1D376A]/20 bg-[#F6F8FB] px-4 py-3 space-y-3"
        data-testid="mvp-create-takeoff"
      >
        <p className="text-sm font-bold text-[#0F2A4D]">
          {t("projects.aiEstimator.mvp.createTakeoff")}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 whitespace-normal px-3 py-3 text-left"
            disabled={busy || visualTakeoffBusy || !onStartVisualTakeoff}
            data-testid="takeoff-mode-docs"
            onClick={() => {
              if (onStartVisualTakeoff) void onStartVisualTakeoff();
            }}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#1D376A]">
              <Ruler className="size-4" />
              {t("projects.aiEstimator.mvp.modeDocs")}
            </span>
            <span className="text-[11px] font-normal text-[#64748B]">
              {t("projects.aiEstimator.mvp.modeDocsHint")}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 whitespace-normal px-3 py-3 text-left"
            data-testid="takeoff-mode-list"
            onClick={() => {
              setShowListPlaceholder(true);
              setShowManualForm(true);
            }}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#1D376A]">
              <ClipboardList className="size-4" />
              {t("projects.aiEstimator.mvp.modeList")}
            </span>
            <span className="text-[11px] font-normal text-[#64748B]">
              {t("projects.aiEstimator.mvp.modeListHint")}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-1 whitespace-normal px-3 py-3 text-left"
            data-testid="takeoff-mode-manual"
            onClick={() => setShowManualForm(true)}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#1D376A]">
              <PenLine className="size-4" />
              {t("projects.aiEstimator.mvp.modeManual")}
            </span>
            <span className="text-[11px] font-normal text-[#64748B]">
              {t("projects.aiEstimator.mvp.modeManualHint")}
            </span>
          </Button>
        </div>
        {showListPlaceholder ? (
          <p className="text-xs text-[#475569]" data-testid="schedule-list-placeholder">
            {t("projects.aiEstimator.mvp.modeListPlaceholder")}
          </p>
        ) : null}
        {showManualForm ? (
          <div
            className="space-y-2 rounded-lg border border-[#E2E8F0] bg-white p-3"
            data-testid="manual-takeoff-form"
          >
            <p className="text-xs font-semibold text-[#0F2A4D]">
              {t("projects.aiEstimator.mvp.manualAdd")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={manualDraft.label}
                onChange={(e) => setManualDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder={t("projects.aiEstimator.mvp.manualName")}
                aria-label={t("projects.aiEstimator.mvp.manualName")}
              />
              <Input
                value={manualDraft.category}
                onChange={(e) => setManualDraft((d) => ({ ...d, category: e.target.value }))}
                placeholder={t("projects.aiEstimator.mvp.manualCategory")}
                aria-label={t("projects.aiEstimator.mvp.manualCategory")}
              />
              <Input
                value={manualDraft.quantity}
                onChange={(e) => setManualDraft((d) => ({ ...d, quantity: e.target.value }))}
                placeholder={t("projects.aiEstimator.mvp.manualQty")}
                aria-label={t("projects.aiEstimator.mvp.manualQty")}
              />
              <Input
                value={manualDraft.unit}
                onChange={(e) => setManualDraft((d) => ({ ...d, unit: e.target.value }))}
                placeholder={t("projects.aiEstimator.mvp.manualUnit")}
                aria-label={t("projects.aiEstimator.mvp.manualUnit")}
              />
              <Input
                className="sm:col-span-2"
                value={manualDraft.roomName}
                onChange={(e) => setManualDraft((d) => ({ ...d, roomName: e.target.value }))}
                placeholder={t("projects.aiEstimator.mvp.manualRoom")}
                aria-label={t("projects.aiEstimator.mvp.manualRoom")}
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#1D376A] text-white hover:bg-[#162952]"
              disabled={!manualDraft.label.trim() || Number(manualDraft.quantity) <= 0}
              onClick={() => {
                const q = Number(manualDraft.quantity.replace(",", "."));
                if (!manualDraft.label.trim() || !(q > 0)) return;
                addConfirmedManualRow({
                  label: manualDraft.label.trim(),
                  category: manualDraft.category.trim() || "other",
                  quantity: q,
                  unit: manualDraft.unit.trim() || "ks",
                  roomName: manualDraft.roomName.trim() || undefined,
                  source: showListPlaceholder ? "schedule" : "manual",
                });
                setManualDraft({
                  label: "",
                  quantity: "1",
                  unit: "ks",
                  roomName: "",
                  category: "other",
                });
              }}
            >
              <ListPlus className="mr-1 size-3.5" />
              {t("projects.aiEstimator.mvp.addToTakeoff")}
            </Button>
            {confirmedRows.length > 0 ? (
              <ul className="space-y-1 text-xs text-[#334155]">
                {confirmedRows.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 border-b border-[#E2E8F0] py-1">
                    <span>
                      {r.label}
                      {r.roomName ? ` · ${r.roomName}` : ""}
                    </span>
                    <span className="tabular-nums">
                      {r.quantity} {r.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Main metrics — confirmed takeoff only */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard
          label={t("projects.aiEstimator.cockpit.metricConfirmed")}
          value={String(mvpGate.metrics.confirmedItems)}
          emphasize={mvpGate.metrics.confirmedItems === 0}
        />
        <SummaryCard
          label={t("projects.aiEstimator.cockpit.metricReview")}
          value={String(mvpGate.metrics.needsReview)}
          emphasize={mvpGate.metrics.needsReview > 0}
        />
        <SummaryCard
          label={t("projects.aiEstimator.cockpit.metricNoPrice")}
          value={String(mvpGate.metrics.priceMissing)}
          emphasize={mvpGate.metrics.priceMissing > 0}
        />
        <SummaryCard
          label={t("projects.aiEstimator.cockpit.metricInQuote")}
          value={String(mvpGate.metrics.usedInQuote)}
        />
      </div>

      {preliminaryOnly ? (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950"
          role="status"
          data-testid="mvp-quote-preliminary"
        >
          <p className="font-medium">{t("projects.aiEstimator.mvp.quotePreliminary")}</p>
          {mvpGate.reasons.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-xs">
              {mvpGate.reasons.map((r) => (
                <li key={r}>
                  {t(`projects.aiEstimator.mvp.reason.${r}`)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          readyForQuote
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
            : "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
        )}
        role="status"
      >
        {recommendation}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-px">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === item.id
                ? "border-[var(--po-primary,#e06737)] font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "review" ? (
        <div className="space-y-5 text-sm">
          {quality.criticalWarnings.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.cockpit.blocksPrice")}>
              {quality.criticalWarnings.map((w) => (
                <ReviewCard
                  key={w}
                  title={w}
                  detail={t("projects.aiEstimator.quality.checkDrawingHint")}
                  badge={t("projects.aiEstimator.badge.blocksPrice")}
                  badgeTone="danger"
                />
              ))}
            </ReviewSection>
          ) : null}

          {mvpGate.hasConfirmedTakeoff &&
          criticalQs.length === 0 &&
          reviewItems.length === 0 &&
          quality.criticalWarnings.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p>{t("projects.aiEstimator.cockpit.noIssues")}</p>
            </div>
          ) : null}

          {/* AI suggestions — review only, not trusted takeoff */}
          {aiSuggestions.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.mvp.suggestionsTitle")}>
              <p className="mb-2 text-xs text-muted-foreground">
                {t("projects.aiEstimator.mvp.suggestionsHint")}
              </p>
              <ul className="space-y-2">
                {aiSuggestions.slice(0, showMoreReview ? 40 : 8).map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                    data-testid="ai-suggestion-row"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--foreground)]">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity != null ? `${item.quantity} ${item.unit}` : "—"}
                          {item.roomName ? ` · ${item.roomName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 bg-[#1D376A] px-2 text-[11px] text-white hover:bg-[#162952]"
                          onClick={() => {
                            const q = item.computedQuantity ?? item.quantity ?? 1;
                            addConfirmedManualRow({
                              label: item.title,
                              category: item.category,
                              quantity: q > 0 ? q : 1,
                              unit: item.unit && item.unit !== "unknown" ? item.unit : "ks",
                              roomName: item.roomName,
                              source: "manual",
                            });
                            setIgnoredSuggestionIds((prev) => new Set(prev).add(item.id));
                          }}
                        >
                          {t("projects.aiEstimator.mvp.addToTakeoff")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setShowManualForm(true);
                            setManualDraft({
                              label: item.title,
                              quantity: String(item.computedQuantity ?? item.quantity ?? 1),
                              unit: item.unit && item.unit !== "unknown" ? item.unit : "ks",
                              roomName: item.roomName ?? "",
                              category: item.category,
                            });
                          }}
                        >
                          {t("projects.aiEstimator.mvp.editSuggestion")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-muted-foreground"
                          onClick={() =>
                            setIgnoredSuggestionIds((prev) => new Set(prev).add(item.id))
                          }
                        >
                          {t("projects.aiEstimator.mvp.ignoreSuggestion")}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </ReviewSection>
          ) : null}

          {criticalQs.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.cockpit.blocksPrice")}>
              {criticalQs.slice(0, reviewCardsLimit).map((q) => (
                <ReviewCard
                  key={q.id}
                  title={q.question}
                  detail={q.reason}
                  badge={t("projects.aiEstimator.badge.blocksPrice")}
                  badgeTone="danger"
                />
              ))}
            </ReviewSection>
          ) : null}

          {confirmQs.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.cockpit.confirmWithCustomer")}>
              {confirmQs.slice(0, reviewCardsLimit).map((q) => (
                <ReviewCard
                  key={q.id}
                  title={q.question}
                  detail={q.reason}
                  badge={t("projects.aiEstimator.badge.confirm")}
                  badgeTone="warn"
                />
              ))}
            </ReviewSection>
          ) : null}

          {reviewItems.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.cockpit.verifyOnSite")}>
              {reviewItems.slice(0, reviewCardsLimit).map((item) => (
                <ReviewCard
                  key={item.id}
                  title={
                    item.roomName ? `${item.title} — ${item.roomName}` : item.title
                  }
                  detail={
                    item.reviewReason ||
                    `${originLabel(item.origin, t)} · ${confidenceLabel(item.confidence, t)}`
                  }
                  badge={t("projects.aiEstimator.badge.needsCheck")}
                  badgeTone="warn"
                />
              ))}
            </ReviewSection>
          ) : null}

          {displayFacts.risks.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.cockpit.priceRisks")}>
              {displayFacts.risks.slice(0, reviewCardsLimit).map((r) => (
                <ReviewCard
                  key={r.id}
                  title={r.title}
                  detail={r.description}
                  badge={t("projects.aiEstimator.badge.risk")}
                  badgeTone={r.severity === "high" ? "danger" : "warn"}
                />
              ))}
            </ReviewSection>
          ) : null}

          {unclearSymbols.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.cockpit.unclearSymbols")}>
              {unclearSymbols.slice(0, reviewCardsLimit).map((s) => (
                <ReviewCard
                  key={s.id}
                  title={s.visibleLabel || s.title}
                  detail={
                    [
                      s.roomName,
                      s.reviewReason || t("projects.aiEstimator.symbols.unknownReason"),
                      s.evidence?.[0]?.fileName
                        ? `${s.evidence[0].fileName}${
                            s.evidence[0].page != null ? ` s.${s.evidence[0].page}` : ""
                          }`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  badge={t("projects.aiEstimator.badge.needsCheck")}
                  badgeTone="warn"
                />
              ))}
            </ReviewSection>
          ) : null}

          {criticalQs.length + confirmQs.length + reviewItems.length + displayFacts.risks.length >
          8 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={njNavSecondary()}
              onClick={() => setShowMoreReview((v) => !v)}
            >
              {showMoreReview
                ? t("projects.aiEstimator.cockpit.showLess")
                : t("projects.aiEstimator.cockpit.showMore")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {tab === "breakdown" ? (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", t("projects.aiEstimator.filter.all")],
                ["review", t("projects.aiEstimator.filter.review")],
                ["lighting", t("projects.aiEstimator.filter.lighting")],
                ["led", t("projects.aiEstimator.filter.led")],
                ["socket", t("projects.aiEstimator.filter.socket")],
                ["material", t("projects.aiEstimator.filter.material")],
                ["labor", t("projects.aiEstimator.filter.labor")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setBreakdownFilter(id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  breakdownFilter === id
                    ? "border-[var(--po-primary,#e06737)] bg-[var(--po-primary,#e06737)]/10 font-medium"
                    : "border-[var(--border)] text-muted-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("projects.aiEstimator.cockpit.search")}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--po-primary,#e06737)]"
            />
          </div>

          <div className="space-y-2">
            {roomsGrouped.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                {t("projects.aiEstimator.emptyBreakdown")}
              </p>
            ) : null}
            {roomsGrouped.map(([room, items]) => {
              const open = expandedRooms.has(room);
              const pcs = items
                .filter((i) => i.unit === "ks")
                .reduce((s, i) => s + (i.computedQuantity ?? i.quantity ?? 0), 0);
              const meters = items
                .filter((i) => i.unit === "m")
                .reduce((s, i) => s + (i.computedQuantity ?? i.quantity ?? 0), 0);
              const summaryParts = [
                t("projects.aiEstimator.cockpit.typesCount", { count: String(items.length) }),
              ];
              if (pcs > 0) summaryParts.push(`${formatNum(pcs)} ks`);
              if (meters > 0) summaryParts.push(`${formatNum(meters)} m`);
              return (
                <div
                  key={room}
                  className="overflow-hidden rounded-lg border border-[var(--border)]"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--muted)]/30"
                    onClick={() => toggleRoom(room)}
                  >
                    {open ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-semibold">{room}</span>
                    <span className="text-xs text-muted-foreground">
                      {summaryParts.join(" · ")}
                    </span>
                    {items.some((i) => i.needsReview) ? (
                      <span className="ml-auto rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800 dark:text-amber-200">
                        {t("projects.aiEstimator.badge.needsCheck")}
                      </span>
                    ) : null}
                  </button>
                  {open ? (
                    <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]/60">
                      {items.map((item) => {
                        const qtySource = resolveQuantitySource(item);
                        return (
                        <li
                          key={item.id}
                          className={cn(
                            "flex flex-wrap items-baseline justify-between gap-2 px-3 py-2",
                            item.needsReview && "bg-amber-500/5"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="font-medium">{item.title}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  qtySource === "drawing_detection" &&
                                    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                                  qtySource === "schedule" &&
                                    "bg-sky-500/15 text-sky-800 dark:text-sky-200",
                                  qtySource === "manual" &&
                                    "bg-violet-500/15 text-violet-800 dark:text-violet-200",
                                  (qtySource === "ai_estimate" || qtySource === "legend") &&
                                    "bg-amber-500/15 text-amber-800 dark:text-amber-200",
                                  qtySource === "unknown" &&
                                    "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                                )}
                              >
                                {t(quantitySourceBadgeKey(qtySource))}
                              </span>
                              {item.needsReview ? (
                                <span className="text-amber-700 dark:text-amber-300">
                                  {item.reviewReason ||
                                    t("projects.aiEstimator.badge.needsCheck")}
                                </span>
                              ) : null}
                              <span>·</span>
                              <span>{confidenceLabel(item.confidence, t)}</span>
                            </div>
                          </div>
                          <div className="tabular-nums text-sm font-medium">
                            {item.computedQuantity ?? item.quantity ?? "—"}{" "}
                            {item.unit && item.unit !== "unknown" ? item.unit : ""}
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "counts" ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("projects.aiEstimator.counts.lead")}
          </p>
          {!symbolCounting.drawingDetectionAvailable ? (
            <div
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100"
              role="status"
            >
              {t("projects.aiEstimator.cockpit.drawingCountUnavailableHint")}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.col.room")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.counts.symbol")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.counts.label")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.col.unit")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.counts.fromSchedule")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.counts.fromDrawing")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.counts.diff")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.col.source")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.col.confidence")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.counts.status")}</th>
                  <th className="px-2 py-1.5">{t("projects.aiEstimator.counts.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                      {t("projects.aiEstimator.emptyBreakdown")}
                    </td>
                  </tr>
                ) : null}
                {comparisonRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-t border-[var(--border)]/60",
                      row.needsReview && "bg-amber-500/5"
                    )}
                  >
                    <td className="px-2 py-1.5">{row.roomName}</td>
                    <td className="px-2 py-1.5 font-medium">{row.symbolCode}</td>
                    <td className="px-2 py-1.5">{row.label}</td>
                    <td className="px-2 py-1.5">{row.unit}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {row.quantityFromSchedule ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {symbolCounting.drawingDetectionAvailable
                        ? (row.detectedOccurrenceCount ?? "—")
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {row.difference == null ? "—" : row.difference}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                        {t(quantitySourceBadgeKey(row.quantitySource))}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{confidenceLabel(row.confidence, t)}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          row.status === "ok"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-800 dark:text-amber-200"
                        )}
                      >
                        {countRowStatusLabel(row.status, t)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={!row.hasBbox}
                          title={
                            row.hasBbox
                              ? t("projects.aiEstimator.counts.showOnDrawing")
                              : t("projects.aiEstimator.counts.showOnDrawingDisabled")
                          }
                        >
                          {t("projects.aiEstimator.counts.showOnDrawing")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setEditingCountId(row.id);
                            setEditDraft({
                              quantity: String(row.quantityFromSchedule ?? ""),
                              roomName: row.roomName === "—" ? "" : row.roomName,
                              unit: row.unit === "—" ? "ks" : row.unit,
                              included: row.included,
                            });
                          }}
                        >
                          {t("projects.aiEstimator.counts.confirmManual")}
                        </Button>
                      </div>
                      {editingCountId === row.id ? (
                        <div className="mt-2 space-y-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] p-2">
                          <label className="block text-[11px] text-muted-foreground">
                            {t("projects.aiEstimator.col.qty")}
                            <input
                              type="number"
                              className="mt-0.5 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1"
                              value={editDraft.quantity}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, quantity: e.target.value }))
                              }
                            />
                          </label>
                          <label className="block text-[11px] text-muted-foreground">
                            {t("projects.aiEstimator.col.room")}
                            <input
                              type="text"
                              className="mt-0.5 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1"
                              value={editDraft.roomName}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, roomName: e.target.value }))
                              }
                            />
                          </label>
                          <label className="flex items-center gap-2 text-[11px]">
                            <input
                              type="checkbox"
                              checked={editDraft.included}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, included: e.target.checked }))
                              }
                            />
                            {t("projects.aiEstimator.counts.includeInQuote")}
                          </label>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className={cn(njNavPrimary(), "h-7 text-[11px]")}
                              onClick={() => saveManualEdit(row.id)}
                            >
                              {t("projects.aiEstimator.counts.saveManual")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px]"
                              onClick={() => setEditingCountId(null)}
                            >
                              {t("projects.aiEstimator.cockpit.showLess")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AiEstimatorSymbolAssemblySection facts={displayFacts} />
        </div>
      ) : null}

      {tab === "symbols" ? (
        <div className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            {t("projects.aiEstimator.mvp.aiHelpedRead")}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryCard
              label={t("projects.aiEstimator.cockpit.legendMarksDetail")}
              value={String(legendEntries.length)}
            />
            <SummaryCard
              label={t("projects.aiEstimator.mvp.suggestionsTitle")}
              value={String(aiSuggestions.length)}
            />
            <SummaryCard
              label={t("projects.aiEstimator.symbols.unclear")}
              value={String(unclearSymbols.length)}
              emphasize={unclearSymbols.length > 0}
            />
          </div>

          {!symbolCounting.drawingDetectionAvailable ? (
            <div
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100"
              role="status"
            >
              {t("projects.aiEstimator.symbols.legendOnlyHint", {
                count: String(legendEntries.length || rows.length),
              })}
            </div>
          ) : legendEntries.length > 0 && symbolOccurrences.length === 0 ? (
            <div
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100"
              role="status"
            >
              {t("projects.aiEstimator.symbols.legendOnlyHint", {
                count: String(legendEntries.length),
              })}
            </div>
          ) : null}

          {legendEntries.length === 0 ? (
            <p className="text-muted-foreground">{t("projects.aiEstimator.symbols.noLegend")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {t("projects.aiEstimator.symbols.legendTableTitle")}
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={njNavSecondary()}
                  onClick={() => setShowFullLegend((v) => !v)}
                >
                  {showFullLegend
                    ? t("projects.aiEstimator.symbols.hideLegend")
                    : t("projects.aiEstimator.symbols.showLegend")}
                </Button>
              </div>
              {showFullLegend ? (
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5">{t("projects.aiEstimator.symbols.symbol")}</th>
                        <th className="px-2 py-1.5">{t("projects.aiEstimator.symbols.meaning")}</th>
                        <th className="px-2 py-1.5">{t("projects.aiEstimator.symbols.type")}</th>
                        <th className="px-2 py-1.5">{t("projects.aiEstimator.col.unit")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legendEntries.map((l) => (
                        <tr key={l.id} className="border-t border-[var(--border)]/60">
                          <td className="px-2 py-1.5 font-medium">{l.symbolLabel || "—"}</td>
                          <td className="px-2 py-1.5">{l.symbolDescription}</td>
                          <td className="px-2 py-1.5">
                            {symbolTypeLabel[l.normalizedType] ?? l.normalizedType}
                          </td>
                          <td className="px-2 py-1.5">
                            {l.unit && l.unit !== "unknown" ? l.unit : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}

          {unclearSymbols.length > 0 ? (
            <ReviewSection title={t("projects.aiEstimator.cockpit.unclearSymbols")}>
              {unclearSymbols.slice(0, showAllSymbols ? 100 : 12).map((s) => (
                <ReviewCard
                  key={s.id}
                  title={s.visibleLabel || s.title}
                  detail={[
                    s.roomName,
                    symbolTypeLabel[s.normalizedType] ?? s.normalizedType,
                    confidenceLabel(s.confidence, t),
                    s.reviewReason,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  badge={t("projects.aiEstimator.badge.needsCheck")}
                  badgeTone="warn"
                />
              ))}
            </ReviewSection>
          ) : (
            <p className="text-muted-foreground">
              {t("projects.aiEstimator.symbols.noUnclear")}
            </p>
          )}

          {symbolOccurrences.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={njNavSecondary()}
                onClick={() => setShowAllSymbols((v) => !v)}
              >
                {showAllSymbols
                  ? t("projects.aiEstimator.cockpit.showLess")
                  : t("projects.aiEstimator.symbols.showAll")}
              </Button>
            </div>
          ) : null}

          {showAllSymbols && symbolOccurrences.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">{t("projects.aiEstimator.col.room")}</th>
                    <th className="px-2 py-1.5">{t("projects.aiEstimator.col.item")}</th>
                    <th className="px-2 py-1.5">{t("projects.aiEstimator.col.qty")}</th>
                    <th className="px-2 py-1.5">{t("projects.aiEstimator.col.unit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {symbolOccurrences.slice(0, 200).map((s) => (
                    <tr key={s.id} className="border-t border-[var(--border)]/60">
                      <td className="px-2 py-1.5">{s.roomName || "—"}</td>
                      <td className="px-2 py-1.5">{s.title}</td>
                      <td className="px-2 py-1.5 tabular-nums">{s.quantity ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {s.unit && s.unit !== "unknown" ? s.unit : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "visual" ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t("projects.aiEstimator.visual.lead")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {visualDetections.slice(0, 60).map((d) => {
              const action = visualActions[d.id] ?? null;
              const point = visualTypeOverrides[d.id] ?? d.normalizedPoint;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    action === "ignored"
                      ? "border-[var(--border)]/50 opacity-50"
                      : action === "confirmed"
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-amber-500/40 bg-amber-500/5"
                  )}
                >
                  {/* Crop preview is not rendered yet — bbox reference shown instead. */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">
                      {visualPointLabel[point] ?? point}
                    </p>
                    <span className="shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                      {confidenceLabel(d.confidence, t)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      d.roomName || t("projects.aiEstimator.visual.noRoom"),
                      `s. ${d.page}`,
                      `bbox ${Math.round(d.bbox.x)}×${Math.round(d.bbox.y)} (${Math.round(d.bbox.width)}×${Math.round(d.bbox.height)} px)`,
                      `skóre ${d.matchScore.toFixed(2)}`,
                    ].join(" · ")}
                  </p>
                  {d.reviewReason && action !== "confirmed" ? (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                      {d.reviewReason}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={action === "confirmed" ? "default" : "outline"}
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        setVisualActions((prev) => ({
                          ...prev,
                          [d.id]: prev[d.id] === "confirmed" ? null : "confirmed",
                        }))
                      }
                    >
                      {t("projects.aiEstimator.visual.confirm")}
                    </Button>
                    <select
                      aria-label={t("projects.aiEstimator.visual.changeType")}
                      className="h-7 rounded border border-[var(--border)] bg-transparent px-1.5 text-[11px]"
                      value={point}
                      onChange={(e) =>
                        setVisualTypeOverrides((prev) => ({
                          ...prev,
                          [d.id]: e.target.value as VisualNormalizedPoint,
                        }))
                      }
                    >
                      {(Object.keys(visualPointLabel) as VisualNormalizedPoint[]).map(
                        (p) => (
                          <option key={p} value={p}>
                            {visualPointLabel[p]}
                          </option>
                        )
                      )}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-muted-foreground"
                      onClick={() =>
                        setVisualActions((prev) => ({
                          ...prev,
                          [d.id]: prev[d.id] === "ignored" ? null : "ignored",
                        }))
                      }
                    >
                      {t("projects.aiEstimator.visual.ignore")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("projects.aiEstimator.visual.cropsPending")}
          </p>
        </div>
      ) : null}

      {tab === "offer" ? (
        <div className="space-y-4 text-sm">
          <div
            className={cn(
              "rounded-lg border px-3 py-2",
              readyForQuote
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-amber-500/40 bg-amber-500/10"
            )}
          >
            {readyForQuote
              ? t("projects.aiEstimator.cockpit.offerReady")
              : t("projects.aiEstimator.mvp.quotePreliminary")}
          </div>
          {preliminaryOnly ? (
            <ul className="list-disc pl-4 text-xs text-amber-800 dark:text-amber-200" role="status">
              {mvpGate.reasons.map((r) => (
                <li key={r}>{t(`projects.aiEstimator.mvp.reason.${r}`)}</li>
              ))}
            </ul>
          ) : null}

          {quoteDraft ? (
            <>
              <OfferSection title={t("projects.aiEstimator.included")}>
                <ul className="list-disc pl-5">
                  {(quoteDraft.scopeIncluded.length
                    ? quoteDraft.scopeIncluded
                    : rows
                        .filter((r) => r.origin === "from_document")
                        .slice(0, 12)
                        .map((r) => r.title)
                  ).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </OfferSection>
              {(quoteDraft.assumptions?.length || quoteDraft.scopeExcluded?.length) ? (
                <OfferSection title={t("projects.aiEstimator.assumptions")}>
                  <ul className="list-disc pl-5">
                    {[...(quoteDraft.assumptions ?? []), ...(quoteDraft.scopeExcluded ?? [])].map(
                      (s) => (
                        <li key={s}>{s}</li>
                      )
                    )}
                  </ul>
                </OfferSection>
              ) : null}
              {estimateLines.length > 0 || quoteDraft.lines.length > 0 ? (
                <OfferSection title={t("projects.aiEstimator.cockpit.pricedItems")}>
                  <ul className="space-y-1">
                    {(quoteDraft.lines.length ? quoteDraft.lines : estimateLines)
                      .slice(0, 12)
                      .map((line) => (
                        <li
                          key={line.id}
                          className="flex justify-between gap-2 border-b border-[var(--border)]/40 py-1.5"
                        >
                          <span>
                            {line.title}{" "}
                            <span className="text-xs text-muted-foreground">
                              {line.quantity} {line.unit}
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {line.totalPrice != null ? line.totalPrice.toFixed(2) : "—"}
                          </span>
                        </li>
                      ))}
                  </ul>
                </OfferSection>
              ) : null}
              {criticalQs.length > 0 ? (
                <OfferSection title={t("projects.aiEstimator.cockpit.blocksPrice")}>
                  <ul className="list-disc pl-5">
                    {criticalQs.map((q) => (
                      <li key={q.id}>{q.question}</li>
                    ))}
                  </ul>
                </OfferSection>
              ) : null}
              {quoteDraft.total != null ? (
                <p className="text-base font-semibold tabular-nums">
                  {t("projects.aiEstimator.total")}: {quoteDraft.total.toFixed(2)}{" "}
                  {quoteDraft.currency}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground">{t("projects.aiEstimator.offerEmpty")}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {onBuildQuote && !quoteDraft ? (
              <Button
                type="button"
                className={njNavPrimary()}
                disabled={busy || !quoteActionsEnabled}
                onClick={() => void onBuildQuote()}
              >
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {t("projects.aiEstimator.createQuote")}
              </Button>
            ) : null}
            {onCreateQuoteProject ? (
              <Button
                type="button"
                className={njNavPrimary()}
                disabled={busy || !quoteDraft || !readyForQuote}
                onClick={() => void onCreateQuoteProject()}
                title={
                  !readyForQuote
                    ? t("projects.aiEstimator.mvp.quotePreliminary")
                    : undefined
                }
              >
                {t("projects.aiEstimator.confirmQuoteProject")}
              </Button>
            ) : null}
            {onCreateProjectOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={busy}
                onClick={onCreateProjectOnly}
              >
                {t("projects.aiEstimator.createProjectOnly")}
              </Button>
            ) : null}
            {onBuildEstimate ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={njNavSecondary()}
                disabled={busy || !quoteActionsEnabled}
                onClick={() => void onBuildEstimate()}
              >
                {t("projects.aiEstimator.buildEstimate")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "details" ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium">{t("projects.aiEstimator.tab.inputs")}</p>
          <ul className="rounded-lg border border-[var(--border)] p-3 space-y-1">
            {(attachmentFileNames.length
              ? attachmentFileNames
              : [t("projects.aiEstimator.noFiles")]
            ).map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">{displayFacts.inputSummary || "—"}</p>
          {displayFacts.warnings.length > 0 ? (
            <ul className="list-disc pl-5 text-amber-700 dark:text-amber-300">
              {displayFacts.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <p className="font-medium pt-2">
            {t("projects.aiEstimator.cockpit.legendMarksDetail")}
          </p>
          <p className="text-muted-foreground tabular-nums">
            {legendEntries.length}
          </p>
          {legendEntries.length > 0 ? (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] p-2 text-xs space-y-1">
              {legendEntries.slice(0, 40).map((l) => (
                <li key={l.id}>
                  {l.symbolLabel ? `${l.symbolLabel} — ` : ""}
                  {l.symbolDescription}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="font-medium pt-2">{t("projects.aiEstimator.rooms")}</p>
          <p className="text-muted-foreground">
            {displayFacts.rooms.map((r) => r.name).join(", ") || "—"}
          </p>
        </div>
      ) : null}

      {/* Action bar */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          {t("projects.aiEstimator.cockpit.unsavedOnce")}
        </p>
        <p className="text-xs font-medium">{stickyStatus}</p>
        <div className="flex flex-wrap gap-2">
          {onCreateProjectOnly ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={njNavSecondary()}
              disabled={busy}
              onClick={onCreateProjectOnly}
            >
              {t("projects.aiEstimator.cockpit.saveConcept")}
            </Button>
          ) : null}
          {onBuildQuote || onCreateQuoteProject ? (
            <Button
              type="button"
              size="sm"
              className={njNavPrimary()}
              disabled={busy || !quoteActionsEnabled}
              title={
                !quoteActionsEnabled
                  ? t("projects.aiEstimator.mvp.quotePreliminary")
                  : undefined
              }
              onClick={() => {
                if (!quoteActionsEnabled) return;
                if (quoteDraft && onCreateQuoteProject && readyForQuote) {
                  void onCreateQuoteProject();
                } else if (onBuildQuote) {
                  setTab("offer");
                  void onBuildQuote();
                }
              }}
            >
              {busy ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : null}
              {t("projects.aiEstimator.createQuote")}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function SummaryCard({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  const long = value.length > 8;
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        emphasize
          ? "border-amber-500/40 bg-amber-500/10"
          : "border-[var(--border)]/60 bg-[var(--muted)]/20"
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-semibold leading-tight",
          long ? "text-xs sm:text-sm" : "text-lg tabular-nums"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewCard({
  title,
  detail,
  badge,
  badgeTone,
}: {
  title: string;
  detail?: string;
  badge: string;
  badgeTone: "danger" | "warn" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium leading-snug">{title}</p>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
            badgeTone === "danger" &&
              "bg-red-500/15 text-red-800 dark:text-red-200",
            badgeTone === "warn" &&
              "bg-amber-500/15 text-amber-900 dark:text-amber-200",
            badgeTone === "neutral" && "bg-muted text-muted-foreground"
          )}
        >
          {badge}
        </span>
      </div>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function OfferSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
