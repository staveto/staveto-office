import type { QuoteDocumentTemplate } from "./quoteTemplateContract";

const FONT_STACK: Record<string, string> = {
  Inter: '"Inter", system-ui, sans-serif',
  Arial: "Arial, Helvetica, sans-serif",
  Helvetica: "Helvetica, Arial, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
};

const FONT_SIZE_PT: Record<string, string> = {
  compact: "10pt",
  normal: "11pt",
  large: "12pt",
};

const LOGO_HEIGHT: Record<string, string> = {
  small: "40px",
  medium: "56px",
  large: "72px",
};

const SHEET_PADDING: Record<string, string> = {
  compact: "14mm 12mm 12mm",
  normal: "18mm 16mm 16mm",
  wide: "22mm 20mm 18mm",
};

export type QuoteTemplateStyleProps = {
  className: string;
  style: Record<string, string>;
};

export function buildQuoteTemplateStyleProps(
  template: QuoteDocumentTemplate
): QuoteTemplateStyleProps {
  const { theme, layout } = template;
  const classes = [
    "quote-template-sheet",
    `quote-header-${layout.headerLayout}`,
    `quote-logo-${layout.logoSize}`,
    `quote-margin-${layout.margin}`,
    `quote-table-${layout.tableDensity}`,
    `quote-totals-${layout.totalsLayout}`,
    `quote-parties-${layout.customerSupplierLayout}`,
    `quote-signature-${layout.signatureLayout}`,
  ].join(" ");

  return {
    className: classes,
    style: {
      ["--qt-primary" as string]: theme.primaryColor,
      ["--qt-accent" as string]: theme.accentColor,
      ["--qt-text" as string]: theme.textColor,
      ["--qt-muted" as string]: theme.mutedTextColor,
      ["--qt-border" as string]: theme.borderColor,
      ["--qt-font" as string]: FONT_STACK[theme.fontFamily] ?? FONT_STACK.Inter,
      ["--qt-font-size" as string]: FONT_SIZE_PT[theme.fontSize] ?? FONT_SIZE_PT.normal,
      ["--qt-logo-height" as string]: LOGO_HEIGHT[layout.logoSize] ?? LOGO_HEIGHT.medium,
      ["--qt-sheet-padding" as string]: SHEET_PADDING[layout.margin] ?? SHEET_PADDING.normal,
    },
  };
}
