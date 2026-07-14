"use client";

/**
 * Right panel of the Plan Takeoff Workbench:
 * counts summary, status filter + search, grouped occurrence list,
 * selected-item detail with edit + actions, candidate bulk actions.
 */

import { useMemo, useState } from "react";
import {
  Check,
  X,
  Trash2,
  Copy,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type {
  DrawingOccurrence,
  OccurrenceStatus,
  TakeoffTrade,
} from "@/types/drawingTakeoff";
import {
  filterOccurrences,
  groupByTrade,
  countByStatus,
  aggregateByType,
  occurrenceColor,
} from "@/lib/takeoff/drawingTakeoff";
import { TradeTypeSelector } from "./TradeTypeSelector";

const STATUS_OPTIONS: Array<OccurrenceStatus | "all"> = [
  "all",
  "draft",
  "needs_review",
  "confirmed",
  "rejected",
  "used_in_quote",
];

type Props = {
  occurrences: DrawingOccurrence[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<DrawingOccurrence, "label" | "trade" | "type" | "status" | "note">>
  ) => void;
  onDelete: (id: string) => void;
  onFindSimilar: (occurrence: DrawingOccurrence) => void;
  findSimilarBusy: boolean;
  onBulkCandidates: (action: "confirm" | "reject") => void;
};

export function TakeoffRightPanel({
  occurrences,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onFindSimilar,
  findSimilarBusy,
  onBulkCandidates,
}: Props) {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<OccurrenceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [collapsedTrades, setCollapsedTrades] = useState<Set<TakeoffTrade>>(new Set());

  const counts = useMemo(() => countByStatus(occurrences), [occurrences]);
  const typeRows = useMemo(() => aggregateByType(occurrences), [occurrences]);
  const filtered = useMemo(
    () => filterOccurrences(occurrences, { status: statusFilter, search }),
    [occurrences, statusFilter, search]
  );
  const grouped = useMemo(() => groupByTrade(filtered), [filtered]);
  const selected = occurrences.find((o) => o.id === selectedId) ?? null;
  const candidateCount = occurrences.filter(
    (o) => o.status === "needs_review" && o.source === "similar_symbol_detected"
  ).length;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Counts summary */}
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ["total", counts.total, "text-foreground"],
            ["needs_review", counts.needs_review + counts.draft, "text-amber-500"],
            ["confirmed", counts.confirmed, "text-green-500"],
            ["used_in_quote", counts.used_in_quote, "text-green-600 dark:text-green-400"],
          ] as Array<[string, number, string]>
        ).map(([key, value, colorClass]) => (
          <div
            key={key}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-center"
          >
            <p className={cn("text-lg font-bold tabular-nums", colorClass)}>{value}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(`takeoff.count.${key}`)}
            </p>
          </div>
        ))}
      </div>

      {/* Candidate bulk actions */}
      {candidateCount > 0 ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-xs font-medium text-foreground">
            {t("takeoff.candidates.pending", { count: candidateCount })}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 bg-green-600 text-white hover:bg-green-700"
              onClick={() => onBulkCandidates("confirm")}
            >
              <Check className="size-3.5 mr-1" />
              {t("takeoff.candidates.confirmAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => onBulkCandidates("reject")}
            >
              <X className="size-3.5 mr-1" />
              {t("takeoff.candidates.rejectAll")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Filter + search */}
      <div className="flex gap-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v as OccurrenceStatus | "all") ?? "all")}
        >
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? t("takeoff.filter.allStatuses") : t(`takeoff.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("takeoff.filter.searchPlaceholder")}
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Type count summary */}
      {typeRows.length > 0 ? (
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("takeoff.summary.byType")}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {typeRows.map((row) => (
              <span key={`${row.trade}|${row.type}`} className="text-xs text-foreground">
                <span className="font-semibold">{row.total}×</span> {row.label}
                {row.needsReview > 0 ? (
                  <span className="text-amber-500"> ({row.needsReview}?)</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Grouped list */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {occurrences.length === 0
              ? t("takeoff.list.emptyHint")
              : t("takeoff.list.noMatch")}
          </p>
        ) : (
          grouped.map(({ trade, occurrences: items }) => {
            const collapsed = collapsedTrades.has(trade);
            return (
              <div key={trade}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  onClick={() =>
                    setCollapsedTrades((prev) => {
                      const next = new Set(prev);
                      if (next.has(trade)) next.delete(trade);
                      else next.add(trade);
                      return next;
                    })
                  }
                >
                  {collapsed ? (
                    <ChevronRight className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                  {t(`takeoff.trade.${trade}`)}
                  <span className="ml-auto tabular-nums text-muted-foreground/80">
                    {items.length}
                  </span>
                </button>
                {!collapsed
                  ? items.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/40",
                          o.id === selectedId && "bg-primary/10"
                        )}
                        onClick={() => onSelect(o.id === selectedId ? null : o.id)}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: occurrenceColor(o) }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {o.label}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {t(`takeoff.source.${o.source}`)} · str. {o.pageNumber}
                            {typeof o.confidence === "number"
                              ? ` · ${Math.round(o.confidence * 100)}%`
                              : ""}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            o.status === "confirmed" &&
                              "bg-green-500/15 text-green-700 dark:text-green-400",
                            o.status === "used_in_quote" &&
                              "bg-green-900 text-green-50 dark:bg-green-800",
                            (o.status === "needs_review" || o.status === "draft") &&
                              "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                            o.status === "rejected" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {t(`takeoff.status.${o.status}`)}
                        </span>
                      </button>
                    ))
                  : null}
              </div>
            );
          })
        )}
      </div>

      {/* Selected detail */}
      {selected ? (
        <OccurrenceDetail
          key={selected.id}
          occurrence={selected}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onFindSimilar={onFindSimilar}
          findSimilarBusy={findSimilarBusy}
        />
      ) : null}
    </div>
  );
}

function OccurrenceDetail({
  occurrence,
  onUpdate,
  onDelete,
  onFindSimilar,
  findSimilarBusy,
}: {
  occurrence: DrawingOccurrence;
  onUpdate: Props["onUpdate"];
  onDelete: Props["onDelete"];
  onFindSimilar: Props["onFindSimilar"];
  findSimilarBusy: boolean;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(occurrence.label);
  const [note, setNote] = useState(occurrence.note ?? "");

  const commitLabel = () => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== occurrence.label) onUpdate(occurrence.id, { label: trimmed });
  };
  const commitNote = () => {
    if (note.trim() !== (occurrence.note ?? "")) {
      onUpdate(occurrence.id, { note: note.trim() });
    }
  };

  return (
    <div className="shrink-0 space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("takeoff.detail.title")}
        </p>
        <span className="text-[11px] text-muted-foreground">
          {t(`takeoff.source.${occurrence.source}`)} · {t(`takeoff.status.${occurrence.status}`)}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("takeoff.field.label")}</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          className="h-9 text-sm"
        />
      </div>

      <TradeTypeSelector
        trade={occurrence.trade}
        typeId={occurrence.type}
        onTradeChange={(trade) => onUpdate(occurrence.id, { trade })}
        onTypeChange={(typeId, defaultLabel) => {
          onUpdate(occurrence.id, { type: typeId, label: defaultLabel });
          setLabel(defaultLabel);
        }}
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("takeoff.field.note")}</Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          placeholder={t("takeoff.field.notePlaceholder")}
          className="h-9 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {occurrence.status !== "confirmed" && occurrence.status !== "used_in_quote" ? (
          <Button
            type="button"
            size="sm"
            className="h-8 bg-green-600 text-white hover:bg-green-700"
            onClick={() => onUpdate(occurrence.id, { status: "confirmed" })}
          >
            <Check className="size-3.5 mr-1" />
            {t("takeoff.action.confirm")}
          </Button>
        ) : null}
        {occurrence.status !== "rejected" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => onUpdate(occurrence.id, { status: "rejected" })}
          >
            <X className="size-3.5 mr-1" />
            {t("takeoff.action.reject")}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => onUpdate(occurrence.id, { status: "draft" })}
          >
            {t("takeoff.action.restore")}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={findSimilarBusy}
          onClick={() => onFindSimilar(occurrence)}
        >
          <Copy className="size-3.5 mr-1" />
          {findSimilarBusy ? t("takeoff.action.findSimilarBusy") : t("takeoff.action.findSimilar")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(occurrence.id)}
        >
          <Trash2 className="size-3.5 mr-1" />
          {t("takeoff.action.delete")}
        </Button>
      </div>
    </div>
  );
}
