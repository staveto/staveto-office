import type {
  QuoteDocumentTemplate,
  QuoteTemplateLayout,
  QuoteTemplateTheme,
  QuoteTemplateVisibility,
} from "@/lib/documents/quoteTemplateContract";

export type DocumentStudioPresetId =
  | "modern-construction"
  | "classic-invoice"
  | "premium-offer"
  | "minimal-technical"
  | "slovak-builder";

export type DocumentStudioDocumentType =
  | "quote"
  | "invoice"
  | "advance_invoice"
  | "handover_protocol";

export type DocumentStudioPreset = {
  id: DocumentStudioPresetId;
  nameKey: string;
  descriptionKey: string;
  preview: {
    primaryColor: string;
    accentColor: string;
    headerLayout: QuoteTemplateLayout["headerLayout"];
  };
  theme: Partial<QuoteTemplateTheme>;
  layout: Partial<QuoteTemplateLayout>;
  visibility: Partial<QuoteTemplateVisibility>;
};

export const DOCUMENT_STUDIO_TYPES: {
  id: DocumentStudioDocumentType;
  labelKey: string;
  available: boolean;
}[] = [
  { id: "quote", labelKey: "settings.documentStudio.docType.quote", available: true },
  { id: "invoice", labelKey: "settings.documentStudio.docType.invoice", available: false },
  {
    id: "advance_invoice",
    labelKey: "settings.documentStudio.docType.advanceInvoice",
    available: false,
  },
  {
    id: "handover_protocol",
    labelKey: "settings.documentStudio.docType.handoverProtocol",
    available: false,
  },
];

export const DOCUMENT_STUDIO_PRESETS: DocumentStudioPreset[] = [
  {
    id: "modern-construction",
    nameKey: "settings.documentStudio.preset.modernConstruction.name",
    descriptionKey: "settings.documentStudio.preset.modernConstruction.description",
    preview: {
      primaryColor: "#1D376A",
      accentColor: "#E06737",
      headerLayout: "logo-left-company-right",
    },
    theme: {
      primaryColor: "#1D376A",
      accentColor: "#E06737",
      textColor: "#0F172A",
      mutedTextColor: "#64748B",
      borderColor: "#D8E1EA",
      fontFamily: "Inter",
      fontSize: "normal",
    },
    layout: {
      headerLayout: "logo-left-company-right",
      logoSize: "medium",
      tableDensity: "normal",
      totalsLayout: "right",
      signatureLayout: "classic",
      margin: "normal",
    },
    visibility: {
      showSummary: true,
      showScopeOfWork: true,
      showMaterialSection: true,
      showWorkSection: true,
      showStavetoBranding: true,
    },
  },
  {
    id: "classic-invoice",
    nameKey: "settings.documentStudio.preset.classicInvoice.name",
    descriptionKey: "settings.documentStudio.preset.classicInvoice.description",
    preview: {
      primaryColor: "#2C3E50",
      accentColor: "#8B5E3C",
      headerLayout: "company-left-logo-right",
    },
    theme: {
      primaryColor: "#2C3E50",
      accentColor: "#8B5E3C",
      textColor: "#1A1A1A",
      mutedTextColor: "#6B7280",
      borderColor: "#D1D5DB",
      fontFamily: "Georgia",
      fontSize: "compact",
    },
    layout: {
      headerLayout: "company-left-logo-right",
      logoSize: "small",
      tableDensity: "compact",
      totalsLayout: "full-width",
      signatureLayout: "classic",
      margin: "compact",
    },
    visibility: {
      showScopeOfWork: false,
      showSummary: true,
      showStavetoBranding: false,
    },
  },
  {
    id: "premium-offer",
    nameKey: "settings.documentStudio.preset.premiumOffer.name",
    descriptionKey: "settings.documentStudio.preset.premiumOffer.description",
    preview: {
      primaryColor: "#0F172A",
      accentColor: "#C9A227",
      headerLayout: "centered",
    },
    theme: {
      primaryColor: "#0F172A",
      accentColor: "#C9A227",
      textColor: "#111827",
      mutedTextColor: "#6B7280",
      borderColor: "#E5E7EB",
      fontFamily: "Georgia",
      fontSize: "large",
    },
    layout: {
      headerLayout: "centered",
      logoSize: "large",
      tableDensity: "normal",
      totalsLayout: "right",
      signatureLayout: "modern",
      margin: "wide",
    },
    visibility: {
      showSummary: true,
      showScopeOfWork: true,
      showSignatureBlock: true,
      showStavetoBranding: false,
    },
  },
  {
    id: "minimal-technical",
    nameKey: "settings.documentStudio.preset.minimalTechnical.name",
    descriptionKey: "settings.documentStudio.preset.minimalTechnical.description",
    preview: {
      primaryColor: "#334155",
      accentColor: "#64748B",
      headerLayout: "logo-left-company-right",
    },
    theme: {
      primaryColor: "#334155",
      accentColor: "#64748B",
      textColor: "#0F172A",
      mutedTextColor: "#94A3B8",
      borderColor: "#E2E8F0",
      fontFamily: "Inter",
      fontSize: "compact",
    },
    layout: {
      headerLayout: "logo-left-company-right",
      logoSize: "small",
      tableDensity: "compact",
      totalsLayout: "right",
      signatureLayout: "classic",
      margin: "compact",
    },
    visibility: {
      showScopeOfWork: false,
      showSummary: true,
      showContactBlock: false,
      showStavetoBranding: false,
    },
  },
  {
    id: "slovak-builder",
    nameKey: "settings.documentStudio.preset.slovakBuilder.name",
    descriptionKey: "settings.documentStudio.preset.slovakBuilder.description",
    preview: {
      primaryColor: "#1D376A",
      accentColor: "#E06737",
      headerLayout: "logo-left-company-right",
    },
    theme: {
      primaryColor: "#1D376A",
      accentColor: "#E06737",
      textColor: "#0F172A",
      mutedTextColor: "#475569",
      borderColor: "#CBD5E1",
      fontFamily: "Arial",
      fontSize: "normal",
    },
    layout: {
      headerLayout: "logo-left-company-right",
      logoSize: "medium",
      tableDensity: "normal",
      totalsLayout: "right",
      signatureLayout: "classic",
      margin: "normal",
    },
    visibility: {
      showRegistrationNumber: true,
      showCompanyAddress: true,
      showSummary: true,
      showScopeOfWork: true,
      showTerms: true,
      showSignatureBlock: true,
    },
  },
];

export function applyDocumentStudioPreset(
  template: QuoteDocumentTemplate,
  presetId: DocumentStudioPresetId
): QuoteDocumentTemplate {
  const preset = DOCUMENT_STUDIO_PRESETS.find((p) => p.id === presetId);
  if (!preset) return template;

  return {
    ...template,
    settings: { ...template.settings },
    theme: { ...template.theme, ...preset.theme },
    layout: { ...template.layout, ...preset.layout },
    visibility: { ...template.visibility, ...preset.visibility },
  };
}
