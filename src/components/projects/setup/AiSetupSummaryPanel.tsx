"use client";

import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type { AiSetupCalculation, AiSetupTotals } from "./aiSetupTypes";

type Props = {
  totals: AiSetupTotals;
  calculation: AiSetupCalculation;
  currency?: string;
};

export function AiSetupSummaryPanel({ totals, calculation, currency = "EUR" }: Props) {
  const { t } = useI18n();

  return (
    <aside className="lg:sticky lg:top-6 rounded-[20px] border-2 border-[#CBD5E1] bg-white shadow-[0_8px_24px_rgba(15,42,77,0.06)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#0F2A4D] text-white">
        <h3 className="font-bold text-base">{t("projects.aiSetup.summary.title")}</h3>
      </div>
      <div className="px-5 py-4 space-y-3 text-sm">
        <Row label={t("projects.aiSetup.summary.material")} value={formatMoney(totals.materialCost, currency)} />
        <Row label={t("projects.aiSetup.summary.work")} value={formatMoney(totals.workCost, currency)} />
        <Row label={t("projects.aiSetup.summary.other")} value={formatMoney(totals.otherCosts, currency)} />
        <Row
          label={t("projects.aiSetup.summary.margin", { percent: String(calculation.marginPercent) })}
          value={formatMoney(totals.marginAmount, currency)}
        />
        <Row
          label={t("projects.aiSetup.summary.vat", { percent: String(calculation.vatPercent) })}
          value={formatMoney(totals.vatAmount, currency)}
        />
        <div className="border-t border-[#E2E8F0] pt-3 space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="font-bold text-[#0F2A4D]">{t("projects.aiSetup.summary.total")}</span>
            <span className="font-bold text-lg text-[#E95F2A] tabular-nums">
              {formatMoney(totals.grossTotal, currency)}
            </span>
          </div>
          {totals.manualTotalActive ? (
            <p className="text-xs font-semibold text-[#E95F2A]">
              {t("projects.aiSetup.price.manualTotalActive")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="px-5 py-3 bg-[#F6F8FB] border-t border-[#E2E8F0] text-xs text-[#64748B] space-y-1">
        <p className="font-semibold text-[#334155]">{t("projects.aiSetup.summary.statusDraft")}</p>
        <p>{t("projects.aiSetup.summary.notSent")}</p>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#64748B]">{label}</span>
      <span className="font-semibold text-[#0F2A4D] tabular-nums">{value}</span>
    </div>
  );
}
