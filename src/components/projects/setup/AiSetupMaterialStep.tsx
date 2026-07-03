"use client";

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
import { AI_SETUP_MATERIAL_UNITS, newLocalId, normalizeSetupUnit, setupUnitLabel } from "./aiSetupHelpers";
import type { AiSetupMaterialRow } from "./aiSetupTypes";
import { AiSetupProjectFactsPanel } from "./AiSetupProjectFactsPanel";
import type { AiProjectFactsPersisted } from "./aiSetupTypes";

type Props = {
  materials: AiSetupMaterialRow[];
  onMaterialsChange: (rows: AiSetupMaterialRow[]) => void;
  onContinue: () => void;
  saving?: boolean;
  projectFacts?: AiProjectFactsPersisted;
  onProjectFactsChange?: (facts: AiProjectFactsPersisted) => void;
  onApplyFactsToMaterials?: () => void;
  applyingFacts?: boolean;
};

export function AiSetupMaterialStep({
  materials,
  onMaterialsChange,
  onContinue,
  saving,
  projectFacts,
  onProjectFactsChange,
  onApplyFactsToMaterials,
  applyingFacts,
}: Props) {
  const { t } = useI18n();

  const update = (id: string, patch: Partial<AiSetupMaterialRow>) => {
    onMaterialsChange(materials.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#0F2A4D]">{t("projects.aiSetup.material.title")}</h3>
        <p className="mt-1 text-sm text-[#475569] leading-relaxed">{t("projects.aiSetup.material.lead")}</p>
        <p className="mt-1 text-xs text-[#64748B]">{t("quotes.print.customerVisibleHint")}</p>
      </div>

      <AiSetupProjectFactsPanel
        projectFacts={projectFacts}
        onProjectFactsChange={(facts) => onProjectFactsChange?.(facts)}
        onApplyToMaterials={() => onApplyFactsToMaterials?.()}
        applying={applyingFacts}
      />

      {materials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-10 text-center">
          <p className="text-sm text-[#64748B]">{t("projects.aiSetup.material.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {materials.map((m) => (
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
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={m.qty}
                        onChange={(e) => update(m.id, { qty: Number(e.target.value) || 0 })}
                        className="h-10 w-24 tabular-nums"
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
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={m.price || ""}
                        onChange={(e) => update(m.id, { price: Number(e.target.value) || 0 })}
                        placeholder="0"
                        className="h-10 tabular-nums"
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
