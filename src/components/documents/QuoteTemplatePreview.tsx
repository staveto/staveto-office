"use client";

import { useMemo } from "react";
import { QuotePrintDocument } from "@/components/quotes/QuotePrintDocument";
import type { QuoteDocumentTemplate } from "@/lib/documents/quoteTemplateContract";
import {
  SAMPLE_ORGANIZATION,
  SAMPLE_PRINT_CONTEXT,
  SAMPLE_QUOTE,
} from "@/lib/documents/quoteTemplateSampleData";
import { applyTemplateToPrintContext } from "@/lib/documents/quoteTemplateApply";
import { useI18n } from "@/i18n/I18nContext";
import styles from "@/components/quotes/quote-print.module.css";

type QuoteTemplatePreviewProps = {
  template: QuoteDocumentTemplate;
};

/** Live preview with sample quote/customer data only. */
export function QuoteTemplatePreview({ template }: QuoteTemplatePreviewProps) {
  const { t, locale } = useI18n();
  const localeTag = locale === "de" ? "de-DE" : locale === "en" ? "en-GB" : "sk-SK";

  const printContext = useMemo(
    () => applyTemplateToPrintContext(SAMPLE_PRINT_CONTEXT, template),
    [template]
  );

  return (
    <div
      className={`${styles.page} bg-muted/30 rounded-xl border border-border p-4 overflow-auto max-h-[80vh]`}
    >
      <QuotePrintDocument
        quote={SAMPLE_QUOTE}
        organization={SAMPLE_ORGANIZATION}
        project={null}
        printContext={printContext}
        template={template}
        t={t}
        locale={localeTag}
      />
    </div>
  );
}
