"use client";

/**
 * "Výkaz a ceny" step — evidence-linked takeoff workspace.
 *
 * Top card gives instant metrics + primary access to the detailed takeoff.
 * Sub-tabs: Súhrn | Detailný výkaz | Ceny | Pozície v PDF | Na kontrolu.
 * The detailed takeoff is a first-class tab, not hidden under the summary.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Euro,
  FileSearch,
  Maximize2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import type { MaterialUnit } from "@/services/materials/types";
import { EstimatorDocumentConflictsPanel } from "@/components/ai-estimator/EstimatorDocumentConflictsPanel";
import { EstimatorDocumentSwitcher } from "@/components/ai-estimator/EstimatorDocumentSwitcher";
import { EstimatorLinkedTakeoffTable } from "@/components/ai-estimator/EstimatorLinkedTakeoffTable";
import { EstimatorPdfEvidenceViewer } from "@/components/ai-estimator/EstimatorPdfEvidenceViewer";
import { EstimatorMarkingChecklist } from "@/components/ai-estimator/EstimatorMarkingChecklist";
import {
  EstimatorPriceDrawer,
} from "@/components/ai-estimator/EstimatorPriceDrawer";
import {
  isManualMarkAnchor,
  nextUnmarkedPositionId,
  similarCandidateAnchors,
} from "@/lib/ai/estimatorPositions";
import {
  buildSymbolDraftFromMark,
  type SymbolDraftCategory,
  type SymbolDraftScope,
} from "@/lib/ai/unclassifiedSymbolDraft";
import { captureMarkCrop } from "@/lib/ai/markCropCapture";
import { findSimilarSymbols } from "@/services/takeoff/similarSymbolDetectionService";
import { identifyDrawingSymbol } from "@/services/ai/identifySymbolService";
import type {
  EstimatorPosition,
  EstimatorPositionUnit,
  UnclassifiedSymbolDraft,
} from "@/types/estimatorPositions";
import {
  AI_SETUP_MATERIAL_UNITS,
  inferMaterialGroup,
  materialGroupLabelKey,
  newLocalId,
  normalizeSetupUnit,
  setupUnitLabel,
} from "./aiSetupHelpers";
import type { AiSetupMaterialRow } from "./aiSetupTypes";
import { AiSetupProjectFactsPanel } from "./AiSetupProjectFactsPanel";
import type { AiProjectFactsPersisted } from "./aiSetupTypes";
import type { EstimatorPositionsApi } from "./useEstimatorPositions";

export type MaterialSubTab = "summary" | "detail" | "prices" | "pdf" | "review";

type Props = {
  materials: AiSetupMaterialRow[];
  onMaterialsChange: (rows: AiSetupMaterialRow[]) => void;
  onContinue: () => void;
  saving?: boolean;
  loadingMaterials?: boolean;
  projectFacts?: AiProjectFactsPersisted;
  onProjectFactsChange?: (facts: AiProjectFactsPersisted) => void;
  onApplyFactsToMaterials?: () => void;
  applyingFacts?: boolean;
  /** Evidence-linked positions (interactive PDF review). Optional — flag-gated. */
  evidence?: EstimatorPositionsApi;
  currency?: string;
  subTab: MaterialSubTab;
  onSubTabChange: (tab: MaterialSubTab) => void;
};

const GROUP_ORDER = ["socket", "switch", "lighting", "cable", "install", "labor", "other"];

type SummaryRow = {
  group: string;
  title: string;
  qty: number;
  unit: string;
  priceMissing: boolean;
  needsQty: boolean;
};

