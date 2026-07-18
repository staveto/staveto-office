"use client";

/**
 * Phase 2 — right-side review panel for region symbol candidates.
 * Grouped by category; confirm / reject / change type / mark unknown.
 * Confirmed candidates leave the active list; rejected stay stored but hidden.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  X,
  HelpCircle,
  Pencil,
  ChevronDown,
  ChevronRight,
  CheckCheck,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";
import type { TakeoffItem } from "@/types/pdfTakeoff";
import {
  colorLayerAccent,
  defaultSymbolTypeForCandidate,
  groupCandidatesForReview,
} from "@/lib/takeoff/candidateReview";
import { LegendOnlyBadge } from "./LegendOnlyBadge";

const SYMBOL_TYPE_OPTIONS = [
  "socket",
  "switch",
  "light",
  "led_strip",
  "distribution_board",
  "generic",
  "unknown",
] as const;

export type EvidenceThumb = {
  id: string;
  url: string | null;
  pageNumber: number;
  normalized?: { x: number; y: number; width: number; height: number };
};

type Props = {
  candidates: AnalyzeRegionCandidateDto[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  takeoffItems: TakeoffItem[];
  busy?: boolean;
  onConfirm: (candidateId: string, symbolType: string) => Promise<void>;
  onReject: (candidateId: string) => Promise<void>;
  onChangeType: (candidateId: string, symbolType: string) => Promise<void>;
  onMarkUnknown: (candidateId: string) => Promise<void>;
  onConfirmAllProbable: () => Promise<void>;
  onEvidenceClick: (takeoffItemId: string) => void;
  /** Evidence thumbnails for the last clicked takeoff item (Phase 2.5). */
  evidenceThumbs?: { itemId: string; itemName: string; thumbs: EvidenceThumb[] } | null;
  onEvidenceThumbClick?: (thumb: EvidenceThumb) => void;
  /** False in readonly/document mode — hides confirm/reject/change actions. */
  canReview?: boolean;
  /**
   * Search for visually similar symbols starting from THIS candidate —
   * available before confirming, so a manual/single mark doesn't require a
   * confirm step first just to bump other matching symbols into review.
   */
  onFindSimilar?: (candidateId: string) => void;
  findSimilarBusy?: boolean;
};

