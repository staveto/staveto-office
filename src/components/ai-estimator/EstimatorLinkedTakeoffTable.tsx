"use client";

/**
 * Evidence-linked takeoff table.
 *
 * Every row is an EstimatorPosition (E-ZAS-001, …) that can answer: where it
 * came from (evidence anchors), how it was counted (quantitySource), whether
 * it is confirmed and what price it has. Selecting a row highlights the
 * matching PDF annotation; the caller keeps selection state in sync.
 */

import { useMemo, useState } from "react";
import { Check, CircleOff, EuroIcon, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  filterEstimatorPositions,
  primarySourceDocumentLabel,
  sortEstimatorPositions,
  POSITION_EXCLUDE_REASONS,
  type PositionQuickFilter,
  type PositionSortKey,
} from "@/lib/ai/estimatorPositions";
import { openConflicts } from "@/lib/ai/mergeEstimatorPositionsFromDocuments";
import type {
  EstimatorDocument,
  EstimatorPosition,
  EstimatorQuantityConflict,
} from "@/types/estimatorPositions";

const QUICK_FILTERS: { id: PositionQuickFilter | "all"; labelKey: string }[] = [
  { id: "all", labelKey: "projects.aiSetup.positions.filter.all" },
  { id: "price_missing", labelKey: "projects.aiSetup.positions.filter.priceMissing" },
  { id: "needs_review", labelKey: "projects.aiSetup.positions.filter.needsReview" },
  { id: "no_pdf_position", labelKey: "projects.aiSetup.positions.filter.noPdf" },
  { id: "drawing_only", labelKey: "projects.aiSetup.positions.filter.drawingOnly" },
  { id: "schedule_only", labelKey: "projects.aiSetup.positions.filter.scheduleOnly" },
  { id: "legend_only", labelKey: "projects.aiSetup.positions.filter.legendOnly" },
  { id: "conflicts", labelKey: "projects.aiSetup.positions.filter.conflicts" },
  { id: "manual_only", labelKey: "projects.aiSetup.positions.filter.manualOnly" },
];

const SORT_KEYS: { id: PositionSortKey; labelKey: string }[] = [
  { id: "positionCode", labelKey: "projects.aiSetup.positions.sort.positionCode" },
  { id: "roomName", labelKey: "projects.aiSetup.positions.sort.roomName" },
  { id: "label", labelKey: "projects.aiSetup.positions.sort.label2" },
  { id: "quantity", labelKey: "projects.aiSetup.positions.sort.quantity" },
  { id: "totalPrice", labelKey: "projects.aiSetup.positions.sort.totalPrice" },
  { id: "reviewStatus", labelKey: "projects.aiSetup.positions.sort.reviewStatus" },
];

function categoryLabelKey(category: string): string {
  const map: Record<string, string> = {
    socket: "projects.aiSetup.material.group.socket",
    switch: "projects.aiSetup.material.group.switch",
    lighting: "projects.aiSetup.material.group.lighting",
    led_strip: "projects.aiSetup.material.group.lighting",
    cable: "projects.aiSetup.material.group.cable",
    installation_material: "projects.aiSetup.material.group.install",
    labor: "projects.aiSetup.material.group.labor",
  };
  return map[category] ?? "projects.aiSetup.material.group.other";
}

function hasBbox(p: EstimatorPosition): boolean {
  return p.evidenceAnchors.some((a) => a.bbox != null);
}

type Props = {
  positions: EstimatorPosition[];
  currency?: string;
  selectedPositionId?: string | null;
  onSelectPosition?: (positionId: string | null) => void;
  onConfirm?: (position: EstimatorPosition) => void;
  onIgnore?: (position: EstimatorPosition, reason: string) => void;
  onExclude?: (position: EstimatorPosition, reason: string) => void;
  onAddPrice?: (position: EstimatorPosition) => void;
  /** Preselected quick filter, e.g. "price_missing" for the Ceny tab. */
  initialQuickFilter?: PositionQuickFilter | "all";
  /** Hide filter toolbar (compact embedding next to the PDF). */
  compact?: boolean;
  multiDocEnabled?: boolean;
  documents?: EstimatorDocument[];
  activeDocumentId?: string | null;
  conflicts?: EstimatorQuantityConflict[];
  /**
   * Only show positions backed by a plan mark (bbox).
   * AI estimates without PDF evidence are not accepted as price lines.
   * Default true. Set false for "Bez pozície v PDF" debugging.
   */
  requirePlanMark?: boolean;
};