function buildSummary(rows: AiSetupMaterialRow[]): { group: string; items: SummaryRow[] }[] {
  const byGroup = new Map<string, Map<string, SummaryRow>>();
  for (const m of rows.filter((r) => r.included && r.name.trim())) {
    const group = m.group || inferMaterialGroup(m.name);
    const key = `${m.name.trim().toLowerCase()}|${normalizeSetupUnit(m.unit)}`;
    const groupMap = byGroup.get(group) ?? new Map<string, SummaryRow>();
    const existing = groupMap.get(key);
    if (existing) {
      existing.qty += m.qty > 0 ? m.qty : 0;
      existing.priceMissing = existing.priceMissing || !(m.price > 0);
      existing.needsQty = existing.needsQty || m.qty <= 0;
    } else {
      groupMap.set(key, {
        group,
        title: m.name.trim(),
        qty: m.qty > 0 ? m.qty : 0,
        unit: normalizeSetupUnit(m.unit),
        priceMissing: !(m.price > 0),
        needsQty: m.qty <= 0,
      });
    }
    byGroup.set(group, groupMap);
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((group) => ({
    group,
    items: [...(byGroup.get(group)?.values() ?? [])],
  }));
}

export function AiSetupMaterialStep({
  materials,
  onMaterialsChange,
  onContinue,
  saving,
  loadingMaterials,
  projectFacts,
  onProjectFactsChange,
  onApplyFactsToMaterials,
  applyingFacts,
  evidence,
  currency = "EUR",
  subTab,
  onSubTabChange,
}: Props) {
  const { t } = useI18n();
  const [showEditRows, setShowEditRows] = useState(false);
  const [pricePosition, setPricePosition] = useState<EstimatorPosition | null>(null);
  // PDF-first by default: "Rozpoznať značku" — click the plan, then classify.
  const [markMode, setMarkMode] = useState(true);
  const [pdfFullscreen, setPdfFullscreen] = useState(false);

  const update = (id: string, patch: Partial<AiSetupMaterialRow>) => {
    onMaterialsChange(
      materials.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        if (patch.name != null) next.group = inferMaterialGroup(patch.name);
        return next;
      })
    );
  };

  const summary = useMemo(() => buildSummary(materials), [materials]);
  const includedMaterials = materials.filter((m) => m.included && m.name.trim());
  const missingPricesFromMaterials = includedMaterials.filter((m) => !(m.price > 0)).length;
  // When PDF evidence is active, Ceny counts only plan-backed (accepted) positions.
  const missingPrices =
    evidence?.summary != null ? evidence.summary.priceMissing : missingPricesFromMaterials;
  const materialsMetric =
    evidence?.summary != null ? evidence.summary.withBbox : includedMaterials.length;

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    rows: materials.filter((m) => (m.group || inferMaterialGroup(m.name)) === group),
  })).filter((g) => g.rows.length > 0);

  const positionsSummary = evidence?.summary;
  const reviewPositions = useMemo(
    () => (evidence?.positions ?? []).filter((p) => p.reviewStatus === "needs_review"),
    [evidence?.positions]
  );
  const hasPdfTab = Boolean(evidence);

  const TABS: { id: MaterialSubTab; labelKey: string; badge?: number }[] = [
    { id: "summary", labelKey: "projects.aiSetup.positions.tab.summary" },
    { id: "detail", labelKey: "projects.aiSetup.positions.tab.detail" },
    { id: "prices", labelKey: "projects.aiSetup.positions.tab.prices", badge: missingPrices },
    ...(hasPdfTab
      ? [{ id: "pdf" as const, labelKey: "projects.aiSetup.positions.tab.pdf" }]
      : []),
    {
      id: "review",
      labelKey: "projects.aiSetup.positions.tab.review",
      badge: reviewPositions.length,
    },
  ];

  const openPriceDrawer = (position: EstimatorPosition) => setPricePosition(position);

  const editableRowsBlock = (
    <div className="space-y-6">
      {grouped.map(({ group, rows }) => (
        <section key={group} className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[#1D376A]">
            {t(materialGroupLabelKey(group))}
            <span className="ml-2 font-semibold text-[#94A3B8] normal-case tracking-normal">
              ({rows.length})
            </span>
          </h4>
          <ul className="space-y-3">
            {rows.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "rounded-xl border-2 bg-white p-4 transition-colors",
                  m.included ? "border-[#CBD5E1]" : "border-[#E2E8F0] opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-2 mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={m.included}
                      onChange={(e) => update(m.id, { included: e.target.checked })}
                      className="size-5 accent-[#E95F2A]"
                      aria-label={t("projects.aiSetup.col.include")}
                    />
                    <input
                      type="checkbox"
                      checked={m.customerVisible !== false}
                      onChange={(e) => update(m.id, { customerVisible: e.target.checked })}
                      className="size-5 accent-[#1D376A]"
                      aria-label={t("quotes.print.customerVisible")}
                      title={t("quotes.print.customerVisible")}
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <Input
                      value={m.name}
                      onChange={(e) => update(m.id, { name: e.target.value })}
                      className="h-11 text-base font-semibold border-[#CBD5E1]"
                      placeholder={t("projects.aiSetup.material.namePlaceholder")}
                    />
                    {m.sourceNote?.trim() ? (
                      <p className="text-xs text-[#64748B] leading-relaxed border-l-2 border-[#1D376A]/30 pl-2">
                        {m.sourceNote}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-3 items-end">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-[#64748B]">
                          {t("projects.aiSetup.col.qty")}
                          {m.qty <= 0 ? (
                            <span className="ml-1 font-normal text-amber-700">
                              ({t("projects.aiSetup.material.qtyMissing")})
                            </span>
                          ) : null}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={m.qty > 0 ? m.qty : ""}
                          placeholder={t("projects.aiSetup.material.qtyPlaceholder")}
                          onChange={(e) => {
                            const raw = e.target.value;
                            update(m.id, {
                              qty: raw === "" ? 0 : Number(raw) || 0,
                            });
                          }}
                          className={cn(
                            "h-10 w-24 tabular-nums",
                            m.qty <= 0 && "border-amber-400 bg-amber-50"
                          )}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-[#64748B]">
                          {t("projects.aiSetup.col.unit")}
                        </span>
                        <Select
                          value={normalizeSetupUnit(m.unit)}
                          onValueChange={(v) => update(m.id, { unit: v as MaterialUnit })}
                        >
                          <SelectTrigger className="h-10 w-[88px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AI_SETUP_MATERIAL_UNITS.map((u) => (
                              <SelectItem key={u} value={u}>
                                {setupUnitLabel(u, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="space-y-1 flex-1 min-w-[120px]">
                        <span className="text-xs font-semibold text-[#64748B]">
                          {t("projects.aiSetup.material.priceOptional")}
                          {!(m.price > 0) ? (
                            <span className="ml-1 font-normal text-amber-700">
                              ({t("projects.aiSetup.material.priceMissingShort")})
                            </span>
                          ) : null}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={m.price || ""}
                          onChange={(e) => update(m.id, { price: Number(e.target.value) || 0 })}
                          placeholder="0"
                          className={cn(
                            "h-10 tabular-nums",
                            !(m.price > 0) && "border-amber-400 bg-amber-50"
                          )}
                        />
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="p-2 text-[#64748B] hover:text-destructive rounded-lg hover:bg-red-50 shrink-0"
                    onClick={() => onMaterialsChange(materials.filter((x) => x.id !== m.id))}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-[#CBD5E1]"
        onClick={() =>
          onMaterialsChange([
            ...materials,
            {
              id: newLocalId(),
              name: "",
              qty: 1,
              unit: "pcs",
              price: 0,
              included: true,
              customerVisible: true,
              group: "other",
            },
          ])
        }
      >
        <Plus className="size-4 mr-1" />
        {t("projects.aiSetup.material.add")}
      </Button>
    </div>
  );

  const takeoffTableProps = evidence
    ? {
        positions: evidence.positions,
        currency,
        selectedPositionId: evidence.selectedPositionId,
        onSelectPosition: evidence.setSelectedPositionId,
        onConfirm: evidence.confirm,
        onIgnore: evidence.ignore,
        onExclude: evidence.exclude,
        onAddPrice: openPriceDrawer,
        multiDocEnabled: evidence.multiDocEnabled,
        documents: evidence.documents,
        activeDocumentId: evidence.activeDocumentId,
        conflicts: evidence.conflicts,
      }
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#0F2A4D]">{t("projects.aiSetup.material.title")}</h3>
        <p className="mt-1 text-sm text-[#475569] leading-relaxed">
          {t("projects.aiSetup.material.lead")}
        </p>
      </div>

      {loadingMaterials ? (
        <div
          className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#64748B]"
          role="status"
        >
          {t("projects.aiSetup.material.loadingFromAi")}
        </div>
      ) : null}

      {/* Top summary card — the takeoff must be discoverable without scrolling. */}
      <div className="rounded-2xl border-2 border-[#1D376A]/30 bg-[#F6F8FB] p-4 sm:p-5 space-y-4">
        <div>
          <h4 className="text-base font-bold text-[#0F2A4D]">
            {t("projects.aiSetup.positions.readyTitle")}
          </h4>
          <p className="mt-0.5 text-xs text-[#64748B] leading-relaxed">
            {t("projects.aiSetup.positions.readyLead")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Metric
            value={positionsSummary?.total ?? includedMaterials.length}
            label={t("projects.aiSetup.positions.metric.total")}
          />
          <Metric
            value={materialsMetric}
            label={t("projects.aiSetup.positions.metric.materials")}
          />
          <Metric
            value={missingPrices}
            label={t("projects.aiSetup.positions.metric.priceMissing")}
            tone={missingPrices > 0 ? "warning" : "default"}
          />
          <Metric
            value={positionsSummary?.needsReview ?? 0}
            label={t("projects.aiSetup.positions.metric.needsReview")}
            tone={(positionsSummary?.needsReview ?? 0) > 0 ? "warning" : "default"}
          />
          {positionsSummary && positionsSummary.withBbox > 0 ? (
            <Metric
              value={positionsSummary.annotations}
              label={t("projects.aiSetup.positions.metric.pdfLinked")}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="bg-[#E95F2A] hover:bg-[#D94F1F] h-10 px-4 font-semibold"
            onClick={() => onSubTabChange("detail")}
          >
            <ClipboardList className="size-4 mr-1.5" />
            {t("projects.aiSetup.positions.action.openDetail")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 border-[#CBD5E1] px-4"
            onClick={() => onSubTabChange("prices")}
          >
            <Euro className="size-4 mr-1.5" />
            {t("projects.aiSetup.positions.action.fillPrices")}
            {missingPrices > 0 ? (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-800">
                {missingPrices}
              </span>
            ) : null}
          </Button>
          {hasPdfTab ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 border-[#CBD5E1] px-4"
              onClick={() => onSubTabChange("pdf")}
            >
              <FileSearch className="size-4 mr-1.5" />
              {t("projects.aiSetup.positions.action.showPdf")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Sub-tabs — sticky so navigation survives scrolling. */}
      <nav
        className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1.5 bg-white/95 px-1 py-2 backdrop-blur-sm"
        aria-label={t("projects.aiSetup.material.title")}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "rounded-full border-2 px-3 py-1.5 text-xs sm:text-sm font-bold transition-colors",
              subTab === tab.id
                ? "border-[#E95F2A] bg-[#FFF8F5] text-[#E95F2A]"
                : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:border-[#CBD5E1]"
            )}
            aria-pressed={subTab === tab.id}
            onClick={() => onSubTabChange(tab.id)}
          >
            {t(tab.labelKey)}
            {tab.badge ? (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {/* ------------------------------ Súhrn ------------------------------ */}
      {subTab === "summary" ? (
        <div className="space-y-4">
          <AiSetupProjectFactsPanel
            projectFacts={projectFacts}
            onProjectFactsChange={(facts) => onProjectFactsChange?.(facts)}
            onApplyToMaterials={() => onApplyFactsToMaterials?.()}
            applying={applyingFacts}
          />

          {missingPrices > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">{t("projects.aiSetup.material.priceMissingTitle")}</p>
              <p className="text-xs mt-1 leading-relaxed">
                {t("projects.aiSetup.material.priceMissingHint").replace(
                  "{{count}}",
                  String(missingPrices)
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-8 border-amber-400 text-amber-900 hover:bg-amber-100"
                onClick={() => onSubTabChange("prices")}
              >
                {t("projects.aiSetup.positions.action.fillPrices")}
              </Button>
            </div>
          ) : null}

          {materials.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-10 text-center">
              <p className="text-sm text-[#64748B]">{t("projects.aiSetup.material.empty")}</p>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-[#CBD5E1] bg-white p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-[#0F2A4D]">
                  {t("projects.aiSetup.material.summaryTitle")}
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#CBD5E1]"
                  onClick={() => onSubTabChange("detail")}
                >
                  {t("projects.aiSetup.positions.action.openDetail")}
                </Button>
              </div>
              <div className="space-y-4">
                {summary.map(({ group, items }) => (
                  <section key={group}>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#1D376A] mb-2">
                      {t(materialGroupLabelKey(group))}
                    </p>
                    <ul className="space-y-1.5">
                      {items.map((item) => (
                        <li
                          key={`${item.title}-${item.unit}`}
                          className="flex flex-wrap justify-between gap-2 text-sm text-[#334155]"
                        >
                          <span className="font-medium text-[#0F2A4D]">{item.title}</span>
                          <span className="tabular-nums text-[#64748B]">
                            {item.needsQty
                              ? t("projects.aiSetup.material.qtyMissing")
                              : `${item.qty} ${setupUnitLabel(item.unit, t)}`}
                            {item.priceMissing ? (
                              <span className="ml-2 text-amber-700">
                                · {t("projects.aiSetup.material.priceMissingShort")}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* -------------------------- Detailný výkaz ------------------------- */}
      {subTab === "detail" ? (
        <div className="space-y-4">
          {evidence?.multiDocEnabled && evidence.conflicts.length > 0 ? (
            <EstimatorDocumentConflictsPanel
              conflicts={evidence.conflicts}
              onResolve={evidence.resolveConflict}
              onSaveNote={evidence.saveConflictNote}
            />
          ) : null}
          <div>
            <h4 className="text-sm font-bold text-[#0F2A4D]">
              {t("projects.aiSetup.material.detailTitle")}
            </h4>
            <p className="mt-0.5 text-xs text-[#64748B] leading-relaxed">
              {t("projects.aiSetup.positions.detailSubtitle")}
            </p>
          </div>
          {takeoffTableProps ? (
            <EstimatorLinkedTakeoffTable {...takeoffTableProps} />
          ) : null}
          <div className="border-t border-[#E2E8F0] pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#CBD5E1]"
              onClick={() => setShowEditRows((v) => !v)}
              aria-expanded={showEditRows}
            >
              {t("projects.aiSetup.positions.editRows")}
            </Button>
            {showEditRows || !takeoffTableProps ? (
              <div className="mt-4">{editableRowsBlock}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ------------------------------- Ceny ------------------------------ */}
      {subTab === "prices" ? (
        <div className="space-y-4">
          {missingPrices === 0 && (evidence?.summary.priceMissing ?? 0) === 0 ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {t("projects.aiSetup.positions.pricesAllDone")}
            </p>
          ) : (
            <p className="text-sm text-[#475569] leading-relaxed">
              {t("projects.aiSetup.positions.pricesLead")}
            </p>
          )}
          {takeoffTableProps ? (
            <EstimatorLinkedTakeoffTable
              {...takeoffTableProps}
              initialQuickFilter="price_missing"
            />
          ) : (
            editableRowsBlock
          )}
        </div>
      ) : null}

      {/* --------------------------- Pozície v PDF ------------------------- */}
      {subTab === "pdf" && evidence ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-[#CBD5E1]"
              onClick={() => setPdfFullscreen(true)}
            >
              <Maximize2 className="size-4 mr-1.5" />
              {t("projects.aiSetup.marking.fullscreen")}
            </Button>
          </div>
          {!pdfFullscreen ? (
            <PdfMarkingWorkspace
              evidence={evidence}
              markMode={markMode}
              onMarkModeChange={setMarkMode}
              onAddPrice={openPriceDrawer}
              viewerHeightClassName="h-[560px]"
              checklistMaxHeightClassName="max-h-[640px]"
            />
          ) : null}
        </div>
      ) : null}

      {/* Fullscreen marking dialog */}
      {evidence ? (
        <Dialog open={pdfFullscreen} onOpenChange={setPdfFullscreen}>
          <DialogContent
            className="fixed inset-2 top-2 left-2 h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden p-3 sm:max-w-none"
          >
            <DialogTitle className="mb-2 pr-10 text-base font-bold text-[#0F2A4D]">
              {t("projects.aiSetup.marking.title")}
              {evidence.fileName ? (
                <span className="ml-2 text-xs font-normal text-[#64748B]">
                  {evidence.fileName}
                </span>
              ) : null}
            </DialogTitle>
            <div className="h-[calc(100vh-4.5rem)] overflow-hidden">
              <PdfMarkingWorkspace
                evidence={evidence}
                markMode={markMode}
                onMarkModeChange={setMarkMode}
                onAddPrice={openPriceDrawer}
                viewerHeightClassName="h-[calc(100vh-10.5rem)]"
                checklistMaxHeightClassName="max-h-[calc(100vh-6rem)]"
                fullscreen
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* ---------------------------- Na kontrolu -------------------------- */}
      {subTab === "review" ? (
        <div className="space-y-4">
          {evidence && evidence.quoteSafety.blocked ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                {t("projects.aiSetup.positions.blockedTitle")}
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-amber-900">
                {evidence.quoteSafety.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {takeoffTableProps ? (
            reviewPositions.length === 0 ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {t("projects.aiSetup.positions.reviewEmpty")}
              </p>
            ) : (
              <EstimatorLinkedTakeoffTable
                {...takeoffTableProps}
                initialQuickFilter="needs_review"
              />
            )
          ) : (
            editableRowsBlock
          )}
        </div>
      ) : null}

      {evidence ? (
        <EstimatorPriceDrawer
          position={pricePosition}
          currency={currency}
          onClose={() => setPricePosition(null)}
          onApplyManualPrice={evidence.applyManualPrice}
          onApplyCatalogPrice={evidence.applyCatalogPrice}
          onMarkCustomerSupplied={evidence.customerSupplied}
        />
      ) : null}

      <Button
        type="button"
        className="w-full sm:w-auto bg-[#E95F2A] hover:bg-[#D94F1F] h-11 text-base font-semibold px-8"
        disabled={saving || (evidence?.quoteSafety.blocked ?? false)}
        onClick={onContinue}
      >
        {saving ? t("common.loading") : t("projects.aiSetup.cta.toWork")}
      </Button>
    </div>
  );
}

/**
 * Interactive PDF + marking checklist. Rendered inline in the "Pozície v PDF"
 * sub-tab and reused inside the fullscreen dialog (plan left, checklist right).
 */
function PdfMarkingWorkspace({
  evidence,
  markMode,
  onMarkModeChange,
  onAddPrice,
  viewerHeightClassName,
  checklistMaxHeightClassName,
  fullscreen = false,
}: {
  evidence: NonNullable<Props["evidence"]>;
  markMode: boolean;
  onMarkModeChange: (on: boolean) => void;
  onAddPrice: (position: EstimatorPosition) => void;
  viewerHeightClassName: string;
  checklistMaxHeightClassName: string;
  fullscreen?: boolean;
}) {
  const { t } = useI18n();
  const [identifyingId, setIdentifyingId] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{
    positionId: string;
    name: string;
    confidence: "high" | "medium" | "low";
    reason?: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [outsidePlanWarning, setOutsidePlanWarning] = useState(false);
  const [pickFailedWarning, setPickFailedWarning] = useState(false);
  const [markingToolMode, setMarkingToolMode] = useState<"click_symbol" | "draw_box">("click_symbol");
  const [similarBusy, setSimilarBusy] = useState(false);
  const [similarCandidates, setSimilarCandidates] = useState<number | null>(null);
  const [symbolDraft, setSymbolDraft] = useState<UnclassifiedSymbolDraft | null>(null);
  const [createdPositionCode, setCreatedPositionCode] = useState<string | null>(null);
  const [draftAiBusy, setDraftAiBusy] = useState(false);
  const [showAllMarks, setShowAllMarks] = useState(true);
  const [highlightedPositionIds, setHighlightedPositionIds] = useState<string[]>([]);
  const symbolDraftRef = useRef<UnclassifiedSymbolDraft | null>(null);
  symbolDraftRef.current = symbolDraft;

  const selectedPosition = evidence.selectedPositionId
    ? evidence.positions.find((p) => p.id === evidence.selectedPositionId) ?? null
    : null;

  const pendingCandidateCount = selectedPosition
    ? similarCandidateAnchors(selectedPosition).length
    : 0;

  const lastManualMark = selectedPosition
    ? [...selectedPosition.evidenceAnchors].reverse().find((a) => isManualMarkAnchor(a) && a.bbox)
    : undefined;

  /** Find identical marks across the PDF, bump quantity, ready for next symbol type. */
  const finalizeSymbolType = async (position: EstimatorPosition) => {
    const mark = [...position.evidenceAnchors]
      .reverse()
      .find((a) => isManualMarkAnchor(a) && a.bbox);

    setCreatedPositionCode(position.positionCode);
    setSimilarBusy(true);
    setSimilarCandidates(null);
    try {
      if (mark?.bbox && evidence.fileUrl) {
        const referenceBbox = mark.tightSymbolBbox ?? mark.bbox;
        const result = await findSimilarSymbols({
          projectId: evidence.projectId,
          drawingId: evidence.activeDocument?.fileId ?? evidence.fileName ?? "drawing",
          fileUrl: evidence.fileUrl,
          pageNumber: mark.page,
          referenceBbox,
          scanAllPages: true,
          threshold: 0.8,
        });
        if (result.candidates.length > 0) {
          evidence.addAndConfirmSimilarMarks(
            position.id,
            result.candidates.map((c) => ({
              page: c.pageNumber,
              bbox: c.normalizedPosition,
              matchScore: c.matchScore,
            }))
          );
          setSimilarCandidates(result.candidates.length);
        } else {
          setSimilarCandidates(0);
        }
      }
    } finally {
      setSimilarBusy(false);
      // Next click must create a NEW position — never pile marks on this one.
      evidence.setSelectedPositionId(null);
      evidence.setSelectedAnchorId(null);
      onMarkModeChange(true);
    }
  };

  const handleFindSimilar = async () => {
    if (!selectedPosition || !lastManualMark?.bbox || !evidence.fileUrl) return;
    await finalizeSymbolType(selectedPosition);
  };

  const startNextSymbolType = () => {
    evidence.setSelectedPositionId(null);
    evidence.setSelectedAnchorId(null);
    setSymbolDraft(null);
    setCreatedPositionCode(null);
    setSimilarCandidates(null);
    onMarkModeChange(true);
  };

  const handleIdentify = async (positionId: string) => {
    const pos = evidence.positions.find((p) => p.id === positionId);
    const mark = pos
      ? [...pos.evidenceAnchors].reverse().find((a) => isManualMarkAnchor(a) && a.bbox)
      : undefined;
    if (!pos || !mark?.bbox || !evidence.fileUrl) return;
    setIdentifyingId(positionId);
    setAiSuggestion(null);
    setAiError(null);
    try {
      const crop = await captureMarkCrop({
        fileUrl: evidence.fileUrl,
        page: mark.page,
        bbox: mark.bbox,
      });
      const res = await identifyDrawingSymbol({
        imageBase64: crop.base64,
        currentLabel: pos.label,
      });
      setAiSuggestion({
        positionId,
        name: res.name,
        confidence: res.confidence,
        reason: res.reason,
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setIdentifyingId(null);
    }
  };

  return (
    <div
      className={cn(
        "grid gap-4",
        fullscreen
          ? "h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]"
          : "xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]"
      )}
    >
      <div className="min-w-0 space-y-2">
        {evidence.multiDocEnabled && evidence.documents.length > 1 ? (
          <EstimatorDocumentSwitcher
            documents={evidence.documents}
            activeDocumentId={evidence.activeDocumentId}
            onSelectDocument={evidence.setActiveDocumentId}
          />
        ) : null}
        {evidence.selectedPositionId &&
        !evidence.positions
          .find((p) => p.id === evidence.selectedPositionId)
          ?.evidenceAnchors.some((a) => a.bbox) ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("projects.aiSetup.pdf.noPositionInPdf")}
          </p>
        ) : null}
        {markMode ? (
          <p className="rounded-lg border border-[#E95F2A]/40 bg-[#FFF8F5] px-3 py-2 text-xs font-medium text-[#B4441B]">
            {markingToolMode === "click_symbol"
              ? t("projects.aiSetup.marking.clickHint")
              : evidence.selectedPositionId
                ? t("projects.aiSetup.marking.viewerHintSelected")
                : t("projects.aiSetup.marking.viewerHintPick")}
          </p>
        ) : null}
        {pickFailedWarning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            {t("projects.aiSetup.marking.pickFailed")}
          </p>
        ) : null}
        {outsidePlanWarning ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            {t("projects.aiSetup.marking.outsidePlan")}
          </p>
        ) : null}
        {markMode && lastManualMark ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={similarBusy}
              onClick={() => void handleFindSimilar()}
            >
              {similarBusy
                ? t("common.loading")
                : t("projects.aiSetup.marking.findSimilar")}
            </Button>
            {similarCandidates != null && similarCandidates > 0 ? (
              <p className="text-xs text-[#0F2A4D]">
                {t("projects.aiSetup.marking.similarFound", {
                  count: similarCandidates,
                })}
              </p>
            ) : null}
            {pendingCandidateCount > 0 && selectedPosition ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-[#1D376A] text-xs text-white hover:bg-[#162952]"
                  onClick={() => {
                    evidence.confirmSimilarCandidates(selectedPosition.id);
                    setSimilarCandidates(null);
                  }}
                >
                  {t("projects.aiSetup.marking.candidates.confirmAll", {
                    count: pendingCandidateCount,
                  })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => {
                    evidence.dismissSimilarCandidates(selectedPosition.id);
                    setSimilarCandidates(null);
                  }}
                >
                  {t("projects.aiSetup.marking.candidates.dismiss")}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        <EstimatorPdfEvidenceViewer
          fileUrl={evidence.fileUrl}
          fileName={evidence.fileName}
          annotations={evidence.annotations}
          selectedPositionId={evidence.selectedPositionId}
          selectedAnchorId={evidence.selectedAnchorId}
          highlightedPositionIds={highlightedPositionIds}
          showAllMarks={showAllMarks}
          onShowAllMarksChange={setShowAllMarks}
          onAnnotationClick={(positionId) => evidence.setSelectedPositionId(positionId)}
          onAnchorClick={(anchorId) => evidence.setSelectedAnchorId(anchorId)}
          markMode={markMode}
          markingToolMode={markingToolMode}
          onMarkingToolModeChange={setMarkingToolMode}
          categoryHint={selectedPosition?.category}
          normalizedPoint={selectedPosition?.normalizedPoint}
          draftMarker={
            symbolDraft
              ? {
                  page: symbolDraft.page,
                  center: symbolDraft.center,
                  bbox: symbolDraft.bbox,
                  polygon: symbolDraft.polygon,
                }
              : null
          }
          onMarkPlaced={(page, bbox, polygon, meta) => {
            // Always PDF-first: one click = one NEW position.
            // Copies of the same type come from auto find-similar, not extra clicks.
            if (evidence.selectedPositionId) {
              evidence.setSelectedPositionId(null);
              evidence.setSelectedAnchorId(null);
            }
            if (meta?.outsidePlan) {
              setOutsidePlanWarning(true);
              return;
            }
            const draft = buildSymbolDraftFromMark({
              page,
              bbox,
              rawSearchBbox: meta?.rawSelectionBbox,
              polygon: polygon ?? meta?.polygon,
              colorHint: meta?.colorHint,
              confidence: meta?.confidence,
              outsidePlan: meta?.outsidePlan,
            });
            if (!draft) return;
            setSymbolDraft(draft);
            setCreatedPositionCode(null);
            setPickFailedWarning(false);
            setOutsidePlanWarning(false);
            setSimilarCandidates(null);
            setDraftAiBusy(true);
            const draftId = draft.id;
            void (async () => {
              try {
                if (!evidence.fileUrl) return;
                const crop = await captureMarkCrop({
                  fileUrl: evidence.fileUrl,
                  page: draft.page,
                  bbox: draft.bbox,
                });
                const res = await identifyDrawingSymbol({
                  imageBase64: crop.base64,
                  language: "sk",
                });
                if (symbolDraftRef.current?.id !== draftId) return;
                const category = mapIdentifiedCategory(res.category);
                if (res.confidence === "high" || res.confidence === "medium") {
                  const current = symbolDraftRef.current;
                  if (!current) return;
                  const position = evidence.createPositionFromDraft(current, {
                    category,
                    label: res.name,
                  });
                  setSymbolDraft(null);
                  await finalizeSymbolType(position);
                  return;
                }
                setSymbolDraft((current) => {
                  if (!current || current.id !== draftId) return current;
                  return {
                    ...current,
                    possibleTypes: [
                      category,
                      ...current.possibleTypes.filter((t) => t !== category),
                    ],
                    confidence: res.confidence,
                  };
                });
              } catch {
                // Keep draft card — user classifies manually.
              } finally {
                setDraftAiBusy(false);
              }
            })();
          }}
          onPickFailed={() => setPickFailedWarning(true)}
          onOutsidePlanMark={() => setOutsidePlanWarning(true)}
          onMarkDeleted={(positionId, anchorId) => {
            evidence.removeManualMark(positionId, anchorId);
            if (evidence.selectedAnchorId === anchorId) {
              evidence.setSelectedAnchorId(null);
            }
          }}
          heightClassName={viewerHeightClassName}
        />
      </div>
      <div className={cn("flex min-w-0 flex-col gap-3", fullscreen && "h-full min-h-0 overflow-hidden")}>
        {symbolDraft ? (
          <SymbolDraftClassifierCard
            draft={symbolDraft}
            aiBusy={draftAiBusy}
            onCreate={(classification) => {
              const position = evidence.createPositionFromDraft(
                symbolDraft,
                classification
              );
              setSymbolDraft(null);
              void finalizeSymbolType(position);
            }}
            onIgnore={() => setSymbolDraft(null)}
          />
        ) : null}
        {createdPositionCode ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
            {similarBusy
              ? t("projects.aiSetup.marking.draft.createdSearching", {
                  code: createdPositionCode,
                })
              : similarCandidates != null && similarCandidates > 0
                ? t("projects.aiSetup.marking.draft.createdWithCopies", {
                    code: createdPositionCode,
                    count: String(similarCandidates),
                  })
                : t("projects.aiSetup.marking.draft.createdReadyNext", {
                    code: createdPositionCode,
                  })}
          </p>
        ) : null}
        {evidence.selectedPositionId && !markMode ? (
          <SelectedPositionCard
            position={
              evidence.positions.find((p) => p.id === evidence.selectedPositionId) ?? null
            }
            onAddPrice={onAddPrice}
            onConfirm={evidence.confirm}
          />
        ) : null}

        {aiSuggestion ? (
          <div className="rounded-xl border border-[#1D376A]/30 bg-[#F6F8FB] p-3 text-sm space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-[#0F2A4D]">
                <Sparkles className="mr-1 inline size-4 text-[#E95F2A]" />
                {t("projects.aiSetup.marking.aiSuggestionTitle")}
              </p>
              <button
                type="button"
                className="text-[#94A3B8] hover:text-[#0F2A4D]"
                onClick={() => setAiSuggestion(null)}
                aria-label={t("flyover.close")}
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-[#0F2A4D]">
              {aiSuggestion.name}{" "}
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  aiSuggestion.confidence === "high"
                    ? "bg-emerald-100 text-emerald-800"
                    : aiSuggestion.confidence === "medium"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-200 text-slate-700"
                )}
              >
                {t(`projects.aiSetup.marking.aiConfidence.${aiSuggestion.confidence}`)}
              </span>
            </p>
            {aiSuggestion.reason ? (
              <p className="text-xs text-[#64748B]">{aiSuggestion.reason}</p>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#1D376A] text-white hover:bg-[#162952]"
              onClick={() => {
                evidence.renameLabel(aiSuggestion.positionId, aiSuggestion.name);
                setAiSuggestion(null);
              }}
            >
              {t("projects.aiSetup.marking.aiApplyName")}
            </Button>
          </div>
        ) : null}
        {aiError ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t("projects.aiSetup.marking.aiError")}{" "}
            <span className="font-mono text-[10px]">{aiError}</span>
          </p>
        ) : null}

        <div className={cn("min-h-0 flex-1", checklistMaxHeightClassName)}>
          <EstimatorMarkingChecklist
            positions={evidence.positions}
            progress={evidence.markingProgress}
            selectedPositionId={evidence.selectedPositionId}
            selectedAnchorId={evidence.selectedAnchorId}
            highlightedPositionIds={highlightedPositionIds}
            onToggleHighlight={(positionId) => {
              setHighlightedPositionIds((prev) =>
                prev.includes(positionId)
                  ? prev.filter((id) => id !== positionId)
                  : [...prev, positionId]
              );
              setShowAllMarks(false);
            }}
            onSelect={evidence.setSelectedPositionId}
            onSelectAnchor={evidence.setSelectedAnchorId}
            markMode={markMode}
            onMarkModeChange={onMarkModeChange}
            onNextUnmarked={() => {
              const next = nextUnmarkedPositionId(
                evidence.positions,
                evidence.selectedPositionId
              );
              if (next) {
                evidence.setSelectedPositionId(next);
                onMarkModeChange(true);
              }
            }}
            onRemoveLastMark={(positionId) => evidence.removeManualMark(positionId)}
            onRemoveMark={(positionId, anchorId) => {
              evidence.removeManualMark(positionId, anchorId);
              if (evidence.selectedAnchorId === anchorId) {
                evidence.setSelectedAnchorId(null);
              }
            }}
            onDeletePosition={(positionId) => {
              const pos = evidence.positions.find((p) => p.id === positionId);
              if (!pos) return;
              evidence.ignore(pos, "Odstránené z kontroly značiek.");
              if (evidence.selectedPositionId === positionId) {
                evidence.setSelectedPositionId(null);
              }
            }}
            onRename={(positionId, label) => evidence.renameLabel(positionId, label)}
            onUseMarkCount={(positionId) => evidence.useMarkCountAsQuantity(positionId)}
            onSetCategory={(positionId, category) => evidence.setCategory(positionId, category)}
            onMarkAnother={startNextSymbolType}
            onIdentify={(positionId) => void handleIdentify(positionId)}
            identifyingPositionId={identifyingId}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  tone = "default",
}: {
  value: number;
  label: string;
  tone?: "default" | "warning";
}) {
  return (
    <span
      className={cn(
        "rounded-lg border px-2.5 py-1.5 font-semibold tabular-nums",
        tone === "warning" && value > 0
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-[#CBD5E1] bg-white text-[#0F2A4D]"
      )}
    >
      {value} <span className="font-normal text-[#64748B]">{label}</span>
    </span>
  );
}

const DRAFT_TYPE_ORDER: SymbolDraftCategory[] = [
  "socket",
  "double_socket",
  "switch",
  "lighting",
  "led_strip",
  "cable",
  "installation_box",
  "distribution_board",
  "unknown",
];

function mapIdentifiedCategory(
  category: string
): SymbolDraftCategory {
  switch (category) {
    case "socket":
      return "socket";
    case "switch":
      return "switch";
    case "lighting":
      return "lighting";
    case "led_strip":
      return "led_strip";
    case "cable":
      return "cable";
    case "distribution_board":
      return "distribution_board";
    case "installation_material":
      return "installation_box";
    default:
      return "unknown";
  }
}

const DRAFT_SCOPES: SymbolDraftScope[] = [
  "buy_install",
  "install_only",
  "prepare_outlet",
  "chase_cable",
  "customer_supplied",
  "out_of_scope",
];

const DRAFT_UNITS: EstimatorPositionUnit[] = ["ks", "m", "m2", "set", "h"];

/** Side panel card: "Čo je táto značka?" — classify a clicked PDF symbol. */
function SymbolDraftClassifierCard({
  draft,
  aiBusy = false,
  onCreate,
  onIgnore,
}: {
  draft: UnclassifiedSymbolDraft;
  aiBusy?: boolean;
  onCreate: (classification: {
    category: SymbolDraftCategory;
    label?: string;
    roomName?: string;
    unit?: EstimatorPositionUnit;
    scope?: SymbolDraftScope;
  }) => void;
  onIgnore: () => void;
}) {
  const { t } = useI18n();
  const suggested = draft.possibleTypes.filter((c): c is SymbolDraftCategory =>
    (DRAFT_TYPE_ORDER as string[]).includes(c)
  );
  const [category, setCategory] = useState<SymbolDraftCategory | null>(
    suggested[0] ?? null
  );
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [unit, setUnit] = useState<EstimatorPositionUnit>(
    suggested[0] === "led_strip" || suggested[0] === "cable" ? "m" : "ks"
  );
  const [scope, setScope] = useState<SymbolDraftScope>("buy_install");

  // When AI updates possibleTypes, prefer the new top suggestion.
  useEffect(() => {
    const next = suggested[0];
    if (!next) return;
    setCategory(next);
    setUnit(next === "led_strip" || next === "cable" ? "m" : "ks");
  }, [draft.possibleTypes.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickType = (c: SymbolDraftCategory) => {
    setCategory(c);
    setUnit(c === "led_strip" || c === "cable" ? "m" : "ks");
  };

  return (
    <div className="space-y-3 rounded-xl border-2 border-[#E95F2A]/50 bg-[#FFF8F5] p-3 text-sm">
      <div>
        <p className="font-semibold text-[#0F2A4D]">
          {t("projects.aiSetup.marking.draft.title")}
        </p>
        <p className="text-xs text-[#64748B]">
          {aiBusy
            ? t("projects.aiSetup.marking.draft.aiBusy")
            : t("projects.aiSetup.marking.draft.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("projects.aiSetup.marking.draft.title")}>
        {DRAFT_TYPE_ORDER.map((c) => {
          const isSuggested = suggested.includes(c);
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-[#1D376A] bg-[#1D376A] text-white"
                  : isSuggested
                    ? "border-[#E95F2A]/60 bg-white text-[#B4441B] hover:bg-[#FFF1EA]"
                    : "border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]"
              )}
              onClick={() => pickType(c)}
            >
              {t(`projects.aiSetup.marking.draft.type.${c}`)}
              {isSuggested && !active ? (
                <span className="ml-1 text-[9px] uppercase text-[#E95F2A]">
                  {t("projects.aiSetup.marking.draft.suggested")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 space-y-1 text-xs font-medium text-[#334155]">
          {t("projects.aiSetup.marking.draft.nameLabel")}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              category ? t(`projects.aiSetup.marking.draft.type.${category}`) : ""
            }
            className="h-8 bg-white text-sm"
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-[#334155]">
          {t("projects.aiSetup.marking.draft.roomLabel")}
          <Input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            className="h-8 bg-white text-sm"
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-[#334155]">
          {t("projects.aiSetup.marking.draft.unitLabel")}
          <Select value={unit} onValueChange={(v) => setUnit(v as EstimatorPositionUnit)}>
            <SelectTrigger className="h-8 bg-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRAFT_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="col-span-2 space-y-1 text-xs font-medium text-[#334155]">
          {t("projects.aiSetup.marking.draft.scopeLabel")}
          <Select value={scope} onValueChange={(v) => setScope(v as SymbolDraftScope)}>
            <SelectTrigger className="h-8 bg-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRAFT_SCOPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`projects.aiSetup.marking.draft.scope.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 bg-[#E95F2A] text-white hover:bg-[#D14E1D]"
          disabled={!category}
          onClick={() => {
            if (!category) return;
            onCreate({
              category,
              label: name.trim() || undefined,
              roomName: room.trim() || undefined,
              unit,
              scope,
            });
          }}
        >
          {t("projects.aiSetup.marking.draft.create")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={onIgnore}
        >
          {t("projects.aiSetup.marking.draft.ignore")}
        </Button>
      </div>
    </div>
  );
}

function SelectedPositionCard({
  position,
  onAddPrice,
  onConfirm,
}: {
  position: EstimatorPosition | null;
  onAddPrice: (p: EstimatorPosition) => void;
  onConfirm: (p: EstimatorPosition) => void;
}) {
  const { t } = useI18n();
  if (!position) return null;
  return (
    <div className="rounded-xl border-2 border-[#E95F2A]/40 bg-[#FFF8F5] p-3 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-[#E95F2A]">
        {t("projects.aiSetup.positions.selectedDetail")}
      </p>
      <p className="text-sm font-semibold text-[#0F2A4D]">
        <span className="font-mono text-xs">{position.positionCode}</span> · {position.label}
        {position.roomName ? ` · ${position.roomName}` : ""}
      </p>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#475569]">
          {t("projects.aiSetup.positions.evidence.title")}
        </p>
        <ul className="space-y-1">
          {position.evidenceAnchors.slice(0, 6).map((a) => (
            <li key={a.id} className="text-xs text-[#64748B] leading-snug">
              {t(`projects.aiSetup.positions.evidence.source.${a.sourceType}`)} ·{" "}
              {t("projects.aiSetup.positions.evidence.page", { page: a.page })}
              {a.sourceText ? ` · „${a.sourceText}“` : ""}
              {!a.bbox ? ` · ${t("projects.aiSetup.positions.evidence.noBbox")}` : ""}
            </li>
          ))}
          {position.evidenceAnchors.length > 6 ? (
            <li className="text-xs text-[#94A3B8]">
              +{position.evidenceAnchors.length - 6}
            </li>
          ) : null}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {position.reviewStatus === "needs_review" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-emerald-300 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
            onClick={() => onConfirm(position)}
          >
            {t("projects.aiSetup.positions.action.confirm")}
          </Button>
        ) : null}
        {position.priceStatus === "price_missing" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-[#E95F2A]/50 px-2 text-xs text-[#E95F2A] hover:bg-[#FFF8F5]"
            onClick={() => onAddPrice(position)}
          >
            {t("projects.aiSetup.positions.action.addPrice")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
