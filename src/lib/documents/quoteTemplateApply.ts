import type { QuotePrintContext } from "@/lib/quoteDocumentMeta";
import type { QuoteDocumentTemplate } from "./quoteTemplateContract";
import { DEFAULT_QUOTE_TEMPLATE } from "./quoteTemplateContract";

/** Appearance-only merge — does not change quote totals or line items. */
export function applyTemplateToPrintContext(
  context: QuotePrintContext,
  template: QuoteDocumentTemplate | null | undefined,
  options?: { usedDefaultConditions?: boolean }
): QuotePrintContext {
  const tpl = template ?? DEFAULT_QUOTE_TEMPLATE;
  const settings = tpl.settings;

  let conditions = context.conditions;
  if (options?.usedDefaultConditions && settings.defaultTermsText.trim()) {
    conditions = settings.defaultTermsText.trim();
  } else if (!context.conditions.trim() && settings.defaultTermsText.trim()) {
    conditions = settings.defaultTermsText.trim();
  }

  let paymentTerms = context.paymentTerms;
  if (!paymentTerms?.trim() && settings.defaultPaymentNote.trim()) {
    paymentTerms = settings.defaultPaymentNote.trim();
  }

  return {
    ...context,
    conditions,
    paymentTerms,
  };
}

export function resolveQuoteDocumentTitle(
  template: QuoteDocumentTemplate | null | undefined,
  fallback: string
): string {
  const custom = template?.settings.defaultQuoteTitle?.trim();
  return custom || fallback;
}

export function resolveTemplateFooterText(
  template: QuoteDocumentTemplate | null | undefined
): string | undefined {
  const text = template?.settings.defaultFooterText?.trim();
  return text || undefined;
}

export function resolveTemplateValidityDays(
  template: QuoteDocumentTemplate | null | undefined
): number {
  return template?.settings.defaultValidityDays ?? DEFAULT_QUOTE_TEMPLATE.settings.defaultValidityDays;
}
