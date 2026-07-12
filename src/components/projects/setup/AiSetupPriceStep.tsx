"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type { AiSetupCalculation, AiSetupTotals } from "./aiSetupTypes";

type Props = {
  calculation: AiSetupCalculation;
  totals: AiSetupTotals;
  onChange: (calc: AiSetupCalculation) => void;
  onContinue: () => void;
  saving?: boolean;
  currency?: string;
  /** Product sourcing panel (feature-flagged by parent). */
  productSourcingSlot?: ReactNode;
  pricingBlocked?: boolean;
  pricingBlockReasons?: string[];
};

export function AiSetupPriceStep({
  calculation,
  totals,
  onChange,
  onContinue,
  saving,
  currency = "EUR",
  productSourcingSlot,
  pricingBlocked,
  pricingBlockReasons = [],
}: Props) {
  const { t } = useI18n();
  const set = (patch: Partial<AiSetupCalculation>) => onChange({ ...calculation, ...patch });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#0F2A4D]">{t("projects.aiSetup.price.title")}</h3>
        <p className="mt-1 text-sm text-[#475569] leading-relaxed">{t("projects.aiSetup.price.lead")}</p>
      </div>

      {productSourcingSlot}

      {pricingBlocked && pricingBlockReasons.length > 0 ? (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 space-y-2" role="status">
          <p className="text-sm font-bold text-amber-950">{t("products.sourcing.notReady")}</p>
          <ul className="text-sm text-amber-900 list-disc pl-5 space-y-1">
            {pricingBlockReasons.slice(0, 8).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">{t("products.sourcing.notReadyHint")}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border-2 border-[#CBD5E1] bg-white p-5 sm:p-6 space-y-4 max-w-lg">
        <PriceField
          label={t("projects.aiSetup.summary.material")}
          computed={totals.materialCost}
          override={calculation.materialTotalOverride}
          onOverride={(v) => set({ materialTotalOverride: v })}
          currency={currency}
        />
        {totals.materialCost <= 0 ? (
          <p className="text-xs font-semibold text-amber-700">
            {t("projects.aiSetup.material.priceMissingShort")} — {t("products.sourcing.zeroGuard")}
          </p>
        ) : null}
        <PriceField
          label={t("projects.aiSetup.summary.work")}
          computed={totals.workCost}
          override={calculation.workTotalOverride}
          onOverride={(v) => set({ workTotalOverride: v })}
          currency={currency}
        />
        <SimpleField
          label={t("projects.aiSetup.calc.other")}
          value={calculation.otherCosts}
          onChange={(v) => set({ otherCosts: v })}
          suffix={currency}
        />
        <SimpleField
          label={t("projects.aiSetup.calc.margin")}
          value={calculation.marginPercent}
          onChange={(v) => set({ marginPercent: v })}
          suffix="%"
        />
        <SimpleField
          label={t("projects.aiSetup.calc.vat")}
          value={calculation.vatPercent}
          onChange={(v) => set({ vatPercent: v })}
          suffix="%"
        />

        <div className="border-t border-[#E2E8F0] pt-4 space-y-2">
          <Row
            label={t("projects.aiSetup.summary.margin", { percent: String(calculation.marginPercent) })}
            value={formatMoney(totals.marginAmount, currency)}
          />
          <Row
            label={t("projects.aiSetup.summary.vat", { percent: String(calculation.vatPercent) })}
            value={formatMoney(totals.vatAmount, currency)}
          />
        </div>

        <div className="rounded-xl bg-[#FFF8F5] border border-[#E95F2A]/25 px-4 py-4 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="font-bold text-[#0F2A4D]">{t("projects.aiSetup.summary.total")}</span>
            <span className="text-xl font-bold text-[#E95F2A] tabular-nums">
              {formatMoney(totals.grossTotal, currency)}
            </span>
          </div>
          <Label className="text-xs font-semibold text-[#64748B]">
            {t("projects.aiSetup.price.manualTotal")}
          </Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={calculation.manualGrossTotal ?? ""}
            placeholder={String(totals.grossTotal)}
            onChange={(e) => {
              const raw = e.target.value;
              set({ manualGrossTotal: raw === "" ? null : Number(raw) || 0 });
            }}
            className="h-11 tabular-nums"
          />
          {totals.manualTotalActive ? (
            <p className="text-xs font-semibold text-[#E95F2A]">
              {t("projects.aiSetup.price.manualTotalActive")}
            </p>
          ) : null}
        </div>
      </div>

      <Button
        type="button"
        className="w-full sm:w-auto bg-[#E95F2A] hover:bg-[#D94F1F] h-11 text-base font-semibold px-8"
        disabled={saving}
        onClick={onContinue}
      >
        {saving ? t("common.loading") : t("projects.aiSetup.cta.toOffer")}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[#64748B]">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function SimpleField({
  label,
  value,
  onChange,
  suffix = "EUR",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold text-[#0F2A4D]">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step={suffix === "%" ? 0.1 : 0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-10 tabular-nums"
        />
        <span className="text-sm text-[#64748B] shrink-0">{suffix}</span>
      </div>
    </div>
  );
}

function PriceField({
  label,
  computed,
  override,
  onOverride,
  currency = "EUR",
}: {
  label: string;
  computed: number;
  override: number | null;
  onOverride: (v: number) => void;
  currency?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold text-[#0F2A4D]">{label}</Label>
      <Input
        type="number"
        min={0}
        step={0.01}
        value={override ?? computed}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n) || n < 0) return;
          onOverride(n);
        }}
        className="h-11 text-base font-semibold tabular-nums"
      />
      {override != null && override !== computed ? (
        <p className="text-xs text-[#64748B]">
          {t("projects.aiSetup.price.computedHint", { amount: formatMoney(computed, currency) })}
        </p>
      ) : null}
    </div>
  );
}
