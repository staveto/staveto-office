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
import { addTakeoffLinesToQuoteDraft } from "@/services/takeoff/takeoffQuoteService";
import { DrawingPdfViewer, type MarkerMode } from "./DrawingPdfViewer";
import { TakeoffRightPanel } from "./TakeoffRightPanel";
import { QuoteDraftPanel } from "./QuoteDraftPanel";
import { TradeTypeSelector } from "./TradeTypeSelector";
import { setProjectVisualTakeoffStatus } from "@/services/takeoff/ensureDraftForVisualTakeoff";
import { buildDrawingTakeoffSummary } from "@/lib/takeoff/drawingTakeoffSummary";
import { visualTakeoffResumeHref } from "@/lib/takeoff/visualTakeoffResume";
import { ArrowLeft, CheckCircle2, Square } from "lucide-react";

export type TakeoffWorkbenchMode = "default" | "quote-precheck";
export type TakeoffReturnTo = "new-project-proposal" | "quote-review" | "documents";

type Props = {
  projectId: string;
  drawingId: string;
  fileName: string;
  fileUrl: string | null;
  mode?: TakeoffWorkbenchMode;
  returnTo?: TakeoffReturnTo;
  showFinishButton?: boolean;
  onFinished?: (destination: string) => void;
};

type PendingMarker = { pageNumber: number; rect: NormalizedRect };

export function PlanTakeoffWorkbench({
  projectId,
  drawingId,
  fileName,
  fileUrl,
  mode = "default",
  returnTo = "documents",
  showFinishButton,
  onFinished,
}: Props) {
  const { t } = useI18n();
  const quotePrecheck = mode === "quote-precheck";
  const finishEnabled = showFinishButton ?? quotePrecheck;
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

  // Add-dialog form state (remembers last trade/type for fast repeated marking).
  const [formTrade, setFormTrade] = useState<TakeoffTrade>("electrical");
  const [formType, setFormType] = useState<string>("socket");
  const [formLabel, setFormLabel] = useState("");
  const [formNote, setFormNote] = useState("");

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  // Load persisted occurrences.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listDrawingOccurrences(projectId, drawingId)
      .then((list) => {
        if (!cancelled) setOccurrences(list);
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
  }, [projectId, drawingId, showToast, t]);

  // ---- Marking --------------------------------------------------------------

  const handleMarkerDrawn = useCallback(
    (pageNumber: number, rect: NormalizedRect) => {
      setPendingMarker({ pageNumber, rect });
      const typeDef = typesForTrade(formTrade).find((d) => d.id === formType);
      setFormLabel(typeDef ? t(typeDef.labelKey) : "");
      setFormNote("");
    },
    [formTrade, formType, t]
  );

  const savePendingMarker = async () => {
    if (!pendingMarker) return;
    const label = formLabel.trim() || t("takeoff.type.generic");
    const input: DrawingOccurrenceInput = {
      projectId,
      drawingId,
      pageNumber: pendingMarker.pageNumber,
      type: formType,
      trade: formTrade,
      label,
      source: "manual",
      status: "draft",
      normalizedPosition: pendingMarker.rect,
      note: formNote.trim() || undefined,
    };
    setPendingMarker(null);
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
        const result = await addTakeoffLinesToQuoteDraft(projectId, lines);
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
    [occurrences, projectId, t]
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
    <div className="space-y-3">
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

      {!loading && occurrences.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium text-foreground">{t("takeoff.empty.title")}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("takeoff.empty.body")}</p>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-[#e06737] text-white hover:bg-[#C9552B]"
            onClick={() => setMarkerMode("rect")}
          >
            <Square className="size-3.5 mr-1" />
            {t("takeoff.empty.drawRect")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        {/* Left: interactive PDF */}
        <div>
          <DrawingPdfViewer
            fileUrl={fileUrl}
            fileName={fileName}
            occurrences={occurrences}
            selectedOccurrenceId={selectedId}
            onMarkerClick={(id) => setSelectedId(id)}
            onMarkerDrawn={handleMarkerDrawn}
            markerMode={markerMode}
            onMarkerModeChange={setMarkerMode}
            heightClassName="h-[640px]"
          />
        </div>

        {/* Right: list + detail + quote */}
        <div className="flex max-h-[720px] flex-col gap-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <div className="min-h-0 flex-1">
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
              </div>
              <QuoteDraftPanel
                occurrences={occurrences}
                onAddToQuote={handleAddToQuote}
                busy={quoteBusy}
                resultMessage={quoteMessage}
              />
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingMarker(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void savePendingMarker()}>
              {t("takeoff.addDialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