export function SymbolCandidateReviewPanel({
  candidates,
  selectedId,
  onSelect,
  takeoffItems,
  busy = false,
  onConfirm,
  onReject,
  onChangeType,
  onMarkUnknown,
  onConfirmAllProbable,
  onEvidenceClick,
  evidenceThumbs = null,
  onEvidenceThumbClick,
  canReview = true,
  onFindSimilar,
  findSimilarBusy = false,
}: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [changeTypeFor, setChangeTypeFor] = useState<AnalyzeRegionCandidateDto | null>(
    null
  );
  const [changeTypeValue, setChangeTypeValue] = useState("socket");

  // Clicking a confirmed marker on the map selects it here too — auto-expand
  // the confirmed section so it's not silently hidden.
  const selectedCandidate = candidates.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedCandidate?.status === "confirmed") setShowConfirmed(true);
  }, [selectedCandidate]);

  const groups = useMemo(() => groupCandidatesForReview(candidates), [candidates]);
  const activeCount = groups.reduce((n, g) => n + g.candidates.length, 0);
  const confirmedCandidates = useMemo(
    () => candidates.filter((c) => c.status === "confirmed"),
    [candidates]
  );
  const rejectedCandidates = useMemo(
    () => candidates.filter((c) => c.status === "rejected"),
    [candidates]
  );
  const probableCount = candidates.filter(
    (c) =>
      c.status !== "rejected" &&
      c.status !== "confirmed" &&
      (c.status === "probable" || c.confidence >= 0.55)
  ).length;

  const detectionItems = takeoffItems.filter(
    (i) => i.sourceOfQuantity === "symbol_detection"
  );
  const legendItems = takeoffItems.filter((i) => i.sourceOfQuantity === "legend_only");

  if (
    activeCount === 0 &&
    confirmedCandidates.length === 0 &&
    rejectedCandidates.length === 0 &&
    detectionItems.length === 0 &&
    legendItems.length === 0
  ) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
        {t("takeoff.review.empty")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="symbol-candidate-review">
      {/* Section 1 — Kandidáti na kontrolu */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">
          {t("takeoff.review.sectionCandidates")}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("takeoff.review.activeCount", { count: activeCount })}
        </span>
        {canReview && probableCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs"
            disabled={busy}
            data-testid="confirm-all-probable"
            onClick={() => void onConfirmAllProbable()}
          >
            <CheckCheck className="mr-1 size-3.5" />
            {t("takeoff.review.confirmAllProbable")}
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-0.5">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.id);
          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-muted/50"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                {isCollapsed ? (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                )}
                <span>{t(group.labelKey)}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {group.candidates.length}
                </span>
              </button>
              {!isCollapsed
                ? group.candidates.map((c) => {
                    const selected = c.id === selectedId;
                    const accent = colorLayerAccent(c.color_layer);
                    const label =
                      c.label_suggestions[0]?.label ??
                      defaultSymbolTypeForCandidate(c);
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "border-t border-border/70 px-2.5 py-2",
                          selected && "bg-primary/5"
                        )}
                      >
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 text-left"
                          onClick={() => onSelect(c.id)}
                        >
                          {c.preview_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.preview_image_url}
                              alt={label}
                              loading="lazy"
                              data-testid="candidate-preview-thumb"
                              className="mt-0.5 size-10 shrink-0 rounded border border-border object-contain bg-white"
                              style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
                            />
                          ) : (
                            <span
                              className="mt-0.5 size-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: accent }}
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1">
                              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                                {label}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 rounded px-1 py-px text-[9px] font-medium",
                                  c.nearby_text
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                )}
                                data-testid={
                                  c.nearby_text ? "ocr-text-badge" : "ocr-no-text-badge"
                                }
                                title={c.nearby_text ?? undefined}
                              >
                                {c.nearby_text
                                  ? t("takeoff.ocr.hasText")
                                  : t("takeoff.ocr.noText")}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {Math.round(c.confidence * 100)}% · {c.source}
                              {c.nearby_text ? ` · ${c.nearby_text}` : ""}
                            </span>
                          </span>
                        </button>
                        {canReview ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            data-testid="candidate-confirm"
                            onClick={() =>
                              void onConfirm(c.id, defaultSymbolTypeForCandidate(c))
                            }
                          >
                            <Check className="mr-0.5 size-3" />
                            {t("takeoff.review.confirm")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            data-testid="candidate-reject"
                            onClick={() => void onReject(c.id)}
                          >
                            <X className="mr-0.5 size-3" />
                            {t("takeoff.review.reject")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            onClick={() => {
                              setChangeTypeFor(c);
                              setChangeTypeValue(defaultSymbolTypeForCandidate(c));
                            }}
                          >
                            <Pencil className="mr-0.5 size-3" />
                            {t("takeoff.review.changeType")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            onClick={() => void onMarkUnknown(c.id)}
                          >
                            <HelpCircle className="mr-0.5 size-3" />
                            {t("takeoff.review.markUnknown")}
                          </Button>
                          {onFindSimilar ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              disabled={busy || findSimilarBusy}
                              data-testid="candidate-find-similar"
                              onClick={() => onFindSimilar(c.id)}
                            >
                              <Copy className="mr-0.5 size-3" />
                              {findSimilarBusy
                                ? t("takeoff.action.findSimilarBusy")
                                : t("takeoff.action.findSimilar")}
                            </Button>
                          ) : null}
                        </div>
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}

        {/* Section 2 — Potvrdené značky */}
        {confirmedCandidates.length > 0 ? (
          <div
            className="overflow-hidden rounded-lg border border-emerald-600/30 bg-card"
            data-testid="section-confirmed"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-muted/50"
              onClick={() => setShowConfirmed((v) => !v)}
            >
              {showConfirmed ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
              <span>{t("takeoff.review.sectionConfirmed")}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {confirmedCandidates.length}
              </span>
            </button>
            {showConfirmed
              ? confirmedCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center gap-2 border-t border-border/70 px-2.5 py-1.5 text-left text-xs hover:bg-muted/50"
                    onClick={() => onSelect(c.id)}
                  >
                    <Check className="size-3 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {c.label_suggestions[0]?.label ?? defaultSymbolTypeForCandidate(c)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {c.source}
                    </span>
                  </button>
                ))
              : null}
          </div>
        ) : null}

        {/* Section 3 — Odmietnuté / skryté */}
        {rejectedCandidates.length > 0 ? (
          <div
            className="overflow-hidden rounded-lg border border-border bg-card"
            data-testid="section-rejected"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted/50"
              onClick={() => setShowRejected((v) => !v)}
            >
              {showRejected ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
              <span>{t("takeoff.review.sectionRejected")}</span>
              <span className="ml-auto tabular-nums">{rejectedCandidates.length}</span>
            </button>
            {showRejected
              ? rejectedCandidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 border-t border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground"
                  >
                    <X className="size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {c.label_suggestions[0]?.label ?? defaultSymbolTypeForCandidate(c)}
                    </span>
                    <span className="shrink-0 text-[10px]">{c.source}</span>
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </div>

      {/* Section 4 — Výkaz položiek (evidence links) */}
      {detectionItems.length > 0 || legendItems.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-2.5">
          <p className="text-xs font-semibold text-foreground">
            {t("takeoff.review.sectionItems")}
          </p>
          {detectionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted/60"
              data-testid="takeoff-evidence-link"
              onClick={() => onEvidenceClick(item.id)}
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                {item.quantity} {item.unit}
              </span>
              <span className="shrink-0 text-[10px] text-primary">
                {t("takeoff.review.evidenceCount", { count: item.evidenceCount })}
              </span>
            </button>
          ))}
          {legendItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-2 rounded-md px-1.5 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.quantity} {item.unit}
              </span>
              <LegendOnlyBadge compact />
            </div>
          ))}

          {/* Evidence thumbnails for the last clicked item — bbox focus still
              works without them (thumbnails are an optional enhancement). */}
          {evidenceThumbs && evidenceThumbs.thumbs.some((e) => e.url) ? (
            <div
              className="mt-1 border-t border-border/70 pt-1.5"
              data-testid="evidence-thumb-strip"
            >
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                {t("takeoff.review.evidenceFor", { name: evidenceThumbs.itemName })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {evidenceThumbs.thumbs
                  .filter((e) => e.url)
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="overflow-hidden rounded border border-border hover:ring-2 hover:ring-primary/40"
                      title={t("takeoff.review.evidenceThumbHint")}
                      onClick={() => onEvidenceThumbClick?.(e)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.url!}
                        alt={evidenceThumbs.itemName}
                        loading="lazy"
                        className="size-14 bg-white object-contain"
                      />
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={!!changeTypeFor}
        onOpenChange={(open) => {
          if (!open) setChangeTypeFor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.review.changeTypeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {t("takeoff.review.symbolType")}
            </Label>
            <Select
              value={changeTypeValue}
              onValueChange={(value) => {
                if (value) setChangeTypeValue(value);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYMBOL_TYPE_OPTIONS.map((opt) => {
                  const key =
                    opt === "led_strip"
                      ? "takeoff.type.ledStrip"
                      : opt === "distribution_board"
                        ? "takeoff.type.distributionBoard"
                        : opt === "unknown"
                          ? "takeoff.type.unknown"
                          : `takeoff.type.${opt}`;
                  return (
                    <SelectItem key={opt} value={opt}>
                      {t(key)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setChangeTypeFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy || !changeTypeFor}
              onClick={() => {
                if (!changeTypeFor) return;
                void onChangeType(changeTypeFor.id, changeTypeValue).then(() =>
                  setChangeTypeFor(null)
                );
              }}
            >
              {t("takeoff.review.applyType")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
