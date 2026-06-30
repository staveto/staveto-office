"use client";

import { useMemo } from "react";
import { QuotePrintDocument } from "@/components/quotes/QuotePrintDocument";
import type { QuoteDocumentTemplate } from "@/lib/documents/quoteTemplateContract";
import type { OrganizationQuoteDocumentContext } from "@/lib/documents/quoteDocumentContext";
import {
  SAMPLE_PRINT_CONTEXT,
  SAMPLE_QUOTE,
} from "@/lib/documents/quoteTemplateSampleData";
import { applyTemplateToPrintContext } from "@/lib/documents/quoteTemplateApply";

type QuoteTemplatePreviewProps = {
  template: QuoteDocumentTemplate;
  organizationContext: OrganizationQuoteDocumentContext | null;
};

/**
 * Live preview document — real company supplier data, sample customer/quote content only.
 * Wrap with QuoteTemplatePreviewFrame for zoom and scroll chrome.
 */
export function QuoteTemplatePreview({
  template,
  organizationContext,
}: QuoteTemplatePreviewProps) {
  const documentT = organizationContext?.translateDocument ?? ((key: string) => key);
  const localeTag = organizationContext?.documentLocaleTag ?? "en-GB";

  const sampleQuote = useMemo(
    () => ({
      ...SAMPLE_QUOTE,
      currency: organizationContext?.currency ?? SAMPLE_QUOTE.currency,
      orgId: organizationContext?.organization.orgId ?? SAMPLE_QUOTE.orgId,
    }),
    [organizationContext]
  );

  const printContext = useMemo(() => {
    const ctx = {
      ...SAMPLE_PRINT_CONTEXT,
      currency: organizationContext?.currency ?? SAMPLE_PRINT_CONTEXT.currency,
    };
    return applyTemplateToPrintContext(ctx, template);
  }, [template, organizationContext?.currency]);

  const organization = organizationContext?.organization ?? null;

  return (
    <QuotePrintDocument
      quote={sampleQuote}
      organization={organization}
      project={null}
      printContext={printContext}
      template={template}
      legalLabels={organizationContext?.legalLabels ?? null}
      useCompanySupplier
      t={documentT}
      locale={localeTag}
    />
  );
}
