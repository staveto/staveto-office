"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type { QuoteDocumentMeta } from "@/lib/quoteDocumentMeta";
import type { ProjectDoc } from "@/lib/projects";
import { setupUnitLabel } from "./aiSetupHelpers";
import type { AiSetupMaterialRow, AiSetupTotals, AiSetupWorkEstimate } from "./aiSetupTypes";

type Props = {
  project: ProjectDoc;
  materials: AiSetupMaterialRow[];
  work: AiSetupWorkEstimate;
  totals: AiSetupTotals;
  documentMeta: QuoteDocumentMeta;
  onDocumentMetaChange: (meta: QuoteDocumentMeta) => void;
  onSaveDraft: () => void;
  onExportPdf: () => void;
  saving?: boolean;
  saved?: boolean;
  savedQuoteId?: string | null;
  exportingPdf?: boolean;
  currency?: string;
  clarityErrors?: string[];
  clarityWarnings?: string[];
  quoteReady?: boolean;
  quotePackageSections?: { title: string; lineCount: number }[];
  /** Internal purchase list — not shown on customer PDF. */
  purchaseListSlot?: ReactNode;
};

function patchContact(
  meta: QuoteDocumentMeta,
  patch: Partial<NonNullable<QuoteDocumentMeta["contactPerson"]>>
): QuoteDocumentMeta {
  return {
    ...meta,
    contactPerson: { ...meta.contactPerson, ...patch },
  };
}

