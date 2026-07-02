"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/format";
import type { QuoteDoc, QuoteItemLine } from "@/lib/quotes";
import {
  formatOrganizationAddress,
  getOrganizationDisplayName,
  type OrganizationPrintInfo,
} from "@/lib/organizationProfile";
import type { ProjectDoc } from "@/lib/projects";
import {
  formatQuoteNumber,
  formatQuotePrintDate,
  formatQuoteQty,
  getQuoteIssueDate,
  getQuotePrintCategories,
  getQuoteValidUntilDate,
  groupQuoteItemsByCategory,
  normalizeQuotePrintCategory,
  type QuotePrintItemCategory,
} from "@/lib/quotePrint";
import type { QuotePrintContext } from "@/lib/quoteDocumentMeta";
import {
  DEFAULT_QUOTE_TEMPLATE,
  type QuoteDocumentTemplate,
} from "@/lib/documents/quoteTemplateContract";
import {
  resolveQuoteDocumentTitle,
  resolveTemplateFooterText,
  resolveTemplateValidityDays,
} from "@/lib/documents/quoteTemplateApply";
import { buildQuoteTemplateStyleProps } from "@/lib/documents/quoteTemplateStyles";
import type { QuoteLegalLabels } from "@/lib/documents/quoteLegalLabels";
import styles from "./quote-print.module.css";

export type QuotePrintDocumentProps = {
  quote: QuoteDoc;
  organization: OrganizationPrintInfo | null;
  project: ProjectDoc | null;
  printContext: QuotePrintContext;
  template?: QuoteDocumentTemplate | null;
  legalLabels?: QuoteLegalLabels | null;
  /** When true, missing logo shows placeholder instead of Staveto brand. */
  useCompanySupplier?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale?: string;
};

function isQuoteDraftForPrint(quote: QuoteDoc, project: ProjectDoc | null): boolean {
  if (quote.status === "sent" || quote.status === "accepted") return false;
  const qs = project?.quoteStatus;
  if (qs === "sent" || qs === "accepted") return false;
  return quote.status === "draft" || !qs || qs === "draft" || qs === "ready";
}

function CompanyLogo({
  organization,
  useCompanySupplier,
  t,
}: {
  organization: OrganizationPrintInfo | null;
  useCompanySupplier?: boolean;
  t: QuotePrintDocumentProps["t"];
}) {
  const logoUrl = organization?.profile?.logoUrl;
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={styles.companyLogo} />
    );
  }

  if (useCompanySupplier) {
    return (
      <div className={styles.logoPlaceholder} aria-hidden>
        {t("quotes.print.logoMissing")}
      </div>
    );
  }

  return (
    <div className={styles.brand}>
      Stave<span className={styles.brandAccent}>to</span>
    </div>
  );
}

function FieldMissing({ label, t }: { label: string; t: QuotePrintDocumentProps["t"] }) {
  return (
    <p className={styles.fieldMissing}>
      {label}: {t("quotes.print.profileFieldMissing")}
    </p>
  );
}

function SupplierBlock({
  organization,
  contactPerson,
  visibility,
  legalLabels,
  t,
}: {
  organization: OrganizationPrintInfo | null;
  contactPerson: QuotePrintContext["contactPerson"];
  visibility: QuoteDocumentTemplate["visibility"];
  legalLabels: QuoteLegalLabels | null | undefined;
  t: QuotePrintDocumentProps["t"];
}) {
  if (!organization) return null;

  const profile = organization.profile;
  const labels = legalLabels ?? {
    registrationNumberLabel: t("quotes.print.registrationNumber"),
    taxIdLabel: t("quotes.print.taxId"),
    vatIdLabel: t("quotes.print.vatId"),
    vatLabel: t("quotes.print.summaryVat"),
    complianceStatus: "needs_legal_review" as const,
  };
  const displayName = getOrganizationDisplayName(organization);
  const address = visibility.showCompanyAddress ? formatOrganizationAddress(profile) : undefined;
  const contactName = contactPerson.name?.trim() || profile?.contactName?.trim();
  const contactLabel =
    visibility.showContactPerson && contactName
      ? `${t("quotes.print.contactPerson")}: ${contactName}`
      : null;

  return (
    <div className={styles.supplierBlock}>
      <p className={styles.supplierName}>{displayName}</p>
      {visibility.showCompanyAddress ? (
        address ? (
          <p>{address}</p>
        ) : (
          <FieldMissing label={t("quotes.print.companyAddress")} t={t} />
        )
      ) : null}
      {visibility.showRegistrationNumber ? (
        profile?.registrationNumber ? (
          <p>
            {labels.registrationNumberLabel}: {profile.registrationNumber}
          </p>
        ) : (
          <FieldMissing label={labels.registrationNumberLabel} t={t} />
        )
      ) : null}
      {profile?.taxId ? (
        <p>
          {labels.taxIdLabel}: {profile.taxId}
        </p>
      ) : null}
      {profile?.vatId ? (
        <p>
          {labels.vatIdLabel}: {profile.vatId}
        </p>
      ) : null}
      <div className={styles.contactLines}>
        {profile?.email ? <p>{profile.email}</p> : null}
        {profile?.phone ? <p>{profile.phone}</p> : null}
        {profile?.websiteUrl ? <p>{profile.websiteUrl}</p> : null}
        {contactLabel ? <p>{contactLabel}</p> : null}
      </div>
    </div>
  );
}

