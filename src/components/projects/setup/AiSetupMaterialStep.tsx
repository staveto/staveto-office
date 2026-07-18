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
  Crosshair,
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
import { PlanTakeoffWorkbench } from "@/components/takeoff/PlanTakeoffWorkbench";
import { isPdfTakeoffRegionAnalyzerEnabled } from "@/lib/ai/aiEstimatorFeature";
import {
  resolveCanonicalDrawingId,
  type ResolveCanonicalDrawingIdResult,
} from "@/services/takeoff/drawingIdentityService";
import { mergeTakeoffDrawingData } from "@/services/takeoff/takeoffDrawingMergeService";
import { EstimatorMarkingChecklist } from "@/components/ai-estimator/EstimatorMarkingChecklist";
import {
  EstimatorPriceDrawer,
} from "@/components/ai-estimator/EstimatorPriceDrawer";
import { SelectedMarkDetailPreview } from "@/components/ai-estimator/SelectedMarkDetailPreview";
import {
  countSimilarPricelessPositions,
  filterSimilarCandidateMarks,
  isManualMarkAnchor,
  isSimilarCandidateAnchor,
  nextUnmarkedPositionId,
  similarCandidateAnchors,
} from "@/lib/ai/estimatorPositions";
import {
  buildSymbolDraftFromMark,
  type SymbolDraftCategory,
  type SymbolDraftScope,
} from "@/lib/ai/unclassifiedSymbolDraft";
import {
  detectPlanTradeProfile,
  filterCategoriesByProfile,
} from "@/lib/ai/planTradeProfile";
import {
  isLineSymbolKey,
  resolveBestSymbolKey,
  upsertLegendSymbolKey,
  upsertUserLearnedSymbolKey,
} from "@/lib/ai/projectSymbolKey";
import { captureMarkCrop } from "@/lib/ai/markCropCapture";
import { findSimilarSymbols } from "@/services/takeoff/similarSymbolDetectionService";
import { identifyDrawingSymbol } from "@/services/ai/identifySymbolService";
import type {
  EstimatorPosition,
  EstimatorPositionBBox,
  EstimatorPositionUnit,
  ProjectSymbolKeyEntry,
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
  // One shared PDF takeoff tool for quote + project + documents.
  const sharedTakeoffEnabled = isPdfTakeoffRegionAnalyzerEnabled();

  // Canonical drawing identity — quote takeoff must key on the SAME
  // drawingId Project Documents would use for the same PDF (task: fix
  // quote/project drawing identity mismatch). Resolution is best-effort and
  // never destructive; it falls back to the AI-draft fileId immediately and
  // upgrades once resolved so the workbench never blocks on it.
  const activeFileId = evidence?.activeDocument?.fileId ?? null;
  const activeFileName = evidence?.activeDocument?.fileName ?? evidence?.fileName ?? null;
  const [canonicalDrawingId, setCanonicalDrawingId] = useState<string | null>(null);
  const [drawingAliasWarning, setDrawingAliasWarning] =
    useState<ResolveCanonicalDrawingIdResult | null>(null);
  const [mergingLegacyDrawingData, setMergingLegacyDrawingData] = useState(false);
  useEffect(() => {
    if (!activeFileId || !evidence?.projectId || !sharedTakeoffEnabled) {
      setCanonicalDrawingId(null);
      setDrawingAliasWarning(null);
      return;
    }
    let cancelled = false;
    resolveCanonicalDrawingId({
      projectId: evidence.projectId,
      fileId: activeFileId,
      fileName: activeFileName,
    })
      .then((result) => {
        if (cancelled) return;
        setCanonicalDrawingId(result.canonicalDrawingId);
        setDrawingAliasWarning(result.hasLegacyDataUnderAlias ? result : null);
      })
      .catch(() => {
        if (!cancelled) setCanonicalDrawingId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFileId, activeFileName, evidence?.projectId, sharedTakeoffEnabled]);

  const handleMergeLegacyDrawingData = async () => {
    if (!drawingAliasWarning?.aliasFileId || !evidence?.projectId || mergingLegacyDrawingData) return;
    setMergingLegacyDrawingData(true);
    try {
      await mergeTakeoffDrawingData({
        projectId: evidence.projectId,
        fromDrawingId: drawingAliasWarning.aliasFileId,
        toDrawingId: drawingAliasWarning.canonicalDrawingId,
        dryRun: false,
      });
      setDrawingAliasWarning(null);
    } finally {
      setMergingLegacyDrawingData(false);
    }
  };

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
  const reviewPositions = useMemo(() => {
    const all = evidence?.positions ?? [];
    return all.filter((p) => {
      if (p.reviewStatus === "ignored" || p.reviewStatus === "excluded") return false;
      if (p.reviewStatus === "needs_review") return true;
      if (p.priceStatus === "price_missing" && p.category !== "labor") return true;
      if (similarCandidateAnchors(p).length > 0) return true;
      return false;
    });
  }, [evidence?.positions]);
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
        requirePlanMark: false,
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
        <p className="text-xs font-medium text-[#1D376A]">
          {t("projects.aiSetup.positions.confirmedOnlyHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          {hasPdfTab ? (
            <Button
              type="button"
              className="bg-[#E95F2A] hover:bg-[#D94F1F] h-10 px-4 font-semibold"
              onClick={() => onSubTabChange("pdf")}
              data-testid="open-pdf-marking"
            >
              <FileSearch className="size-4 mr-1.5" />
              {t("projects.aiSetup.positions.action.openPdfMarking")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-10 border-[#CBD5E1] px-4"
            onClick={() => onSubTabChange("detail")}
          >
            <Plus className="size-4 mr-1.5" />
            {t("projects.aiSetup.positions.action.addManual")}
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
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-3 text-[#64748B]"
            onClick={() => onSubTabChange("detail")}
          >
            <ClipboardList className="size-4 mr-1.5" />
            {t("projects.aiSetup.positions.action.openDetail")}
          </Button>
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
          {evidence ? (
            <ManualItemForm
              onAdd={(input) => {
                evidence.createManualPosition(input);
              }}
            />
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
      {/* Shared takeoff tool (one source of truth): quote flow uses the SAME
          PlanTakeoffWorkbench + takeoff data as project/documents. The legacy
          estimator marking stays only as fallback when the analyzer is off. */}
      {subTab === "pdf" && evidence && sharedTakeoffEnabled ? (
        <div className="space-y-3" data-testid="quote-shared-takeoff">
          {drawingAliasWarning ? (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
              data-testid="drawing-alias-warning"
            >
              <span className="min-w-0 flex-1">
                {t("projects.aiSetup.pdf.legacyDrawingDataWarning")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-amber-500/60 text-xs"
                disabled={mergingLegacyDrawingData}
                data-testid="merge-legacy-drawing-data"
                onClick={() => void handleMergeLegacyDrawingData()}
              >
                {mergingLegacyDrawingData
                  ? t("common.loading")
                  : t("projects.aiSetup.pdf.mergeLegacyDrawingData")}
              </Button>
            </div>
          ) : null}
          <PlanTakeoffWorkbench
            projectId={evidence.projectId}
            drawingId={canonicalDrawingId ?? evidence.activeDocument?.fileId ?? evidence.fileName ?? "drawing"}
            fileName={evidence.fileName ?? "plan.pdf"}
            fileUrl={evidence.fileUrl}
            mode="quote"
          />
        </div>
      ) : null}
      {subTab === "pdf" && evidence && !sharedTakeoffEnabled ? (
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

      {/* Fullscreen marking dialog (legacy fallback only) */}
      {evidence && !sharedTakeoffEnabled ? (
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
                positions={reviewPositions}
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
          similarPricelessCount={
            pricePosition
              ? countSimilarPricelessPositions(evidence.positions, pricePosition)
              : 0
          }
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
  const [similarMatchSummary, setSimilarMatchSummary] = useState<{
    accepted: number;
    uncertain: number;
    rejected: number;
  } | null>(null);
  const [uncertainPool, setUncertainPool] = useState<
    Array<{ page: number; bbox: EstimatorPositionBBox; matchScore: number }>
  >([]);
  const [symbolKeys, setSymbolKeys] = useState<ProjectSymbolKeyEntry[]>([]);
  const [symbolDraft, setSymbolDraft] = useState<UnclassifiedSymbolDraft | null>(null);
  const [createdPositionCode, setCreatedPositionCode] = useState<string | null>(null);
  const [draftAiBusy, setDraftAiBusy] = useState(false);
  const [showAllMarks, setShowAllMarks] = useState(true);
  const [showDetailList, setShowDetailList] = useState(false);
  const [lineSymbolHint, setLineSymbolHint] = useState(false);
  const [highlightedPositionIds, setHighlightedPositionIds] = useState<string[]>([]);
  const [bulkKeys, setBulkKeys] = useState<Set<string>>(() => new Set());
  const [similarFloodWarning, setSimilarFloodWarning] = useState(false);
  const [deleteChoice, setDeleteChoice] = useState<{
    positionId: string;
    anchorId: string;
  } | null>(null);
  const symbolDraftRef = useRef<UnclassifiedSymbolDraft | null>(null);
  symbolDraftRef.current = symbolDraft;

  const selectedPosition = evidence.selectedPositionId
    ? evidence.positions.find((p) => p.id === evidence.selectedPositionId) ?? null
    : null;

  // Trade + country detected from file name and already-extracted texts —
  // constrains symbol suggestions to the right profession/norm (no AI call).
  const tradeProfile = useMemo(
    () =>
      detectPlanTradeProfile({
        fileName: evidence.fileName,
        texts: [
          ...evidence.positions.map((p) => p.label),
          ...evidence.positions.flatMap((p) =>
            p.evidenceAnchors.map((a) => a.sourceText)
          ),
        ],
      }),
    [evidence.fileName, evidence.positions]
  );

  const pendingCandidateCount = useMemo(
    () =>
      evidence.positions.reduce((n, p) => n + similarCandidateAnchors(p).length, 0),
    [evidence.positions]
  );

  const selectedPendingCount = selectedPosition
    ? similarCandidateAnchors(selectedPosition).length
    : 0;

  const lastManualMark = selectedPosition
    ? [...selectedPosition.evidenceAnchors].reverse().find((a) => isManualMarkAnchor(a) && a.bbox)
    : undefined;

  const anchorKey = (positionId: string, anchorId: string) =>
    `${positionId}::${anchorId}`;

  /** After create: keep selection, do NOT auto-run find-similar. */
  const afterPositionCreated = (
    position: EstimatorPosition,
    draft?: UnclassifiedSymbolDraft | null
  ) => {
    setCreatedPositionCode(position.positionCode);
    setSimilarCandidates(null);
    setSimilarMatchSummary(null);
    setUncertainPool([]);
    setSimilarFloodWarning(false);
    setLineSymbolHint(false);
    const templateBbox =
      draft?.bbox ??
      [...position.evidenceAnchors].reverse().find((a) => a.tightSymbolBbox || a.bbox)
        ?.tightSymbolBbox ??
      [...position.evidenceAnchors].reverse().find((a) => a.bbox)?.bbox;
    setSymbolKeys((keys) =>
      upsertUserLearnedSymbolKey(keys, position, templateBbox, draft?.colorHint)
    );
    evidence.setSelectedPositionId(position.id);
    evidence.setSelectedAnchorId(null);
    onMarkModeChange(true);
  };

  /** Manual "Nájsť rovnaké" — confirmed template/key only, strict bands. */
  const handleFindSimilar = async () => {
    if (!selectedPosition || !lastManualMark?.bbox || !evidence.fileUrl) return;
    const key = resolveBestSymbolKey(symbolKeys, {
      positionId: selectedPosition.id,
      normalizedPoint: selectedPosition.normalizedPoint,
      category: selectedPosition.category,
    });
    if (key && isLineSymbolKey(key)) {
      setLineSymbolHint(true);
      setSimilarMatchSummary(null);
      setSimilarCandidates(null);
      setUncertainPool([]);
      return;
    }
    if (
      selectedPosition.category === "led_strip" ||
      selectedPosition.category === "cable"
    ) {
      setLineSymbolHint(true);
      setSimilarMatchSummary(null);
      setSimilarCandidates(null);
      setUncertainPool([]);
      return;
    }

    setSimilarBusy(true);
    setSimilarCandidates(null);
    setSimilarMatchSummary(null);
    setUncertainPool([]);
    setSimilarFloodWarning(false);
    setLineSymbolHint(false);
    try {
      const referenceBbox =
        key?.templateBbox ?? lastManualMark.tightSymbolBbox ?? lastManualMark.bbox;
      const result = await findSimilarSymbols({
        projectId: evidence.projectId,
        drawingId: evidence.activeDocument?.fileId ?? evidence.fileName ?? "drawing",
        fileUrl: evidence.fileUrl,
        pageNumber: lastManualMark.page,
        referenceBbox,
        scanAllPages: true,
        threshold: 0.82,
      });
      const filtered = filterSimilarCandidateMarks(
        result.candidates.map((c) => ({
          page: c.pageNumber,
          bbox: c.normalizedPosition,
          matchScore: c.matchScore,
        })),
        { referenceBbox }
      );
      setSimilarMatchSummary({
        accepted: filtered.accepted.length,
        uncertain: filtered.uncertain.length,
        rejected: filtered.rejected.length,
      });
      setUncertainPool(filtered.uncertain);
      if (filtered.uncertain.length > 0 || filtered.rejected.length > 12) {
        setSimilarFloodWarning(true);
      }
      if (filtered.accepted.length > 0) {
        evidence.addSimilarCandidateMarks(selectedPosition.id, filtered.accepted, {
          referenceBbox,
          prefiltered: true,
        });
        setSimilarCandidates(filtered.accepted.length);
        evidence.setSelectedPositionId(selectedPosition.id);
      } else {
        setSimilarCandidates(0);
      }
    } finally {
      setSimilarBusy(false);
    }
  };

  const promoteUncertainToReview = () => {
    if (!selectedPosition || uncertainPool.length === 0) return;
    evidence.addSimilarCandidateMarks(selectedPosition.id, uncertainPool, {
      prefiltered: true,
    });
    setUncertainPool([]);
    setShowDetailList(true);
  };

  const confirmDeleteSelected = () => {
    const positionId = evidence.selectedPositionId;
    const anchorId = evidence.selectedAnchorId;
    if (!positionId || !anchorId) return;
    const plan = evidence.planRemoveEvidenceAnchor(positionId, anchorId);
    if (!plan) return;
    if (plan.kind === "candidate") {
      evidence.removeManualMark(positionId, anchorId);
      evidence.setSelectedAnchorId(null);
      setBulkKeys((prev) => {
        const next = new Set(prev);
        next.delete(anchorKey(positionId, anchorId));
        return next;
      });
      return;
    }
    if (plan.kind === "mark") {
      if (
        typeof window !== "undefined" &&
        !window.confirm(t("projects.aiSetup.marking.deleteMarkConfirm"))
      ) {
        return;
      }
      evidence.removeManualMark(positionId, anchorId);
      evidence.setSelectedAnchorId(null);
      return;
    }
    setDeleteChoice({ positionId, anchorId });
  };

  const runBulkDelete = () => {
    const refs = [...bulkKeys].map((k) => {
      const [positionId, anchorId] = k.split("::");
      return { positionId: positionId!, anchorId: anchorId! };
    });
    if (refs.length === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        t("projects.aiSetup.marking.bulkDeleteConfirm", { count: String(refs.length) })
      )
    ) {
      return;
    }
    const onlyCandidates = refs.every((r) => {
      const p = evidence.positions.find((x) => x.id === r.positionId);
      const a = p?.evidenceAnchors.find((x) => x.id === r.anchorId);
      return a ? isSimilarCandidateAnchor(a) : false;
    });
    if (onlyCandidates) evidence.removeCandidatesBulk(refs);
    else evidence.removeAnchorsBulk(refs);
    setBulkKeys(new Set());
  };

  const startNextSymbolType = () => {
    evidence.setSelectedPositionId(null);
    evidence.setSelectedAnchorId(null);
    setSymbolDraft(null);
    setCreatedPositionCode(null);
    setSimilarCandidates(null);
    setSimilarMatchSummary(null);
    setUncertainPool([]);
    onMarkModeChange(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable)
        return;
      if (e.key === "Escape" && markMode) {
        e.preventDefault();
        onMarkModeChange(false);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (bulkKeys.size > 0) runBulkDelete();
        else confirmDeleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
          ? "h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]"
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
          <p className="sticky top-0 z-[5] rounded-lg border-2 border-[#E95F2A]/50 bg-[#FFF8F5] px-3 py-2 text-xs font-semibold text-[#B4441B] shadow-sm">
            {markingToolMode === "click_symbol"
              ? t("projects.aiSetup.marking.activeHintClick")
              : t("projects.aiSetup.marking.activeHintBox")}{" "}
            <span className="font-normal text-[#B4441B]/80">
              {t("projects.aiSetup.marking.activeHintEsc")}
            </span>
          </p>
        ) : null}
        <p className="text-[11px] text-[#64748B]">
          {tradeProfile.trade === "unknown" ? (
            t("projects.aiSetup.marking.profile.unknown")
          ) : (
            <>
              {t("projects.aiSetup.marking.profile.detected", {
                trade: t(`projects.aiSetup.marking.profile.trade.${tradeProfile.trade}`),
                standard: tradeProfile.standardHint,
              })}
              {tradeProfile.confidence !== "high"
                ? ` · ${t("projects.aiSetup.marking.profile.lowConfidence")}`
                : null}
            </>
          )}
        </p>
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
        {lineSymbolHint ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            {t("projects.aiSetup.marking.lineSymbolNoPointMatch")}
          </p>
        ) : null}
        {similarMatchSummary ? (
          <p className="text-xs font-medium text-[#0F2A4D]">
            {t("projects.aiSetup.marking.similarSummary", {
              accepted: similarMatchSummary.accepted,
              uncertain: similarMatchSummary.uncertain,
              rejected: similarMatchSummary.rejected,
            })}
          </p>
        ) : similarCandidates != null && similarCandidates > 0 ? (
          <p className="text-xs text-[#0F2A4D]">
            {t("projects.aiSetup.marking.similarFound", {
              count: similarCandidates,
            })}
          </p>
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
          onToggleBulkSelect={(positionId, anchorId) => {
            const key = anchorKey(positionId, anchorId);
            setBulkKeys((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
            evidence.setSelectedPositionId(positionId);
            evidence.setSelectedAnchorId(anchorId);
          }}
          markMode={markMode}
          onMarkModeChange={onMarkModeChange}
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
            // Legend/table: learn project key only — never count as takeoff.
            if (meta?.markStatus === "in_legend_or_table") {
              const label = selectedPosition?.label ?? "Legenda";
              const normalizedPoint =
                selectedPosition?.normalizedPoint ??
                selectedPosition?.category ??
                "unknown";
              setSymbolKeys((keys) =>
                upsertLegendSymbolKey(keys, {
                  label,
                  normalizedPoint,
                  category: selectedPosition?.category,
                  templateBbox: meta.tightSymbolBbox ?? bbox,
                  colorHint: meta.colorHint,
                })
              );
              setOutsidePlanWarning(true);
              return;
            }
            if (meta?.outsidePlan || meta?.markStatus === "outside_plan") {
              setOutsidePlanWarning(true);
              return;
            }
            // Always PDF-first: one click = one NEW position.
            if (evidence.selectedPositionId) {
              evidence.setSelectedPositionId(null);
              evidence.setSelectedAnchorId(null);
            }
            const draft = buildSymbolDraftFromMark({
              page,
              bbox,
              rawSearchBbox: meta?.rawSelectionBbox,
              polygon: polygon ?? meta?.polygon,
              colorHint: meta?.colorHint,
              confidence: meta?.confidence,
              outsidePlan: false,
            });
            if (!draft) return;
            // Suggest only categories of the detected trade (e.g. elektro).
            draft.possibleTypes = filterCategoriesByProfile(
              draft.possibleTypes,
              tradeProfile
            );
            // AI vision already named this symbol during marking — classify
            // immediately, no second identify round-trip.
            const suggestion = meta?.aiSuggestion;
            if (
              suggestion &&
              (suggestion.confidence === "high" || suggestion.confidence === "medium")
            ) {
              const category = mapIdentifiedCategory(suggestion.category);
              const position = evidence.createPositionFromDraft(draft, {
                category,
                label: suggestion.name?.trim() || undefined,
              });
              setSymbolDraft(null);
              setPickFailedWarning(false);
              setOutsidePlanWarning(false);
              afterPositionCreated(position, draft);
              return;
            }
            setSymbolDraft(draft);
            setCreatedPositionCode(null);
            setPickFailedWarning(false);
            setOutsidePlanWarning(false);
            setSimilarCandidates(null);
            setSimilarMatchSummary(null);
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
                  afterPositionCreated(position, current);
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
            evidence.setSelectedPositionId(positionId);
            evidence.setSelectedAnchorId(anchorId);
            const plan = evidence.planRemoveEvidenceAnchor(positionId, anchorId);
            if (!plan) return;
            if (plan.kind === "candidate") {
              evidence.removeManualMark(positionId, anchorId);
              evidence.setSelectedAnchorId(null);
              return;
            }
            if (plan.kind === "mark") {
              if (window.confirm(t("projects.aiSetup.marking.deleteMarkConfirm"))) {
                evidence.removeManualMark(positionId, anchorId);
                evidence.setSelectedAnchorId(null);
              }
              return;
            }
            setDeleteChoice({ positionId, anchorId });
          }}
          heightClassName={viewerHeightClassName}
        />
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2",
          fullscreen ? "h-full min-h-0" : "max-h-[640px]"
        )}
      >
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {/* 1. Aktuálna položka */}
          <section className="rounded-xl border-2 border-[#1D376A]/20 bg-white p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#1D376A]">
              {t("projects.aiSetup.marking.panel.currentItem")}
            </p>
            <SelectedMarkDetailPreview
              position={selectedPosition}
              fileUrl={evidence.fileUrl}
              selectedAnchorId={evidence.selectedAnchorId}
            />
            {selectedPosition ? (
              <SelectedPositionCard
                position={selectedPosition}
                onAddPrice={onAddPrice}
                onConfirm={evidence.confirm}
                compact
              />
            ) : (
              <p className="text-xs text-[#64748B]">
                {t("projects.aiSetup.marking.panel.noCurrentItem")}
              </p>
            )}
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
                  afterPositionCreated(position, symbolDraft);
                }}
                onIgnore={() => setSymbolDraft(null)}
              />
            ) : null}
            {createdPositionCode ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
                {t("projects.aiSetup.marking.draft.createdReadyFind", {
                  code: createdPositionCode,
                })}
              </p>
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
                <p className="text-[#0F2A4D]">{aiSuggestion.name}</p>
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
          </section>

          {/* 2. Projektový kľúč značiek */}
          <section className="rounded-xl border border-[#E2E8F0] bg-[#F6F8FB] p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#475569]">
              {t("projects.aiSetup.marking.panel.symbolKey")}
            </p>
            {symbolKeys.length === 0 ? (
              <p className="text-xs text-[#64748B]">
                {t("projects.aiSetup.marking.panel.symbolKeyEmpty")}
              </p>
            ) : (
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {symbolKeys.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1 text-xs text-[#0F2A4D]"
                  >
                    <span className="truncate font-medium">{k.label}</span>
                    <span className="shrink-0 text-[10px] text-[#94A3B8]">
                      {k.source === "user_learned"
                        ? t("projects.aiSetup.marking.panel.keyLearned")
                        : k.source === "project_legend"
                          ? t("projects.aiSetup.marking.panel.keyLegend")
                          : t("projects.aiSetup.marking.panel.keyAi")}
                      {k.kind === "line_symbol" ? " · line" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. Na kontrolu */}
          <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
              {t("projects.aiSetup.marking.panel.needsReview")}
            </p>
            {similarMatchSummary ? (
              <p className="text-xs text-amber-950">
                {t("projects.aiSetup.marking.similarSummary", {
                  accepted: similarMatchSummary.accepted,
                  uncertain: similarMatchSummary.uncertain,
                  rejected: similarMatchSummary.rejected,
                })}
              </p>
            ) : null}
            {similarFloodWarning ? (
              <p className="text-xs font-semibold text-amber-900">
                {t("projects.aiSetup.marking.similarFloodWarning")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-8 bg-[#1D376A] text-xs text-white hover:bg-[#162952]"
                disabled={selectedPendingCount === 0 || !selectedPosition}
                onClick={() => {
                  if (!selectedPosition) return;
                  evidence.confirmSimilarCandidates(selectedPosition.id);
                  setSimilarCandidates(null);
                  setSimilarMatchSummary(null);
                }}
              >
                {t("projects.aiSetup.marking.confirmProbable")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={uncertainPool.length === 0 || !selectedPosition}
                onClick={promoteUncertainToReview}
              >
                {t("projects.aiSetup.marking.reviewUncertain")}
                {uncertainPool.length > 0 ? ` (${uncertainPool.length})` : ""}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={
                  (selectedPendingCount === 0 && uncertainPool.length === 0) ||
                  !selectedPosition
                }
                onClick={() => {
                  if (!selectedPosition) return;
                  evidence.dismissSimilarCandidates(selectedPosition.id);
                  setUncertainPool([]);
                  setSimilarCandidates(null);
                  setSimilarMatchSummary(null);
                }}
              >
                {t("projects.aiSetup.marking.candidates.dismiss")}
              </Button>
            </div>
            <p className="text-xs text-amber-900/80">
              {t("projects.aiSetup.marking.panel.reviewCount", {
                candidates: selectedPendingCount || pendingCandidateCount,
                uncertain: uncertainPool.length,
              })}
            </p>
          </section>

          <button
            type="button"
            className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-left text-xs font-semibold text-[#1D376A] hover:bg-[#F6F8FB]"
            onClick={() => setShowDetailList((v) => !v)}
            aria-expanded={showDetailList}
          >
            {t("projects.aiSetup.marking.detailList")}
            {showDetailList ? " ▴" : " ▾"}
          </button>

          {showDetailList ? (
            <div className={cn("min-h-0", checklistMaxHeightClassName)}>
              <EstimatorMarkingChecklist
                positions={evidence.positions}
                progress={evidence.markingProgress}
                selectedPositionId={evidence.selectedPositionId}
                selectedAnchorId={evidence.selectedAnchorId}
                highlightedPositionIds={highlightedPositionIds}
                bulkKeys={bulkKeys}
                hideHeaderControls
                onToggleBulkKey={(positionId, anchorId) => {
                  const key = anchorKey(positionId, anchorId);
                  setBulkKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                onSelectAllCandidates={() => {
                  const next = new Set<string>();
                  for (const p of evidence.positions) {
                    for (const a of similarCandidateAnchors(p)) {
                      next.add(anchorKey(p.id, a.id));
                    }
                  }
                  setBulkKeys(next);
                }}
                onConfirmAllCandidates={() => {
                  for (const p of evidence.positions) {
                    if (similarCandidateAnchors(p).length > 0) {
                      evidence.confirmSimilarCandidates(p.id);
                    }
                  }
                  setSimilarCandidates(null);
                  setBulkKeys(new Set());
                }}
                onDismissAllCandidates={() => {
                  for (const p of evidence.positions) {
                    if (similarCandidateAnchors(p).length > 0) {
                      evidence.dismissSimilarCandidates(p.id);
                    }
                  }
                  setSimilarCandidates(null);
                  setUncertainPool([]);
                  setBulkKeys(new Set());
                }}
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
                onSetCategory={(positionId, category) => {
                  evidence.setCategory(positionId, category);
                  const pos = evidence.positions.find((p) => p.id === positionId);
                  if (pos) {
                    setSymbolKeys((keys) =>
                      upsertUserLearnedSymbolKey(
                        keys,
                        { ...pos, category },
                        undefined,
                        undefined
                      )
                    );
                  }
                }}
                onMarkAnother={startNextSymbolType}
                onIdentify={(positionId) => void handleIdentify(positionId)}
                identifyingPositionId={identifyingId}
              />
            </div>
          ) : null}
        </div>

        {/* Fixed bottom action bar — always visible, including mark mode */}
        <div className="shrink-0 border-t-2 border-[#1D376A]/20 bg-white px-1 py-2 shadow-[0_-4px_12px_rgba(15,42,77,0.08)]">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#E95F2A] text-xs text-white hover:bg-[#D94F1F]"
              onClick={() => {
                startNextSymbolType();
                onMarkModeChange(false);
              }}
            >
              {t("projects.aiSetup.marking.done")}
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-8 text-xs font-semibold",
                markMode
                  ? "bg-[#E95F2A] text-white hover:bg-[#D94F1F] ring-2 ring-[#E95F2A]/35"
                  : "bg-[#1D376A] text-white hover:bg-[#162952]"
              )}
              aria-pressed={markMode}
              onClick={() => onMarkModeChange(!markMode)}
            >
              <Crosshair className="mr-1 size-3.5" />
              {markMode
                ? t("projects.aiSetup.marking.modeOn")
                : t("projects.aiSetup.marking.modeOff")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                const next = nextUnmarkedPositionId(
                  evidence.positions,
                  evidence.selectedPositionId
                );
                if (next) {
                  evidence.setSelectedPositionId(next);
                  onMarkModeChange(true);
                }
              }}
            >
              {t("projects.aiSetup.marking.nextUnmarked")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={similarBusy || !lastManualMark?.bbox || !evidence.fileUrl}
              onClick={() => void handleFindSimilar()}
            >
              {similarBusy
                ? t("common.loading")
                : t("projects.aiSetup.marking.findSimilarShort")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#1D376A] text-xs text-white hover:bg-[#162952]"
              disabled={selectedPendingCount === 0 || !selectedPosition}
              onClick={() => {
                if (!selectedPosition) return;
                evidence.confirmSimilarCandidates(selectedPosition.id);
                setSimilarCandidates(null);
                setSimilarMatchSummary(null);
              }}
            >
              {t("projects.aiSetup.marking.candidates.confirmAll", {
                count: selectedPendingCount || pendingCandidateCount,
              })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={
                (selectedPendingCount === 0 && uncertainPool.length === 0) ||
                !selectedPosition
              }
              onClick={() => {
                if (!selectedPosition) return;
                evidence.dismissSimilarCandidates(selectedPosition.id);
                setUncertainPool([]);
                setSimilarCandidates(null);
                setSimilarMatchSummary(null);
              }}
            >
              {t("projects.aiSetup.marking.candidates.dismiss")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-red-200 text-xs text-red-700 hover:bg-red-50"
              disabled={!evidence.selectedAnchorId && bulkKeys.size === 0}
              onClick={() => {
                if (bulkKeys.size > 0) runBulkDelete();
                else confirmDeleteSelected();
              }}
            >
              {t("projects.aiSetup.marking.deleteSelected")}
              {bulkKeys.size > 0 ? ` (${bulkKeys.size})` : ""}
            </Button>
          </div>
        </div>

        {deleteChoice ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xl">
              <p className="text-sm font-semibold text-[#0F2A4D]">
                {t("projects.aiSetup.marking.deleteItemOrMark")}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    evidence.applyRemoveAnchorPlan(
                      deleteChoice.positionId,
                      deleteChoice.anchorId,
                      "mark"
                    );
                    setDeleteChoice(null);
                  }}
                >
                  {t("projects.aiSetup.marking.deleteMarkOnly")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => {
                    evidence.applyRemoveAnchorPlan(
                      deleteChoice.positionId,
                      deleteChoice.anchorId,
                      "position"
                    );
                    setDeleteChoice(null);
                  }}
                >
                  {t("projects.aiSetup.marking.deleteWholeItem")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteChoice(null)}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
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

function ManualItemForm({
  onAdd,
}: {
  onAdd: (input: {
    label: string;
    category?: SymbolDraftCategory;
    quantity?: number;
    roomName?: string;
  }) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [room, setRoom] = useState("");
  const [category, setCategory] = useState<SymbolDraftCategory>("unknown");

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-[#CBD5E1]"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 size-3.5" />
        {t("projects.aiSetup.positions.manualAdd")}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3 space-y-2">
      <p className="text-xs font-semibold text-[#475569]">
        {t("projects.aiSetup.positions.manualAddHint")}
      </p>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("projects.aiSetup.positions.manualNamePlaceholder")}
          className="h-9 sm:col-span-2"
          aria-label={t("projects.aiSetup.positions.manualNamePlaceholder")}
        />
        <Input
          type="number"
          min={0.01}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-9 tabular-nums"
          aria-label={t("projects.aiSetup.positions.col.qty")}
        />
        <Input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder={t("projects.aiSetup.marking.draft.roomLabel")}
          className="h-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as SymbolDraftCategory)}
        >
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              [
                "socket",
                "switch",
                "lighting",
                "led_strip",
                "cable",
                "unknown",
              ] as const
            ).map((c) => (
              <SelectItem key={c} value={c}>
                {t(`projects.aiSetup.marking.draft.type.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-9 bg-[#1D376A] text-white hover:bg-[#162952]"
          disabled={!name.trim()}
          onClick={() => {
            const q = Number(qty.replace(",", "."));
            onAdd({
              label: name.trim(),
              category,
              quantity: Number.isFinite(q) && q > 0 ? q : 1,
              roomName: room.trim() || undefined,
            });
            setName("");
            setQty("1");
            setRoom("");
            setOpen(false);
          }}
        >
          {t("projects.aiSetup.marking.draft.create")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9"
          onClick={() => setOpen(false)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

function SelectedPositionCard({
  position,
  onAddPrice,
  onConfirm,
  compact = false,
}: {
  position: EstimatorPosition | null;
  onAddPrice: (p: EstimatorPosition) => void;
  onConfirm: (p: EstimatorPosition) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (!position) return null;
  const typeKey = `projects.aiSetup.marking.draft.type.${position.category}`;
  const typeLabel = t(typeKey);
  const sourceAnchor = [...position.evidenceAnchors].reverse().find((a) => a.sourceType);
  return (
    <div
      className={cn(
        "space-y-2",
        compact
          ? ""
          : "rounded-xl border-2 border-[#E95F2A]/40 bg-[#FFF8F5] p-3"
      )}
    >
      {!compact ? (
        <p className="text-xs font-bold uppercase tracking-wide text-[#E95F2A]">
          {t("projects.aiSetup.positions.selectedDetail")}
        </p>
      ) : null}
      <div>
        <p className="text-sm font-semibold text-[#0F2A4D]">{position.label}</p>
        <p className="font-mono text-[11px] text-[#64748B]">{position.positionCode}</p>
        <p className="mt-1 text-xs text-[#475569]">
          {typeLabel === typeKey ? position.category : typeLabel}
          {" · "}
          {position.quantity} {position.unit === "unknown" ? "ks" : position.unit}
          {sourceAnchor ? (
            <>
              {" · "}
              {t(`projects.aiSetup.positions.evidence.source.${sourceAnchor.sourceType}`)}
            </>
          ) : null}
          {" · "}
          {t(`projects.aiSetup.positions.price.${position.priceStatus}`)}
        </p>
      </div>
      {!compact ? (
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
          </ul>
        </div>
      ) : null}
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