export function EstimatorLinkedTakeoffTable({
  positions,
  currency = "EUR",
  selectedPositionId,
  onSelectPosition,
  onConfirm,
  onIgnore,
  onExclude,
  onAddPrice,
  initialQuickFilter = "all",
  compact = false,
  multiDocEnabled = false,
  documents = [],
  activeDocumentId = null,
  conflicts = [],
  requirePlanMark = true,
}: Props) {
  const { t } = useI18n();
  const [quick, setQuick] = useState<PositionQuickFilter | "all">(initialQuickFilter);
  const [documentScope, setDocumentScope] = useState<"all" | "current">("all");
  const [room, setRoom] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<PositionSortKey>("positionCode");
  const [reasonFor, setReasonFor] = useState<{ id: string; action: "ignore" | "exclude" } | null>(
    null
  );

  const rooms = useMemo(
    () =>
      [...new Set(positions.map((p) => p.roomName?.trim()).filter(Boolean))].sort() as string[],
    [positions]
  );
  const categories = useMemo(
    () => [...new Set(positions.map((p) => p.category))].sort(),
    [positions]
  );

  const openConflictIds = useMemo(
    () => new Set(openConflicts(conflicts).map((c) => c.positionId)),
    [conflicts]
  );

  const activeDocument = useMemo(
    () => documents.find((d) => d.id === activeDocumentId) ?? null,
    [documents, activeDocumentId]
  );

  const visibleFilters = useMemo(() => {
    if (!multiDocEnabled || documents.length <= 1) {
      return QUICK_FILTERS.filter((f) => f.id !== "conflicts" || openConflictIds.size > 0);
    }
    return QUICK_FILTERS;
  }, [multiDocEnabled, documents.length, openConflictIds.size]);

  const rows = useMemo(() => {
    const filtered = filterEstimatorPositions(positions, {
      quick: quick === "all" ? undefined : quick,
      roomName: room === "all" ? undefined : room,
      category: category === "all" ? undefined : category,
      search: search || undefined,
      requirePlanMark: requirePlanMark && quick !== "no_pdf_position",
      documentId:
        multiDocEnabled && documentScope === "current" && activeDocument
          ? activeDocument.id
          : undefined,
      documentFileName: activeDocument?.fileName,
      documentFileId: activeDocument?.fileId,
      conflictPositionIds: quick === "conflicts" ? openConflictIds : undefined,
    });
    return sortEstimatorPositions(filtered, sortKey);
  }, [
    positions,
    quick,
    room,
    category,
    search,
    requirePlanMark,
    sortKey,
    multiDocEnabled,
    documentScope,
    activeDocument,
    openConflictIds,
  ]);

  const submitReason = (position: EstimatorPosition, reason: string) => {
    if (!reasonFor) return;
    if (reasonFor.action === "ignore") onIgnore?.(position, reason);
    else onExclude?.(position, reason);
    setReasonFor(null);
  };

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("projects.aiSetup.positions.sort.label")}>
            {visibleFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                  quick === f.id
                    ? "border-[#E95F2A] bg-[#FFF8F5] text-[#E95F2A]"
                    : "border-[#CBD5E1] bg-white text-[#475569] hover:border-[#94A3B8]"
                )}
                aria-pressed={quick === f.id}
                onClick={() => setQuick(f.id)}
              >
                {t(f.labelKey)}
                {f.id === "conflicts" && openConflictIds.size > 0
                  ? ` (${openConflictIds.size})`
                  : ""}
              </button>
            ))}
          </div>
          {multiDocEnabled && documents.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold",
                  documentScope === "all"
                    ? "border-[#1D376A] bg-[#1D376A] text-white"
                    : "border-[#CBD5E1] bg-white text-[#475569]"
                )}
                onClick={() => setDocumentScope("all")}
              >
                {t("projects.aiSetup.positions.filter.allDocuments")}
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold",
                  documentScope === "current"
                    ? "border-[#1D376A] bg-[#1D376A] text-white"
                    : "border-[#CBD5E1] bg-white text-[#475569]"
                )}
                onClick={() => setDocumentScope("current")}
              >
                {t("projects.aiSetup.positions.filter.currentDocument")}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("projects.aiSetup.positions.searchPlaceholder")}
              className="h-9 w-full sm:w-56 text-sm"
              aria-label={t("projects.aiSetup.positions.searchPlaceholder")}
            />
            <Select value={room} onValueChange={(v) => setRoom(v ?? "all")}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("projects.aiSetup.positions.filter.roomAll")}</SelectItem>
                {rooms.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
              <SelectTrigger className="h-9 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("projects.aiSetup.positions.filter.categoryAll")}
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(categoryLabelKey(c))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as PositionSortKey)}>
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_KEYS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {t("projects.aiSetup.positions.sort.label")}: {t(s.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#64748B]">
          {positions.length === 0
            ? t("projects.aiSetup.positions.empty")
            : t("projects.aiSetup.positions.emptyFiltered")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#CBD5E1]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
                <th className="px-3 py-2">{t("projects.aiSetup.positions.col.name")}</th>
                <th className="px-3 py-2">{t("projects.aiSetup.positions.col.position")}</th>
                {multiDocEnabled && documents.length > 1 ? (
                  <th className="px-3 py-2">{t("projects.aiSetup.positions.col.sourceDocument")}</th>
                ) : null}
                <th className="px-3 py-2">{t("projects.aiSetup.positions.col.room")}</th>
                <th className="px-3 py-2 text-right">{t("projects.aiSetup.positions.col.qty")}</th>
                <th className="px-3 py-2">{t("projects.aiSetup.positions.col.source")}</th>
                <th className="px-3 py-2 text-right">{t("projects.aiSetup.positions.col.price")}</th>
                <th className="px-3 py-2">{t("projects.aiSetup.positions.col.status")}</th>
                {!compact ? (
                  <th className="px-3 py-2">{t("projects.aiSetup.positions.col.action")}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const selected = p.id === selectedPositionId;
                const inactive = p.reviewStatus === "ignored" || p.reviewStatus === "excluded";
                const linked = hasBbox(p);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-[#F1F5F9] last:border-b-0 cursor-pointer transition-colors",
                      selected ? "bg-[#FFF3EC]" : "hover:bg-[#F8FAFC]",
                      inactive && "opacity-50"
                    )}
                    onClick={() => onSelectPosition?.(selected ? null : p.id)}
                    aria-selected={selected}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-[#0F2A4D] leading-snug">{p.label}</p>
                      <p className="text-[11px] text-[#94A3B8]">{t(categoryLabelKey(p.category))}</p>
                      {!linked ? (
                        <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
                          {t("projects.aiSetup.positions.noPdfMarker")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-[#64748B]">
                        {p.positionCode}
                      </span>
                      {linked ? (
                        <MapPin
                          className="ml-1 inline size-3.5 text-[#1D376A]"
                          aria-label={t("projects.aiSetup.positions.metric.pdfLinked")}
                        />
                      ) : null}
                    </td>
                    {multiDocEnabled && documents.length > 1 ? (
                      <td className="px-3 py-2 text-xs text-[#475569] max-w-[140px] truncate" title={primarySourceDocumentLabel(p, documents)}>
                        {primarySourceDocumentLabel(p, documents)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-xs text-[#475569] whitespace-nowrap">
                      {p.roomName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {p.quantity > 0 ? (
                        <>
                          {p.quantity} <span className="text-xs text-[#64748B]">{p.unit !== "unknown" ? p.unit : ""}</span>
                        </>
                      ) : (
                        <span className="text-xs text-amber-700">
                          {t("projects.aiSetup.material.qtyMissing")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11px] font-semibold text-[#334155] whitespace-nowrap">
                        {t(`projects.aiSetup.positions.qtySource.${p.quantitySource}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {p.unitPrice != null && p.unitPrice > 0 ? (
                        <div>
                          <p className="tabular-nums font-semibold text-[#0F2A4D]">
                            {formatMoney(p.unitPrice, p.currency ?? currency)}
                          </p>
                          <p className="text-[11px] text-[#94A3B8]">
                            {t(`projects.aiSetup.positions.price.${p.priceStatus}`)}
                          </p>
                        </div>
                      ) : p.priceStatus === "customer_supplied" ? (
                        <span className="text-[11px] font-semibold text-[#475569]">
                          {t("projects.aiSetup.positions.price.customer_supplied")}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-700">
                          {t("projects.aiSetup.positions.price.price_missing")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                          p.reviewStatus === "confirmed"
                            ? "bg-emerald-50 text-emerald-700"
                            : p.reviewStatus === "needs_review"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-[#F1F5F9] text-[#64748B]"
                        )}
                      >
                        {t(`projects.aiSetup.positions.review.${p.reviewStatus}`)}
                      </span>
                    </td>
                    {!compact ? (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {reasonFor?.id === p.id ? (
                          <div className="flex items-center gap-1">
                            <Select
                              onValueChange={(reason) => {
                                if (typeof reason === "string" && reason) submitReason(p, reason);
                              }}
                            >
                              <SelectTrigger className="h-8 w-[150px] text-xs">
                                <SelectValue
                                  placeholder={t("projects.aiSetup.positions.reason.title")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {POSITION_EXCLUDE_REASONS.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {t(`projects.aiSetup.positions.reason.${r}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setReasonFor(null)}
                              aria-label={t("common.cancel")}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {p.reviewStatus === "needs_review" && onConfirm ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-emerald-300 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
                                onClick={() => onConfirm(p)}
                              >
                                <Check className="size-3.5 mr-1" />
                                {t("projects.aiSetup.positions.action.confirm")}
                              </Button>
                            ) : null}
                            {p.priceStatus === "price_missing" && onAddPrice && !inactive ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 border-[#E95F2A]/50 px-2 text-xs text-[#E95F2A] hover:bg-[#FFF8F5]"
                                onClick={() => onAddPrice(p)}
                              >
                                <EuroIcon className="size-3.5 mr-1" />
                                {t("projects.aiSetup.positions.action.addPrice")}
                              </Button>
                            ) : null}
                            {!inactive && (onIgnore || onExclude) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs text-[#64748B]"
                                onClick={() =>
                                  setReasonFor({ id: p.id, action: onExclude ? "exclude" : "ignore" })
                                }
                              >
                                <CircleOff className="size-3.5 mr-1" />
                                {t("projects.aiSetup.positions.action.exclude")}
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
