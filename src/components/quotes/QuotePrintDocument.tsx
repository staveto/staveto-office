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
import styles from "./quote-print.module.css";

export type QuotePrintDocumentProps = {
  quote: QuoteDoc;
  organization: OrganizationPrintInfo | null;
  project: ProjectDoc | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale?: string;
};

function CompanyLogo({
  organization,
}: {
  organization: OrganizationPrintInfo | null;
}) {
  const logoUrl = organization?.profile?.logoUrl;
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className={styles.companyLogo} />
    );
  }

  return (
    <div className={styles.brand}>
      Stave<span className={styles.brandAccent}>to</span>
    </div>
  );
}

function SupplierBlock({
  organization,
  t,
}: {
  organization: OrganizationPrintInfo | null;
  t: QuotePrintDocumentProps["t"];
}) {
  if (!organization) return null;

  const profile = organization.profile;
  const displayName = getOrganizationDisplayName(organization);
  const address = formatOrganizationAddress(profile);

  return (
    <div className={styles.supplierBlock}>
      <p className={styles.supplierName}>{displayName}</p>
      {address ? <p>{address}</p> : null}
      {profile?.registrationNumber ? (
        <p>
          {t("quotes.print.registrationNumber")}: {profile.registrationNumber}
        </p>
      ) : null}
      {profile?.taxId ? (
        <p>
          {t("quotes.print.taxId")}: {profile.taxId}
        </p>
      ) : null}
      {profile?.vatId ? (
        <p>
          {t("quotes.print.vatId")}: {profile.vatId}
        </p>
      ) : null}
      <div className={styles.contactLines}>
        {profile?.phone ? <p>{profile.phone}</p> : null}
        {profile?.email ? <p>{profile.email}</p> : null}
        {profile?.websiteUrl ? <p>{profile.websiteUrl}</p> : null}
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

export function QuotePrintDocument({
  quote,
  organization,
  project,
  t,
  locale = "sk-SK",
}: QuotePrintDocumentProps) {
  const issueDate = getQuoteIssueDate(quote);
  const validUntil = getQuoteValidUntilDate(quote);
  const quoteNumber = formatQuoteNumber(quote);
  const isDraft = quote.status === "draft";

  const grouped = groupQuoteItemsByCategory(quote.items);
  const categories = getQuotePrintCategories(quote.items);

  const categoryOffsets = useMemo(() => {
    const g = groupQuoteItemsByCategory(quote.items);
    const cats = getQuotePrintCategories(quote.items);
    const offsets = new Map<QuotePrintItemCategory, number>();
    let running = 0;
    for (const category of cats) {
      offsets.set(category, running);
      running += g[category].length;
    }
    return offsets;
  }, [quote.items]);

  const clientAddress = project
    ? [project.addressText, project.city].filter(Boolean).join(", ")
    : undefined;

  const projectLabel = quote.projectName || project?.name;
  const subjectTitle = quote.title?.trim() || projectLabel || t("quotes.detailTitle");
  const bankAccount = organization?.profile?.bankAccount?.trim();

  return (
    <article className={styles.sheet} aria-label={t("quotes.print.documentTitle")}>
      {isDraft ? (
        <div className={styles.draftWatermark} aria-hidden>
          {t("quotes.print.draftWatermark")}
        </div>
      ) : null}

      <header className={styles.header}>
        <div className={styles.logoArea}>
          <CompanyLogo organization={organization} />
        </div>
        <SupplierBlock organization={organization} t={t} />
      </header>

      <div className={styles.titleRow}>
        <h1 className={styles.docTitle}>
          {t("quotes.print.title")}
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

      <section className={styles.totals} aria-label={t("quotes.print.totals")}>
        <div className={styles.totalsRow}>
          <span>{t("projects.draft.quoteItem.subtotal")}</span>
          <span>{formatMoney(quote.subtotal, quote.currency)}</span>
        </div>
        <div className={styles.totalsRow}>
          <span>{t("projects.draft.quoteItem.vatLine", { percent: quote.vatPercent })}</span>
          <span>{formatMoney(quote.vatAmount, quote.currency)}</span>
        </div>
        <div className={styles.totalsRowGrand}>
          <span>{t("projects.draft.quoteItem.grandTotal")}</span>
          <span>{formatMoney(quote.grandTotal, quote.currency)}</span>
        </div>
      </section>

      <section className={styles.notes}>
        {quote.notes?.trim() ? (
          <>
            <p className={styles.notesTitle}>{t("projects.draft.quoteItem.notes")}</p>
            <p className={styles.notesBody}>{quote.notes.trim()}</p>
          </>
        ) : null}
        <p className={styles.notesBody}>{t("quotes.print.defaultConditions")}</p>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerRow}>
          <div className={styles.footerMain}>
            {bankAccount ? (
              <p>
                <span className={styles.footerLabel}>{t("quotes.print.bankAccount")}: </span>
                {bankAccount}
              </p>
            ) : null}
          </div>
          <span className={styles.footerDate}>{formatQuotePrintDate(new Date(), locale)}</span>
        </div>
        <div className={styles.stavetoBranding}>
          <p>{t("quotes.print.stavetoBrandingNote")}</p>
          <p>{t("quotes.print.stavetoWebsite")}</p>
        </div>
      </footer>
    </article>
  );
}
