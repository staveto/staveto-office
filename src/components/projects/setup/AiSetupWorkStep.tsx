"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type { AiSetupWorkEstimate } from "./aiSetupTypes";

type Props = {
  work: AiSetupWorkEstimate;
  onChange: (work: AiSetupWorkEstimate) => void;
  onContinue: () => void;
  saving?: boolean;
};

export function AiSetupWorkStep({ work, onChange, onContinue, saving }: Props) {
  const { t } = useI18n();
  const subtotal = work.hours * work.hourlyRate;

  const set = (patch: Partial<AiSetupWorkEstimate>) => onChange({ ...work, ...patch });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#0F2A4D]">{t("projects.aiSetup.work.title")}</h3>
        <p className="mt-1 text-sm text-[#475569] leading-relaxed">{t("projects.aiSetup.work.lead")}</p>
      </div>

      <div className="rounded-2xl border-2 border-[#CBD5E1] bg-white p-5 sm:p-6 space-y-5 max-w-lg">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[#0F2A4D] font-bold">{t("projects.aiSetup.work.workers")}</Label>
            <Input
              type="number"
              min={1}
              step={1}
              value={work.workers}
              onChange={(e) => set({ workers: Math.max(1, Number(e.target.value) || 1) })}
              className="h-11 text-lg font-semibold"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[#0F2A4D] font-bold">{t("projects.aiSetup.work.hours")}</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={work.hours}
              onChange={(e) => set({ hours: Number(e.target.value) || 0 })}
              className="h-11 text-lg font-semibold tabular-nums"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-[#0F2A4D] font-bold">{t("projects.aiSetup.work.hourlyRate")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                value={work.hourlyRate}
                onChange={(e) => set({ hourlyRate: Number(e.target.value) || 0 })}
                className="h-11 text-lg font-semibold tabular-nums"
              />
              <span className="text-sm text-[#64748B] shrink-0">CHF / h</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[#0F2A4D] font-bold">{t("projects.aiSetup.work.note")}</Label>
          <Textarea
            value={work.note}
            onChange={(e) => set({ note: e.target.value })}
            rows={3}
            placeholder={t("projects.aiSetup.work.notePlaceholder")}
            className="text-[15px]"
          />
        </div>

        <div className="rounded-xl bg-[#F6F8FB] px-4 py-3 flex justify-between items-center">
          <span className="text-sm font-semibold text-[#64748B]">{t("projects.aiSetup.work.subtotal")}</span>
          <span className="text-lg font-bold text-[#0F2A4D] tabular-nums">
            {formatMoney(subtotal, "CHF")}
          </span>
        </div>
      </div>

      <Button
        type="button"
        className="w-full sm:w-auto bg-[#E95F2A] hover:bg-[#D94F1F] h-11 text-base font-semibold px-8"
        disabled={saving}
        onClick={onContinue}
      >
        {saving ? t("common.loading") : t("projects.aiSetup.cta.toPrice")}
      </Button>
    </div>
  );
}
