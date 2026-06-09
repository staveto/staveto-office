"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type { ProjectDoc } from "@/lib/projects";
import { setupUnitLabel } from "./aiSetupHelpers";
import type { AiSetupMaterialRow, AiSetupTotals, AiSetupWorkEstimate } from "./aiSetupTypes";

type Props = {
  project: ProjectDoc;
  materials: AiSetupMaterialRow[];
  work: AiSetupWorkEstimate;
  totals: AiSetupTotals;
  quoteNotes: string;
  onQuoteNotesChange: (v: string) => void;
  onSaveDraft: () => void;
  onExportPdf: () => void;
  saving?: boolean;
  saved?: boolean;
  savedQuoteId?: string | null;
  exportingPdf?: boolean;
};

export function AiSetupOfferStep({
  project,
  materials,
  work,
  totals,
  quoteNotes,
  onQuoteNotesChange,
  onSaveDraft,
  onExportPdf,
  saving,
  saved,
  savedQuoteId,
  exportingPdf,
}: Props) {
  const { t } = useI18n();
  const customer =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    t("projects.aiSetup.noCustomer");

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#0F2A4D]">{t("projects.aiSetup.offer.title")}</h3>
        <p className="mt-1 text-sm text-[#475569]">{t("projects.aiSetup.offer.lead")}</p>
      </div>

      <div className="rounded-2xl border-2 border-[#CBD5E1] bg-white p-5 sm:p-6 space-y-5">
        <span className="inline-block rounded-full bg-[#FFF3EC] text-[#E95F2A] text-xs font-bold px-3 py-1">
          {t("projects.aiSetup.offer.badge")}
        </span>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold uppercase text-[#64748B]">{t("projects.aiSetup.field.customer")}</dt>
            <dd className="font-semibold text-[#0F2A4D] mt-0.5">{customer}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-[#64748B]">{t("projects.aiSetup.field.project")}</dt>
            <dd className="font-semibold text-[#0F2A4D] mt-0.5">{project.name}</dd>
          </div>
        </dl>

        {project.customerRequest?.trim() ? (
          <section>
            <h4 className="text-xs font-bold uppercase text-[#64748B] mb-1">
              {t("projects.aiSetup.quote.scope")}
            </h4>
            <p className="text-sm text-[#334155] leading-relaxed">{project.customerRequest.trim()}</p>
          </section>
        ) : null}

        <section>
          <h4 className="text-xs font-bold uppercase text-[#64748B] mb-2">
            {t("projects.aiSetup.quote.materials")}
          </h4>
          <ul className="text-sm space-y-1.5">
            {materials.filter((m) => m.included && m.name.trim()).map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span className="text-[#334155]">
                  {m.name} · {m.qty} {setupUnitLabel(m.unit, t)}
                </span>
                {m.price > 0 ? (
                  <span className="tabular-nums font-medium shrink-0">
                    {formatMoney(m.qty * m.price, "CHF")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold text-[#0F2A4D] mt-2 tabular-nums flex justify-between">
            <span>{t("projects.aiSetup.summary.material")}</span>
            <span>{formatMoney(totals.materialCost, "CHF")}</span>
          </p>
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase text-[#64748B] mb-2">
            {t("projects.aiSetup.quote.work")}
          </h4>
          <p className="text-sm text-[#334155]">
            {t("projects.aiSetup.offer.workLine", {
              workers: String(work.workers),
              hours: String(work.hours),
              rate: String(work.hourlyRate),
            })}
            {work.note.trim() ? ` — ${work.note.trim()}` : ""}
          </p>
          <p className="text-sm font-semibold text-[#0F2A4D] mt-1 tabular-nums">
            {formatMoney(totals.workCost, "CHF")}
          </p>
        </section>

        <section className="border-t border-[#E2E8F0] pt-4 flex justify-between items-baseline">
          <span className="font-bold text-[#0F2A4D]">{t("projects.aiSetup.summary.total")}</span>
          <span className="text-xl font-bold text-[#E95F2A] tabular-nums">
            {formatMoney(totals.grossTotal, "CHF")}
          </span>
        </section>

        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-[#64748B]">
            {t("projects.aiSetup.quote.conditions")}
          </h4>
          <Textarea
            value={quoteNotes}
            onChange={(e) => onQuoteNotesChange(e.target.value)}
            rows={4}
            placeholder={t("projects.aiSetup.quote.conditionsPlaceholder")}
            className="text-[15px]"
          />
        </div>
      </div>

      {saved && savedQuoteId ? (
        <p className="text-sm text-[#475569]">
          <Link
            href={`/app/quotes/${savedQuoteId}`}
            className="font-semibold text-[#E95F2A] hover:underline"
          >
            {t("projects.aiSetup.quote.openSaved")}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={saving || exportingPdf}
          onClick={onExportPdf}
        >
          {exportingPdf ? t("common.loading") : t("projects.draft.exportPdf")}
        </Button>
        <Button
          type="button"
          className="bg-[#E95F2A] hover:bg-[#D94F1F] h-11 text-base font-semibold px-6"
          disabled={saving}
          onClick={onSaveDraft}
        >
          {saving
            ? t("common.loading")
            : saved
              ? t("projects.aiSetup.quote.saved")
              : t("projects.aiSetup.quote.saveDraft")}
        </Button>
      </div>
    </div>
  );
}