export function AiSetupOfferStep({
  project,
  materials,
  work,
  totals,
  documentMeta,
  onDocumentMetaChange,
  onSaveDraft,
  onExportPdf,
  saving,
  saved,
  savedQuoteId,
  exportingPdf,
  currency = "EUR",
  clarityErrors = [],
  clarityWarnings = [],
  quoteReady = true,
  quotePackageSections = [],
  purchaseListSlot,
}: Props) {
  const { t } = useI18n();
  const customer =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    t("projects.aiSetup.noCustomer");
  const contact = documentMeta.contactPerson ?? {};
  const customerMaterials = materials.filter(
    (m) => m.included && m.name.trim() && m.customerVisible !== false
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-[#0F2A4D]">{t("projects.aiSetup.offer.title")}</h3>
        <p className="mt-1 text-sm text-[#475569]">{t("projects.aiSetup.offer.lead")}</p>
      </div>

      {!quoteReady || clarityErrors.length > 0 ? (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 space-y-2" role="alert">
          <p className="text-sm font-bold text-amber-950">
            {t("projects.aiSetup.offer.notReady")}
          </p>
          <ul className="text-sm text-amber-900 space-y-1 list-disc pl-5">
            {clarityErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {clarityWarnings.length > 0 ? (
        <ul className="text-xs text-[#64748B] space-y-1 list-disc pl-5">
          {clarityWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {purchaseListSlot}

      {quotePackageSections.length > 0 ? (
        <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#64748B] mb-2">
            {t("projects.aiSetup.offer.packagePreview")}
          </p>
          <ul className="text-sm text-[#334155] space-y-1">
            {quotePackageSections.map((s) => (
              <li key={s.title} className="flex justify-between gap-2">
                <span>{s.title}</span>
                <span className="tabular-nums text-[#64748B]">{s.lineCount}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#64748B] mt-2 leading-relaxed">
            {t("projects.aiSetup.offer.packageHint")}
          </p>
        </div>
      ) : null}

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

        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-[#64748B]">
            {t("quotes.print.scopeOfWork")}
          </h4>
          <p className="text-xs text-[#64748B] leading-relaxed">
            {t("projects.aiSetup.offer.scopeHint")}
          </p>
          <Textarea
            value={documentMeta.scopeOfWork ?? ""}
            onChange={(e) => onDocumentMetaChange({ ...documentMeta, scopeOfWork: e.target.value })}
            rows={6}
            placeholder={t("projects.aiSetup.quote.scopePlaceholder")}
            className="text-[15px]"
          />
        </section>

        <section>
          <h4 className="text-xs font-bold uppercase text-[#64748B] mb-2">
            {t("projects.aiSetup.quote.materials")}
          </h4>
          <ul className="text-sm space-y-1.5">
            {customerMaterials.slice(0, 12).map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span className="text-[#334155]">
                    {m.name} · {m.qty} {setupUnitLabel(m.unit, t)}
                    {!(m.price > 0) ? (
                      <span className="text-amber-700"> · {t("projects.aiSetup.material.priceMissingShort")}</span>
                    ) : null}
                  </span>
                  {m.price > 0 ? (
                    <span className="tabular-nums font-medium shrink-0">
                      {formatMoney(m.qty * m.price, currency)}
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
          {customerMaterials.length > 12 ? (
            <p className="text-xs text-[#64748B] mt-2">
              {t("projects.aiSetup.offer.packageHint")}
            </p>
          ) : null}
          <p className="text-sm font-semibold text-[#0F2A4D] mt-2 tabular-nums flex justify-between">
            <span>{t("projects.aiSetup.summary.material")}</span>
            <span>{formatMoney(totals.materialCost, currency)}</span>
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
              currency,
            })}
            {work.note.trim() ? ` — ${work.note.trim()}` : ""}
          </p>
          <p className="text-sm font-semibold text-[#0F2A4D] mt-1 tabular-nums">
            {formatMoney(totals.workCost, currency)}
          </p>
        </section>

        <section className="border-t border-[#E2E8F0] pt-4 flex justify-between items-baseline">
          <span className="font-bold text-[#0F2A4D]">{t("projects.aiSetup.summary.total")}</span>
          <span className="text-xl font-bold text-[#E95F2A] tabular-nums">
            {formatMoney(totals.grossTotal, currency)}
          </span>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <h4 className="text-xs font-bold uppercase text-[#64748B]">
              {t("quotes.print.conditions")}
            </h4>
            <Textarea
              value={documentMeta.conditions ?? ""}
              onChange={(e) => onDocumentMetaChange({ ...documentMeta, conditions: e.target.value })}
              rows={4}
              placeholder={t("projects.aiSetup.quote.conditionsPlaceholder")}
              className="text-[15px]"
            />
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-[#64748B]">
              {t("quotes.print.executionPeriod")}
            </h4>
            <Input
              value={documentMeta.executionPeriod ?? ""}
              onChange={(e) =>
                onDocumentMetaChange({ ...documentMeta, executionPeriod: e.target.value })
              }
              placeholder={t("projects.aiSetup.quote.executionPlaceholder")}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase text-[#64748B]">
              {t("quotes.print.paymentTerms")}
            </h4>
            <Input
              value={documentMeta.paymentTerms ?? ""}
              onChange={(e) =>
                onDocumentMetaChange({ ...documentMeta, paymentTerms: e.target.value })
              }
              placeholder={t("projects.aiSetup.quote.paymentPlaceholder")}
              className="h-11"
            />
          </div>
        </div>

        <section className="space-y-3 border-t border-[#E2E8F0] pt-4">
          <h4 className="text-xs font-bold uppercase text-[#64748B]">
            {t("quotes.print.yourContact")}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={contact.name ?? ""}
              onChange={(e) => onDocumentMetaChange(patchContact(documentMeta, { name: e.target.value }))}
              placeholder={t("projects.aiSetup.quote.contactName")}
              className="h-11"
            />
            <Input
              value={contact.role ?? ""}
              onChange={(e) => onDocumentMetaChange(patchContact(documentMeta, { role: e.target.value }))}
              placeholder={t("projects.aiSetup.quote.contactRole")}
              className="h-11"
            />
            <Input
              value={contact.phone ?? ""}
              onChange={(e) => onDocumentMetaChange(patchContact(documentMeta, { phone: e.target.value }))}
              placeholder={t("projects.aiSetup.quote.contactPhone")}
              className="h-11"
            />
            <Input
              value={contact.email ?? ""}
              onChange={(e) => onDocumentMetaChange(patchContact(documentMeta, { email: e.target.value }))}
              placeholder={t("projects.aiSetup.quote.contactEmail")}
              className="h-11"
            />
          </div>
        </section>
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
          {exportingPdf ? t("common.loading") : t("quotes.print.printAction")}
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
