"use client";

/**
 * "Výkaz a ceny" step — evidence-linked takeoff workspace.
 *
 * Top card gives instant metrics + primary access to the detailed takeoff.
 * Sub-tabs: Súhrn | Detailný výkaz | Ceny | Pozície v PDF | Na kontrolu.
 * The detailed takeoff is a first-class tab, not hidden under the summary.
 */

import { useMemo, useState } from "react";
import { ClipboardList, Euro, FileSearch, Plus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { MaterialUnit } from "@/services/materials/types";
import { EstimatorLinkedTakeoffTable } from "@/components/ai-estimator/EstimatorLinkedTakeoffTable";
import { EstimatorPdfEvidenceViewer } from "@/components/ai-estimator/EstimatorPdfEvidenceViewer";
import {
  EstimatorPriceDrawer,
} from "@/components/ai-estimator/EstimatorPriceDrawer";
import type { EstimatorPosition } from "@/types/estimatorPositions";
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
  const missingPrices = includedMaterials.filter((m) => !(m.price > 0)).length;

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
            value={includedMaterials.length}
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
          <EstimatorPdfEvidenceViewer
            fileUrl={evidence.fileUrl}
            fileName={evidence.fileName}
            annotations={evidence.annotations}
            selectedPositionId={evidence.selectedPositionId}
            onAnnotationClick={(positionId) => evidence.setSelectedPositionId(positionId)}
            heightClassName="h-[560px]"
          />
          <div className="min-w-0 space-y-3">
            {evidence.selectedPositionId ? (
              <SelectedPositionCard
                position={
                  evidence.positions.find((p) => p.id === evidence.selectedPositionId) ?? null
                }
                onAddPrice={openPriceDrawer}
                onConfirm={evidence.confirm}
              />
            ) : null}
            <div className="max-h-[560px] overflow-y-auto">
              <EstimatorLinkedTakeoffTable
                positions={evidence.positions}
                currency={currency}
                selectedPositionId={evidence.selectedPositionId}
                onSelectPosition={evidence.setSelectedPositionId}
                compact
              />
            </div>
          </div>
        </div>
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
        disabled={saving}
        onClick={onContinue}
      >
        {saving ? t("common.loading") : t("projects.aiSetup.cta.toWork")}
      </Button>
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
