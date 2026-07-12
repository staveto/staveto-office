"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
}: Props) {
  const { t } = useI18n();
  const [showDetail, setShowDetail] = useState(false);

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
  const missingPrices = materials.filter(
    (m) => m.included && m.name.trim() && !(m.price > 0)
  ).length;

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    rows: materials.filter((m) => (m.group || inferMaterialGroup(m.name)) === group),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#0F2A4D]">{t("projects.aiSetup.material.title")}</h3>
        <p className="mt-1 text-sm text-[#475569] leading-relaxed">
          {t("projects.aiSetup.material.lead")}
        </p>
        <p className="mt-1 text-xs text-[#64748B]">{t("projects.aiSetup.material.layersHint")}</p>
      </div>

      {loadingMaterials ? (
        <div
          className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-6 text-center text-sm text-[#64748B]"
          role="status"
        >
          {t("projects.aiSetup.material.loadingFromAi")}
        </div>
      ) : null}

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
        </div>
      ) : null}

      {materials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-10 text-center">
          <p className="text-sm text-[#64748B]">{t("projects.aiSetup.material.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
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
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail
                  ? t("projects.aiSetup.material.hideDetail")
                  : t("projects.aiSetup.material.showDetail")}
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

          {showDetail ? (
            <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                {t("projects.aiSetup.material.detailTitle")}
              </p>
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
                              onChange={(e) =>
                                update(m.id, { customerVisible: e.target.checked })
                              }
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
                                  onValueChange={(v) =>
                                    update(m.id, { unit: v as MaterialUnit })
                                  }
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
                                  onChange={(e) =>
                                    update(m.id, { price: Number(e.target.value) || 0 })
                                  }
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
                            onClick={() =>
                              onMaterialsChange(materials.filter((x) => x.id !== m.id))
                            }
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
            </div>
          ) : null}
        </div>
      )}

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
