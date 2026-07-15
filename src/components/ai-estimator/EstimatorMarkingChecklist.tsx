"use client";

/**
 * Marking checklist for the "Pozície v PDF" view.
 *
 * Workflow: pick a position → drag a rectangle around its symbol in the plan
 * → the highlighted shape appears in the list. Clicking a list row or an
 * individual mark lights up that symbol on the drawing. Category (zásuvka /
 * svetlo / vypínač) can be set per position.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Circle,
  Crosshair,
  Eye,
  Hash,
  Loader2,
  MapPin,
  Pencil,
  SkipForward,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { EstimatorPosition } from "@/types/estimatorPositions";
import {
  isManualMarkAnchor,
  isPositionMarked,
  manualMarkCount,
  manualMarksOf,
  overlayColorKeyForCategory,
  positionMarkTarget,
  type MarkingProgress,
} from "@/lib/ai/estimatorPositions";

const CATEGORY_OPTIONS = [
  { id: "socket", color: "#39FF14" },
  { id: "double_socket", color: "#22C55E" },
  { id: "switch", color: "#FF1744" },
  { id: "lighting", color: "#FF00AA" },
  { id: "led_strip", color: "#00F0FF" },
] as const;

const LAYER_CHIP: Record<string, string> = {
  socket: "#39FF14",
  double_socket: "#22C55E",
  switch: "#FF1744",
  lighting: "#FF00AA",
  led_strip: "#00F0FF",
  led: "#00F0FF",
  cabling: "#4D7CFF",
  unknown: "#E040FB",
  warning: "#FFEA00",
};

type Props = {
  positions: EstimatorPosition[];
  progress: MarkingProgress;
  selectedPositionId: string | null;
  selectedAnchorId?: string | null;
  highlightedPositionIds?: string[];
  onToggleHighlight?: (positionId: string) => void;
  onSelect: (positionId: string | null) => void;
  onSelectAnchor?: (anchorId: string | null) => void;
  markMode: boolean;
  onMarkModeChange: (on: boolean) => void;
  onNextUnmarked: () => void;
  onRemoveLastMark: (positionId: string) => void;
  onRemoveMark?: (positionId: string, anchorId: string) => void;
  /** Soft-remove position from the checklist (ignore). */
  onDeletePosition?: (positionId: string) => void;
  onRename: (positionId: string, label: string) => void;
  onUseMarkCount: (positionId: string) => void;
  onSetCategory?: (positionId: string, category: string) => void;
  onIdentify?: (positionId: string) => void;
  identifyingPositionId?: string | null;
  /** Clear selection and arm mark mode for the next NEW symbol type. */
  onMarkAnother?: () => void;
};

