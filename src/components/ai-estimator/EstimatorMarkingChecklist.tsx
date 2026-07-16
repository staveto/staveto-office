"use client";

/**
 * Marking checklist for the "Pozície v PDF" view.
 * Groups by status → category → room; quick filters; detail list collapsed.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Circle,
  Crosshair,
  Eye,
  Hash,
  Loader2,
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
  isPositionMarked,
  manualMarkCount,
  manualMarksOf,
  positionMarkTarget,
  similarCandidateAnchors,
  type MarkingProgress,
} from "@/lib/ai/estimatorPositions";

const CATEGORY_OPTIONS = [
  { id: "socket", color: "#1D376A" },
  { id: "double_socket", color: "#1D376A" },
  { id: "switch", color: "#1D376A" },
  { id: "lighting", color: "#1D376A" },
  { id: "led_strip", color: "#1D376A" },
] as const;

type QuickFilter =
  | "all"
  | "current_room"
  | "unassigned"
  | "socket"
  | "switch"
  | "lighting"
  | "led_strip"
  | "candidates"
  | "needs_review";

type StatusBucket = "needs_review" | "candidates" | "confirmed";

type Props = {
  positions: EstimatorPosition[];
  progress: MarkingProgress;
  selectedPositionId: string | null;
  selectedAnchorId?: string | null;
  highlightedPositionIds?: string[];
  bulkKeys?: Set<string>;
  onToggleBulkKey?: (positionId: string, anchorId: string) => void;
  onSelectAllCandidates?: () => void;
  onConfirmAllCandidates?: () => void;
  onDismissAllCandidates?: () => void;
  onToggleHighlight?: (positionId: string) => void;
  onSelect: (positionId: string | null) => void;
  onSelectAnchor?: (anchorId: string | null) => void;
  markMode: boolean;
  onMarkModeChange: (on: boolean) => void;
  onNextUnmarked: () => void;
  onRemoveLastMark: (positionId: string) => void;
  onRemoveMark?: (positionId: string, anchorId: string) => void;
  onDeletePosition?: (positionId: string) => void;
  onRename: (positionId: string, label: string) => void;
  onUseMarkCount: (positionId: string) => void;
  onSetCategory?: (positionId: string, category: string) => void;
  onIdentify?: (positionId: string) => void;
  identifyingPositionId?: string | null;
  onMarkAnother?: () => void;
  /** Hide progress + mark-mode header (sticky bar owns those actions). */
  hideHeaderControls?: boolean;
};

function statusBucket(p: EstimatorPosition): StatusBucket {
  if (similarCandidateAnchors(p).length > 0) return "candidates";
  if (p.reviewStatus === "needs_review") return "needs_review";
  return "confirmed";
}

function categoryGroupKey(cat: string): string {
  if (cat === "double_socket") return "socket";
  if (cat === "led_strip" || cat === "led") return "led_strip";
  if (cat === "lighting") return "lighting";
  if (cat === "switch") return "switch";
  if (cat === "socket") return "socket";
  return "unknown";
}