function ItemsTable({
  items,
  t,
  startIndex,
  currency,
}: {
  items: QuoteItemLine[];
  t: QuotePrintDocumentProps["t"];
  startIndex: number;
  currency: string;
}) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.colNum}>#</th>
          <th>{t("quotes.print.colDescription")}</th>
          <th className={styles.colType}>{t("quotes.print.colType")}</th>
          <th className={styles.colQty}>{t("quotes.print.colQty")}</th>
          <th className={styles.colUnit}>{t("quotes.print.colUnit")}</th>
          <th className={styles.colPrice}>{t("quotes.print.colUnitPrice")}</th>
          <th className={styles.colTotal}>{t("quotes.print.colTotal")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, itemIndex) => {
          const category = normalizeQuotePrintCategory(item.category);
          return (
            <tr key={item.id}>
              <td className={styles.colNum}>{startIndex + itemIndex + 1}</td>
              <td>{item.name}</td>
              <td className={styles.colType}>{t(`quotes.print.category.${category}`)}</td>
              <td className={styles.colQty}>{formatQuoteQty(item.qty)}</td>
              <td className={styles.colUnit}>{item.unit}</td>
              <td className={styles.colPrice}>{formatMoney(item.unitPrice, currency)}</td>
              <td className={styles.colTotal}>{formatMoney(item.total, currency)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function categoryLabelKey(category: QuotePrintItemCategory): string {
  return `quotes.print.section.${category}`;
}

function SummaryCard({
  printContext,
  legalLabels,
  t,
}: {
  printContext: QuotePrintContext;
  legalLabels: QuoteLegalLabels | null | undefined;
  t: QuotePrintDocumentProps["t"];
}) {
  const { priceSummary, currency } = printContext;
  const vatLabel = legalLabels?.vatLabel ?? t("quotes.print.summaryVat");

  if (!priceSummary.isComplete) {
    return (
      <section className={styles.summaryCard} aria-label={t("quotes.print.summary")}>
        <p className={styles.sectionTitle}>{t("quotes.print.summary")}</p>
        <p className={styles.incompletePrice}>{t("quotes.print.priceIncomplete")}</p>
      </section>
    );
  }

  return (
    <section className={styles.summaryCard} aria-label={t("quotes.print.summary")}>
      <p className={styles.sectionTitle}>{t("quotes.print.summary")}</p>
      <div className={styles.summaryRows}>
        <div className={styles.summaryRow}>
          <span>{t("quotes.print.summaryMaterial")}</span>
          <span>{formatMoney(priceSummary.materialTotal, currency)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>{t("quotes.print.summaryWork")}</span>
          <span>{formatMoney(priceSummary.workTotal, currency)}</span>
        </div>
        {priceSummary.otherTotal > 0 ? (
          <div className={styles.summaryRow}>
            <span>{t("quotes.print.summaryOther")}</span>
            <span>{formatMoney(priceSummary.otherTotal, currency)}</span>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <span>{vatLabel}</span>
          <span>{formatMoney(priceSummary.vatAmount, currency)}</span>
        </div>
        <div className={styles.summaryRowGrand}>
          <span>{t("quotes.print.summaryTotal")}</span>
          <span>{formatMoney(priceSummary.grossTotal, currency)}</span>
        </div>
      </div>
    </section>
  );
}

export function QuotePrintDocument({
  quote,
  organization,
  project,
  printContext,
  template,
  legalLabels,
  useCompanySupplier = false,
  t,
  locale = "sk-SK",
}: QuotePrintDocumentProps) {
  const tpl = template ?? DEFAULT_QUOTE_TEMPLATE;
  const { visibility, layout } = tpl;
  const styleProps = buildQuoteTemplateStyleProps(tpl);

  const issueDate = getQuoteIssueDate(quote);
  const validUntil = getQuoteValidUntilDate(quote, resolveTemplateValidityDays(tpl));
  const quoteNumber = formatQuoteNumber(quote);
  const isDraft = isQuoteDraftForPrint(quote, project);
  const docTitle = resolveQuoteDocumentTitle(tpl, t("quotes.print.title"));
  const footerNote = resolveTemplateFooterText(tpl);

  const grouped = groupQuoteItemsByCategory(quote.items);
  let categories = getQuotePrintCategories(quote.items);
  if (!visibility.showMaterialSection) {
    categories = categories.filter((c) => c !== "material");
  }
  if (!visibility.showWorkSection) {
    categories = categories.filter((c) => c !== "work");
  }

  const categoryOffsets = useMemo(() => {
    const offsets = new Map<QuotePrintItemCategory, number>();
    let running = 0;
    for (const category of categories) {
      offsets.set(category, running);
      running += grouped[category].length;
    }
    return offsets;
  }, [quote.items, categories, grouped]);

  const clientAddress = project
    ? [project.addressText, project.city].filter(Boolean).join(", ")
    : undefined;

  const projectLabel = quote.projectName || project?.name;
  const subjectTitle = quote.title?.trim() || projectLabel || t("quotes.detailTitle");
  const bankAccount = organization?.profile?.bankAccount?.trim();
  const paymentQrUrl = organization?.profile?.paymentQrUrl?.trim();
  const { priceSummary, contactPerson } = printContext;

  return (
    <article
      className={`${styles.sheet} ${styleProps.className}`}
      style={styleProps.style}
      aria-label={t("quotes.print.documentTitle")}
    >
      {isDraft ? (
        <div className={styles.draftWatermark} aria-hidden>
          {t("quotes.print.draftWatermark")}
        </div>
      ) : null}

      <header className={styles.header}>
        {visibility.showLogo ? (
          <div className={styles.logoArea}>
            <CompanyLogo
              organization={organization}
              useCompanySupplier={useCompanySupplier}
              t={t}
            />
          </div>
        ) : null}
        <SupplierBlock
          organization={organization}
          contactPerson={contactPerson}
          visibility={visibility}
          legalLabels={legalLabels}
          t={t}
        />
      </header>

      <div className={styles.titleRow}>
        <h1 className={styles.docTitle}>
          {docTitle}
          {isDraft ? (
            <span className={styles.draftBadge}>{t("quotes.print.draftBadge")}</span>
          ) : null}
        </h1>
        <div className={styles.titleAccent} aria-hidden />
      </div>

      <div className={styles.metaGrid}>
        <div className={styles.metaBlock}>
          <span className={styles.metaLabel}>{t("quotes.print.quoteNumber")}</span>
          <span className={styles.metaValue}>{quoteNumber}</span>
        </div>
        <div className={styles.metaBlock}>
          <span className={styles.metaLabel}>{t("quotes.print.issueDate")}</span>
          <span className={styles.metaValue}>{formatQuotePrintDate(issueDate, locale)}</span>
        </div>
        <div className={styles.metaBlock}>
          <span className={styles.metaLabel}>{t("quotes.print.validUntil")}</span>
          <span className={styles.metaValue}>{formatQuotePrintDate(validUntil, locale)}</span>
          <span className={styles.metaHint}>{t("quotes.print.validUntilDefaultHint")}</span>
        </div>
        {visibility.showCustomerNumber && printContext.customerNumber ? (
          <div className={styles.metaBlock}>
            <span className={styles.metaLabel}>{t("quotes.print.customerNumber")}</span>
            <span className={styles.metaValue}>{printContext.customerNumber}</span>
          </div>
        ) : null}
        {visibility.showProjectNumber && printContext.projectNumber ? (
          <div className={styles.metaBlock}>
            <span className={styles.metaLabel}>{t("quotes.print.projectNumber")}</span>
            <span className={styles.metaValue}>{printContext.projectNumber}</span>
          </div>
        ) : null}
        {visibility.showCurrency ? (
          <div className={styles.metaBlock}>
            <span className={styles.metaLabel}>{t("quotes.print.currency")}</span>
            <span className={styles.metaValue}>{printContext.currency}</span>
          </div>
        ) : null}
      </div>

      <section className={styles.subjectBlock}>
        <p className={styles.sectionTitle}>{t("quotes.print.subject")}</p>
        <p className={styles.subjectTitle}>{subjectTitle}</p>
        {projectLabel && projectLabel !== subjectTitle ? (
          <p className={styles.subjectProject}>
            {t("quotes.print.project")}: {projectLabel}
          </p>
        ) : null}
      </section>

      {visibility.showSummary ? (
        <SummaryCard printContext={printContext} legalLabels={legalLabels} t={t} />
      ) : null}

      {visibility.showScopeOfWork && printContext.scopeOfWork.trim() ? (
        <section className={styles.scopeBlock}>
          <p className={styles.sectionTitle}>{t("quotes.print.scopeOfWork")}</p>
          <div className={styles.scopeBody}>{printContext.scopeOfWork}</div>
        </section>
      ) : null}

      <section className={styles.partiesGrid}>
        <div className={styles.clientBlock}>
          <p className={styles.sectionTitle}>{t("quotes.print.client")}</p>
          <p className={styles.clientName}>{quote.clientName}</p>
          {quote.clientEmail ? (
            <p className={styles.detailLine}>{quote.clientEmail}</p>
          ) : null}
          {project?.customerPhone ? (
            <p className={styles.detailLine}>{project.customerPhone}</p>
          ) : null}
          {clientAddress ? <p className={styles.detailLine}>{clientAddress}</p> : null}
        </div>
        {organization ? (
          <div className={styles.supplierCard}>
            <p className={styles.sectionTitle}>{t("quotes.print.supplier")}</p>
            <p className={styles.clientName}>{getOrganizationDisplayName(organization)}</p>
            {formatOrganizationAddress(organization.profile) ? (
              <p className={styles.detailLine}>
                {formatOrganizationAddress(organization.profile)}
              </p>
            ) : null}
            {organization.profile?.email ? (
              <p className={styles.detailLine}>{organization.profile.email}</p>
            ) : null}
            {organization.profile?.phone ? (
              <p className={styles.detailLine}>{organization.profile.phone}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section>
        {categories.length === 0 ? (
          <p>{t("quotes.print.noItems")}</p>
        ) : (
          categories.map((category) => {
            const sectionItems = grouped[category];
            const startIndex = categoryOffsets.get(category) ?? 0;
            return (
              <div key={category}>
                <h2 className={styles.categoryHeading}>{t(categoryLabelKey(category))}</h2>
                <ItemsTable
                  items={sectionItems}
                  t={t}
                  startIndex={startIndex}
                  currency={quote.currency}
                />
              </div>
            );
          })
        )}
      </section>

      <section className={styles.totals} aria-label={t("quotes.print.priceOverview")}>
        <p className={styles.sectionTitle}>{t("quotes.print.priceOverview")}</p>
        {priceSummary.isComplete ? (
          priceSummary.isFlatRate ? (
            <div className={styles.totalsRowGrand}>
              <span>{t("quotes.print.flatRate")}</span>
              <span>{formatMoney(priceSummary.grossTotal, printContext.currency)}</span>
            </div>
          ) : (
            <>
              <div className={styles.totalsRow}>
                <span>{t("quotes.print.subtotal")}</span>
                <span>{formatMoney(priceSummary.netTotal, printContext.currency)}</span>
              </div>
              <div className={styles.totalsRow}>
                <span>
                  {(legalLabels?.vatLabel ?? t("quotes.print.summaryVat"))} ({priceSummary.vatPercent}%)
                </span>
                <span>{formatMoney(priceSummary.vatAmount, printContext.currency)}</span>
              </div>
              <div className={styles.totalsRowGrand}>
                <span>{t("quotes.print.summaryTotal")}</span>
                <span>{formatMoney(priceSummary.grossTotal, printContext.currency)}</span>
              </div>
            </>
          )
        ) : (
          <p className={styles.incompletePrice}>{t("quotes.print.priceIncomplete")}</p>
        )}
      </section>

      <section className={styles.notes}>
        {visibility.showTerms ? (
          <>
            <p className={styles.notesTitle}>{t("quotes.print.conditions")}</p>
            <p className={styles.notesBody}>{printContext.conditions}</p>
            {printContext.paymentTerms ? (
              <p className={styles.notesBody}>
                <span className={styles.inlineLabel}>{t("quotes.print.paymentTerms")}: </span>
                {printContext.paymentTerms}
              </p>
            ) : null}
            {printContext.executionPeriod ? (
              <p className={styles.notesBody}>
                <span className={styles.inlineLabel}>{t("quotes.print.executionPeriod")}: </span>
                {printContext.executionPeriod}
              </p>
            ) : null}
            {printContext.warranty ? (
              <p className={styles.notesBody}>
                <span className={styles.inlineLabel}>{t("quotes.print.warranty")}: </span>
                {printContext.warranty}
              </p>
            ) : null}
            {printContext.exclusions ? (
              <p className={styles.notesBody}>
                <span className={styles.inlineLabel}>{t("quotes.print.exclusions")}: </span>
                {printContext.exclusions}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      {visibility.showContactBlock ? (
      <section className={styles.contactSection}>
        <p className={styles.sectionTitle}>{t("quotes.print.yourContact")}</p>
        {contactPerson.name ? (
          <p className={styles.contactName}>{contactPerson.name}</p>
        ) : null}
        {contactPerson.role ? (
          <p className={styles.detailLine}>{contactPerson.role}</p>
        ) : null}
        {contactPerson.phone ? (
          <p className={styles.detailLine}>{contactPerson.phone}</p>
        ) : null}
        {contactPerson.email ? (
          <p className={styles.detailLine}>{contactPerson.email}</p>
        ) : null}
      </section>
      ) : null}

      {visibility.showSignatureBlock ? (
      <section className={styles.signatureSection}>
        <p className={styles.sectionTitle}>{t("quotes.print.acceptance")}</p>
        <div className={styles.signatureGrid}>
          <div className={styles.signatureField}>
            <span className={styles.signatureLabel}>{t("quotes.print.placeDate")}</span>
            <span className={styles.signatureLine} />
          </div>
          <div className={styles.signatureField}>
            <span className={styles.signatureLabel}>{t("quotes.print.customerSignature")}</span>
            <span className={styles.signatureLine} />
          </div>
          <div className={styles.signatureField}>
            <span className={styles.signatureLabel}>{t("quotes.print.printedName")}</span>
            <span className={styles.signatureLine} />
          </div>
        </div>
      </section>
      ) : null}

      <footer className={styles.footer}>
        <div className={styles.footerRow}>
          <div className={styles.footerMain}>
            {bankAccount ? (
              <p>
                <span className={styles.footerLabel}>{t("quotes.print.bankAccount")}: </span>
                {bankAccount}
              </p>
            ) : null}
            {footerNote ? <p className={styles.templateFooterNote}>{footerNote}</p> : null}
          </div>
          {paymentQrUrl ? (
            <div className={styles.paymentQrBlock}>
              <p className={styles.paymentQrLabel}>{t("quotes.print.paymentQr")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={paymentQrUrl}
                alt={t("quotes.print.paymentQr")}
                className={styles.paymentQrImage}
              />
            </div>
          ) : null}
          <span className={styles.footerDate}>{formatQuotePrintDate(new Date(), locale)}</span>
        </div>
        {visibility.showStavetoBranding ? (
        <div className={styles.stavetoBranding}>
          <p>{t("quotes.print.stavetoBrandingNote")}</p>
          <p>{t("quotes.print.stavetoWebsite")}</p>
        </div>
        ) : null}
      </footer>
    </article>
  );
}