export function EstimatorMarkingChecklist({
  positions,
  progress,
  selectedPositionId,
  selectedAnchorId,
  highlightedPositionIds = [],
  onToggleHighlight,
  onSelect,
  onSelectAnchor,
  markMode,
  onMarkModeChange,
  onNextUnmarked,
  onRemoveLastMark,
  onRemoveMark,
  onDeletePosition,
  onRename,
  onUseMarkCount,
  onSetCategory,
  onIdentify,
  identifyingPositionId,
  onMarkAnother,
}: Props) {
  const { t } = useI18n();
  const [editDraft, setEditDraft] = useState<string | null>(null);

  const active = useMemo(
    () =>
      positions.filter(
        (p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded"
      ),
    [positions]
  );
  const selected = active.find((p) => p.id === selectedPositionId) ?? null;
  const allDone = progress.total > 0 && progress.unmarked === 0;
  const pct = progress.total > 0 ? Math.round((progress.marked / progress.total) * 100) : 0;

  useEffect(() => {
    setEditDraft(null);
  }, [selectedPositionId]);

  const commitRename = (p: EstimatorPosition) => {
    if (editDraft != null && editDraft.trim() && editDraft.trim() !== p.label) {
      onRename(p.id, editDraft.trim());
    }
    setEditDraft(null);
  };

  const totalPieces = useMemo(
    () =>
      active.reduce(
        (s, p) => s + (p.unit === "ks" || p.unit === "unknown" ? p.quantity : 0),
        0
      ),
    [active]
  );

  const categoryLabel = (cat: string) =>
    t(`projects.aiSetup.marking.category.${cat}` as "projects.aiSetup.marking.category.socket");

  const chipColor = (p: EstimatorPosition) =>
    LAYER_CHIP[overlayColorKeyForCategory(p.category)] ?? "#64748B";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Progress header */}
      <div className="rounded-xl border-2 border-[#1D376A]/25 bg-[#F6F8FB] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-[#0F2A4D]">
            {t("projects.aiSetup.marking.title")}
          </p>
          <span className="text-sm font-bold tabular-nums text-[#1D376A]">
            {progress.marked} / {progress.total}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-[#E2E8F0]"
          role="progressbar"
          aria-valuenow={progress.marked}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              allDone ? "bg-emerald-500" : "bg-[#E95F2A]"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {progress.unmarked > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
            {t("projects.aiSetup.marking.unmarkedCount", {
              count: String(progress.unmarked),
            })}
          </p>
        ) : null}

        {allDone ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800">
            {t("projects.aiSetup.marking.allDone")}
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-[#64748B]">
            {markMode
              ? selected
                ? t("projects.aiSetup.marking.hintMarkSelected", {
                    code: selected.positionCode,
                  })
                : t("projects.aiSetup.marking.hintPickFirst")
              : t("projects.aiSetup.marking.hintEnable")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className={cn(
              "h-8 font-semibold",
              markMode
                ? "bg-[#E95F2A] text-white hover:bg-[#D94F1F]"
                : "bg-[#1D376A] text-white hover:bg-[#162952]"
            )}
            onClick={() => onMarkModeChange(!markMode)}
            aria-pressed={markMode}
          >
            <MapPin className="size-3.5 mr-1" />
            {markMode
              ? t("projects.aiSetup.marking.modeOn")
              : t("projects.aiSetup.marking.modeOff")}
          </Button>
          {progress.unmarked > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#CBD5E1]"
              onClick={onNextUnmarked}
            >
              <SkipForward className="size-3.5 mr-1" />
              {t("projects.aiSetup.marking.nextUnmarked")}
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800">
                {progress.unmarked}
              </span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Checklist */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white">
        {active.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[#64748B]">
            {t("projects.aiSetup.marking.empty")}
          </p>
        ) : (
          active.map((p) => {
            const marked = isPositionMarked(p);
            const marks = manualMarkCount(p);
            const markAnchors = manualMarksOf(p);
            const target = positionMarkTarget(p);
            const isSelected = p.id === selectedPositionId;
            const isHighlighted = highlightedPositionIds.includes(p.id);
            const identifying = identifyingPositionId === p.id;
            const color = chipColor(p);

            return (
              <div
                key={p.id}
                className={cn(
                  "border-b border-[#F1F5F9]",
                  isSelected && "bg-[#FFF8F5]",
                  isHighlighted && !isSelected && "bg-[#EEF2FF]"
                )}
              >
                <div className="flex items-stretch gap-0.5 px-1">
                  {onToggleHighlight ? (
                    <button
                      type="button"
                      className={cn(
                        "my-1 shrink-0 self-center rounded-md p-1.5",
                        isHighlighted
                          ? "bg-[#EEF2FF] text-[#1D376A]"
                          : "text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#1D376A]"
                      )}
                      title={t("projects.aiSetup.marking.toggleHighlight")}
                      aria-pressed={isHighlighted}
                      onClick={() => onToggleHighlight(p.id)}
                    >
                      <Eye className="size-3.5" />
                    </button>
                  ) : null}
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left transition-colors hover:bg-[#F8FAFC]"
                  onClick={(e) => {
                    if ((e.ctrlKey || e.metaKey) && onToggleHighlight) {
                      onToggleHighlight(p.id);
                      return;
                    }
                    const next = isSelected ? null : p.id;
                    onSelect(next);
                    onSelectAnchor?.(null);
                    if (next) onMarkModeChange(true);
                  }}
                  aria-pressed={isSelected}
                >
                  {marked ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <Circle className="size-5 shrink-0 text-[#CBD5E1]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        marked
                          ? "font-medium text-[#64748B]"
                          : "font-semibold text-[#0F2A4D]"
                      )}
                    >
                      <span className="font-mono text-xs">{p.positionCode}</span>{" "}
                      · {p.label}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-[11px] text-[#94A3B8]">
                      <span
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {categoryLabel(p.category)}
                      {p.quantity > 0
                        ? ` · ${p.quantity} ${p.unit === "unknown" ? "ks" : p.unit}`
                        : null}
                    </span>
                  </span>
                  {marks > 0 ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                        marked
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {marks}/{target}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      {t("projects.aiSetup.marking.waiting")}
                    </span>
                  )}
                  {onDeletePosition ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 hover:text-[#B91C1C]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePosition(p.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onDeletePosition(p.id);
                        }
                      }}
                      aria-label={t("projects.aiSetup.marking.deletePosition")}
                      title={t("projects.aiSetup.marking.deletePosition")}
                    >
                      {t("common.delete")}
                    </span>
                  ) : null}
                </button>
                </div>

                {isSelected ? (
                  <div className="space-y-2 px-3 pb-2.5">
                    {/* Category quick-pick */}
                    {onSetCategory ? (
                      <div className="flex flex-wrap gap-1">
                        {CATEGORY_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                              p.category === opt.id
                                ? "text-white"
                                : "border-[#CBD5E1] bg-white text-[#64748B] hover:border-[#94A3B8]"
                            )}
                            style={
                              p.category === opt.id
                                ? { backgroundColor: opt.color, borderColor: opt.color }
                                : undefined
                            }
                            onClick={() => onSetCategory(p.id, opt.id)}
                          >
                            {categoryLabel(opt.id)}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {/* Individual marks — click to highlight on plan */}
                    {markAnchors.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
                          {t("projects.aiSetup.marking.marksInPlan")}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {markAnchors.map((anchor, idx) => {
                            const anchorSelected = selectedAnchorId === anchor.id;
                            return (
                              <button
                                key={anchor.id}
                                type="button"
                                className={cn(
                                  "flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors",
                                  anchorSelected
                                    ? "border-[#E95F2A] bg-[#FFF8F5] text-[#B4441B]"
                                    : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:border-[#CBD5E1]"
                                )}
                                onClick={() =>
                                  onSelectAnchor?.(anchorSelected ? null : anchor.id)
                                }
                              >
                                <span
                                  className="inline-block size-3 rounded-sm border-2"
                                  style={{ borderColor: color, backgroundColor: `${color}33` }}
                                />
                                {t("projects.aiSetup.marking.markN", {
                                  n: String(idx + 1),
                                })}
                                {onRemoveMark ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="ml-0.5 text-[#94A3B8] hover:text-[#DC2626]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRemoveMark(p.id, anchor.id);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.stopPropagation();
                                        onRemoveMark(p.id, anchor.id);
                                      }
                                    }}
                                    aria-label={t("projects.aiSetup.marking.deleteMark")}
                                  >
                                    ×
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center gap-1.5">
                      <Pencil className="size-3.5 shrink-0 text-[#94A3B8]" />
                      <Input
                        value={editDraft ?? p.label}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onBlur={() => commitRename(p)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename(p);
                            (e.target as HTMLInputElement).blur();
                          }
                          if (e.key === "Escape") setEditDraft(null);
                        }}
                        className="h-8 text-sm"
                        aria-label={t("projects.aiSetup.marking.renameLabel")}
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {onMarkAnother ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 bg-[#E95F2A] px-2.5 text-xs text-white hover:bg-[#D45424]"
                          title={t("projects.aiSetup.marking.markNextTypeHint")}
                          onClick={() => onMarkAnother()}
                        >
                          <Crosshair className="mr-1 size-3.5" />
                          {t("projects.aiSetup.marking.markNextType")}
                        </Button>
                      ) : null}
                      {marks > 0 && marks !== p.quantity ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-[#CBD5E1] px-2 text-xs"
                          onClick={() => onUseMarkCount(p.id)}
                        >
                          <Hash className="size-3.5 mr-1" />
                          {t("projects.aiSetup.marking.useMarkCount", {
                            count: String(marks),
                          })}
                        </Button>
                      ) : null}
                      {onIdentify && marks > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-[#CBD5E1] px-2 text-xs"
                          disabled={identifying}
                          onClick={() => onIdentify(p.id)}
                        >
                          {identifying ? (
                            <Loader2 className="size-3.5 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5 mr-1" />
                          )}
                          {t("projects.aiSetup.marking.identifyAi")}
                        </Button>
                      ) : null}
                      {marks > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-[#64748B]"
                          onClick={() => onRemoveLastMark(p.id)}
                        >
                          <Undo2 className="size-3.5 mr-1" />
                          {t("projects.aiSetup.marking.undoLast")}
                        </Button>
                      ) : null}
                      {onDeletePosition ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 border-amber-200 bg-amber-50 px-2 text-xs text-amber-900 hover:bg-amber-100 hover:text-[#B91C1C]"
                          onClick={() => onDeletePosition(p.id)}
                        >
                          <Trash2 className="size-3.5 mr-1" />
                          {t("projects.aiSetup.marking.deletePosition")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs">
        <span className="font-semibold text-[#0F2A4D]">
          {t("projects.aiSetup.marking.resultSummary", {
            articles: String(active.length),
          })}
        </span>
        <span className="font-bold tabular-nums text-[#1D376A]">
          {t("projects.aiSetup.marking.resultPieces", {
            pieces: String(totalPieces),
          })}
        </span>
      </div>
    </div>
  );
}