export function EstimatorMarkingChecklist({
  positions,
  progress,
  selectedPositionId,
  selectedAnchorId,
  highlightedPositionIds = [],
  bulkKeys = new Set(),
  onToggleBulkKey,
  onSelectAllCandidates,
  onConfirmAllCandidates,
  onDismissAllCandidates,
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
  hideHeaderControls = false,
}: Props) {
  const { t } = useI18n();
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showDetailList, setShowDetailList] = useState(false);
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(
    () => new Set(["socket", "switch", "lighting", "led_strip", "unknown"])
  );

  const active = useMemo(
    () =>
      positions.filter(
        (p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded"
      ),
    [positions]
  );
  const selected = active.find((p) => p.id === selectedPositionId) ?? null;
  const currentRoom = selected?.roomName?.trim() || null;
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

  const categoryLabel = (cat: string) =>
    t(`projects.aiSetup.marking.category.${cat}` as "projects.aiSetup.marking.category.socket");

  const filtered = useMemo(() => {
    return active.filter((p) => {
      switch (quick) {
        case "current_room":
          if (!currentRoom) return !p.roomName?.trim();
          return (p.roomName?.trim() || "") === currentRoom;
        case "unassigned":
          return !p.roomName?.trim();
        case "socket":
          return categoryGroupKey(p.category) === "socket";
        case "switch":
          return categoryGroupKey(p.category) === "switch";
        case "lighting":
          return categoryGroupKey(p.category) === "lighting";
        case "led_strip":
          return categoryGroupKey(p.category) === "led_strip";
        case "candidates":
          return similarCandidateAnchors(p).length > 0;
        case "needs_review":
          return p.reviewStatus === "needs_review" || similarCandidateAnchors(p).length > 0;
        default:
          return true;
      }
    });
  }, [active, quick, currentRoom]);

  const statusGroups = useMemo(() => {
    const order: StatusBucket[] = ["needs_review", "candidates", "confirmed"];
    const labels: Record<StatusBucket, string> = {
      needs_review: t("projects.aiSetup.marking.filter.needsReview"),
      candidates: t("projects.aiSetup.marking.filter.candidates"),
      confirmed: t("projects.aiSetup.marking.statusConfirmed"),
    };
    return order
      .map((status) => {
        const items = filtered.filter((p) => statusBucket(p) === status);
        const byCat = new Map<string, EstimatorPosition[]>();
        for (const p of items) {
          const key = categoryGroupKey(p.category);
          const list = byCat.get(key) ?? [];
          list.push(p);
          byCat.set(key, list);
        }
        const catOrder = ["socket", "switch", "lighting", "led_strip", "unknown"];
        const categories = [
          ...catOrder.filter((k) => byCat.has(k)),
          ...[...byCat.keys()].filter((k) => !catOrder.includes(k)),
        ].map((key) => {
          const catItems = byCat.get(key)!;
          const byRoom = new Map<string, EstimatorPosition[]>();
          for (const p of catItems) {
            const room = p.roomName?.trim() || t("projects.aiSetup.marking.roomUnassigned");
            const list = byRoom.get(room) ?? [];
            list.push(p);
            byRoom.set(room, list);
          }
          const confirmed = catItems.filter((p) => statusBucket(p) === "confirmed").length;
          const candidates = catItems.filter((p) => similarCandidateAnchors(p).length > 0).length;
          const missingPrice = catItems.filter((p) => p.priceStatus === "price_missing").length;
          return {
            key,
            items: catItems,
            rooms: [...byRoom.entries()],
            confirmed,
            candidates,
            missingPrice,
          };
        });
        return { status, label: labels[status], count: items.length, categories };
      })
      .filter((g) => g.count > 0);
  }, [filtered, t]);

  const filters: { id: QuickFilter; label: string }[] = [
    { id: "all", label: t("projects.aiSetup.marking.filter.all") },
    { id: "current_room", label: t("projects.aiSetup.marking.filter.currentRoom") },
    { id: "unassigned", label: t("projects.aiSetup.marking.filter.unassigned") },
    { id: "socket", label: t("projects.aiSetup.marking.category.socket") },
    { id: "switch", label: t("projects.aiSetup.marking.category.switch") },
    { id: "lighting", label: t("projects.aiSetup.marking.category.lighting") },
    { id: "led_strip", label: t("projects.aiSetup.marking.category.led_strip") },
    { id: "candidates", label: t("projects.aiSetup.marking.filter.candidates") },
    { id: "needs_review", label: t("projects.aiSetup.marking.filter.needsReview") },
  ];

  const totalPieces = useMemo(
    () =>
      active.reduce(
        (s, p) => s + (p.unit === "ks" || p.unit === "unknown" ? p.quantity : 0),
        0
      ),
    [active]
  );

  const toggleCat = (key: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {hideHeaderControls ? null : (
      <div className="rounded-xl border-2 border-[#1D376A]/25 bg-[#F6F8FB] p-3 space-y-2 shrink-0">
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className={cn(
              "h-8 font-semibold",
              markMode
                ? "bg-[#E95F2A] text-white hover:bg-[#D94F1F] ring-2 ring-[#E95F2A]/40"
                : "bg-[#1D376A] text-white hover:bg-[#162952]"
            )}
            onClick={() => onMarkModeChange(!markMode)}
            aria-pressed={markMode}
          >
            <Crosshair className="size-3.5 mr-1" />
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
            </Button>
          ) : null}
        </div>
      </div>
      )}

      {selected && !hideHeaderControls ? (
        <div className="shrink-0 rounded-xl border-2 border-[#E95F2A]/35 bg-[#FFF8F5] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#E95F2A]">
            {t("projects.aiSetup.positions.selectedDetail")}
          </p>
          <p className="truncate text-sm font-semibold text-[#0F2A4D]">{selected.label}</p>
          <p className="font-mono text-[11px] text-[#64748B]">{selected.positionCode}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 shrink-0">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              quick === f.id
                ? "border-[#E95F2A] bg-[#FFF8F5] text-[#E95F2A]"
                : "border-[#CBD5E1] bg-white text-[#64748B]"
            )}
            onClick={() => setQuick(f.id)}
            aria-pressed={quick === f.id}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[#64748B]">
            {t("projects.aiSetup.marking.empty")}
          </p>
        ) : (
          statusGroups.map((sg) => (
            <div key={sg.status}>
              <div className="sticky top-0 z-[2] flex flex-wrap items-center justify-between gap-1 border-b border-[#E2E8F0] bg-[#F1F5F9] px-3 py-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#334155]">
                  {sg.label} · {sg.count}
                </p>
                {sg.status === "candidates" ? (
                  <div className="flex flex-wrap gap-1">
                    {onSelectAllCandidates ? (
                      <button
                        type="button"
                        className="rounded border border-[#CBD5E1] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]"
                        onClick={onSelectAllCandidates}
                      >
                        {t("projects.aiSetup.marking.selectAllCandidates")}
                      </button>
                    ) : null}
                    {onConfirmAllCandidates ? (
                      <button
                        type="button"
                        className="rounded border border-[#1D376A] bg-[#1D376A] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        onClick={onConfirmAllCandidates}
                      >
                        {t("projects.aiSetup.marking.candidates.confirmAll", {
                          count: sg.count,
                        })}
                      </button>
                    ) : null}
                    {onDismissAllCandidates ? (
                      <button
                        type="button"
                        className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                        onClick={onDismissAllCandidates}
                      >
                        {t("projects.aiSetup.marking.candidates.dismiss")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {sg.categories.map((cat) => {
                const collapsed = collapsedCats.has(cat.key);
                return (
                  <div key={`${sg.status}_${cat.key}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 border-b border-[#F1F5F9] bg-[#F8FAFC] px-3 py-1.5 text-left text-xs font-semibold text-[#0F2A4D] hover:bg-[#EEF2F7]"
                      onClick={() => toggleCat(cat.key)}
                      aria-expanded={!collapsed}
                    >
                      <span>
                        {collapsed ? "▸ " : "▾ "}
                        {categoryLabel(cat.key)}
                      </span>
                      <span className="text-[10px] font-medium text-[#64748B]">
                        ✓{cat.confirmed} · ?{cat.candidates} · €{cat.missingPrice}
                      </span>
                    </button>
                    {!collapsed
                      ? cat.rooms.map(([room, roomItems]) => (
                          <div key={`${sg.status}_${cat.key}_${room}`}>
                            <p className="px-3 py-1 text-[10px] font-semibold text-[#94A3B8]">
                              {room}
                            </p>
                            {roomItems.map((p) => {
                              const marked = isPositionMarked(p);
                              const marks = manualMarkCount(p);
                              const markAnchors = manualMarksOf(p);
                              const target = positionMarkTarget(p);
                              const isSelected = p.id === selectedPositionId;
                              const isHighlighted = highlightedPositionIds.includes(p.id);
                              const identifying = identifyingPositionId === p.id;
                              const candCount = similarCandidateAnchors(p).length;

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
                                            : "text-[#94A3B8] hover:bg-[#F1F5F9]"
                                        )}
                                        onClick={() => onToggleHighlight(p.id)}
                                        aria-pressed={isHighlighted}
                                      >
                                        <Eye className="size-3.5" />
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left hover:bg-[#F8FAFC]"
                                      onClick={() => {
                                        const next = isSelected ? null : p.id;
                                        onSelect(next);
                                        onSelectAnchor?.(null);
                                      }}
                                      aria-pressed={isSelected}
                                    >
                                      {onToggleBulkKey ? (
                                        <input
                                          type="checkbox"
                                          className="size-3.5 accent-[#E95F2A]"
                                          checked={[
                                            ...markAnchors,
                                            ...similarCandidateAnchors(p),
                                          ].some((a) => bulkKeys.has(`${p.id}::${a.id}`))}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={() => {
                                            const anchors = [
                                              ...markAnchors,
                                              ...similarCandidateAnchors(p),
                                            ];
                                            if (anchors.length === 0) return;
                                            const allOn = anchors.every((a) =>
                                              bulkKeys.has(`${p.id}::${a.id}`)
                                            );
                                            for (const a of anchors) {
                                              const has = bulkKeys.has(`${p.id}::${a.id}`);
                                              if (allOn ? has : !has) {
                                                onToggleBulkKey(p.id, a.id);
                                              }
                                            }
                                          }}
                                          aria-label={t("projects.aiSetup.marking.selectItem")}
                                        />
                                      ) : null}
                                      {marked ? (
                                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                                          <Check className="size-3.5" strokeWidth={3} />
                                        </span>
                                      ) : (
                                        <Circle className="size-5 shrink-0 text-[#CBD5E1]" />
                                      )}
                                      <span className="min-w-0 flex-1">
                                        {renamingId === p.id ? (
                                          <Input
                                            autoFocus
                                            value={editDraft ?? p.label}
                                            onChange={(e) => setEditDraft(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            onBlur={() => {
                                              commitRename(p);
                                              setRenamingId(null);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                commitRename(p);
                                                setRenamingId(null);
                                              }
                                              if (e.key === "Escape") {
                                                e.preventDefault();
                                                setEditDraft(null);
                                                setRenamingId(null);
                                              }
                                            }}
                                            className="h-7 text-sm"
                                            aria-label={t("projects.aiSetup.marking.renameLabel")}
                                          />
                                        ) : (
                                          <span
                                            role="button"
                                            tabIndex={0}
                                            className="block truncate text-sm font-semibold text-[#0F2A4D] hover:underline"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onSelect(p.id);
                                              setRenamingId(p.id);
                                              setEditDraft(p.label);
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.stopPropagation();
                                                setRenamingId(p.id);
                                                setEditDraft(p.label);
                                              }
                                            }}
                                          >
                                            {p.label}
                                          </span>
                                        )}
                                        <span className="truncate text-[11px] text-[#94A3B8]">
                                          <span className="font-mono">{p.positionCode}</span>
                                          {p.quantity > 0
                                            ? ` · ${p.quantity} ${p.unit === "unknown" ? "ks" : p.unit}`
                                            : null}
                                          {candCount > 0 ? ` · ?${candCount}` : null}
                                        </span>
                                      </span>
                                      {marks > 0 ? (
                                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                          {marks}/{target}
                                        </span>
                                      ) : null}
                                    </button>
                                  </div>

                                  {isSelected ? (
                                    <div className="space-y-2 px-3 pb-2.5">
                                      {onSetCategory ? (
                                        <div className="flex flex-wrap gap-1">
                                          {CATEGORY_OPTIONS.map((opt) => (
                                            <button
                                              key={opt.id}
                                              type="button"
                                              className={cn(
                                                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                                p.category === opt.id
                                                  ? "border-[#1D376A] bg-[#1D376A] text-white"
                                                  : "border-[#CBD5E1] bg-white text-[#64748B]"
                                              )}
                                              onClick={() => onSetCategory(p.id, opt.id)}
                                            >
                                              {categoryLabel(opt.id)}
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      <div className="flex items-center gap-1.5">
                                        <Pencil className="size-3.5 shrink-0 text-[#94A3B8]" />
                                        <Input
                                          value={editDraft ?? p.label}
                                          onChange={(e) => setEditDraft(e.target.value)}
                                          onFocus={() => {
                                            setRenamingId(p.id);
                                            setEditDraft(p.label);
                                          }}
                                          onBlur={() => {
                                            commitRename(p);
                                            setRenamingId(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              commitRename(p);
                                              setRenamingId(null);
                                              (e.target as HTMLInputElement).blur();
                                            }
                                            if (e.key === "Escape") {
                                              setEditDraft(null);
                                              setRenamingId(null);
                                            }
                                          }}
                                          className="h-8 text-sm"
                                          aria-label={t("projects.aiSetup.marking.renameLabel")}
                                        />
                                      </div>
                                      {markAnchors.length > 0 ? (
                                        <div className="space-y-1">
                                          <button
                                            type="button"
                                            className="text-[10px] font-bold uppercase tracking-wide text-[#64748B]"
                                            onClick={() => setShowDetailList((v) => !v)}
                                            aria-expanded={showDetailList}
                                          >
                                            {t("projects.aiSetup.marking.detailList")}
                                            {showDetailList ? " ▾" : " ▸"}
                                          </button>
                                          {showDetailList ? (
                                            <div className="flex flex-wrap gap-1">
                                              {markAnchors.map((anchor, idx) => {
                                                const anchorSelected =
                                                  selectedAnchorId === anchor.id;
                                                return (
                                                  <button
                                                    key={anchor.id}
                                                    type="button"
                                                    className={cn(
                                                      "rounded-md border px-2 py-1 text-xs font-semibold",
                                                      anchorSelected
                                                        ? "border-[#E95F2A] bg-[#FFF8F5] text-[#B4441B]"
                                                        : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]"
                                                    )}
                                                    onClick={() =>
                                                      onSelectAnchor?.(
                                                        anchorSelected ? null : anchor.id
                                                      )
                                                    }
                                                  >
                                                    {t("projects.aiSetup.marking.markN", {
                                                      n: String(idx + 1),
                                                    })}
                                                    {onRemoveMark ? (
                                                      <span
                                                        role="button"
                                                        tabIndex={0}
                                                        className="ml-1 text-[#94A3B8] hover:text-[#DC2626]"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          onRemoveMark(p.id, anchor.id);
                                                        }}
                                                      >
                                                        ×
                                                      </span>
                                                    ) : null}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                      <div className="flex flex-wrap gap-1.5">
                                        {onMarkAnother ? (
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="h-8 bg-[#E95F2A] px-2.5 text-xs text-white hover:bg-[#D45424]"
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
                                            className="h-7 px-2 text-xs"
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
                                            className="h-7 px-2 text-xs"
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
                                            className="h-7 px-2 text-xs"
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
                                            className="h-7 border-amber-200 px-2 text-xs text-amber-900"
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
                            })}
                          </div>
                        ))
                      : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs">
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
