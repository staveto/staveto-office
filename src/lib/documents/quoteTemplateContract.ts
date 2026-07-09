/**
 * Company-scoped quote document template contract (Phase 1.6A).
 * No arbitrary HTML/CSS/JS — validated enums and sanitized text only.
 */

export const DEFAULT_QUOTE_TEMPLATE_ID = "default-quote";

export const ALLOWED_QUOTE_TEMPLATE_FONTS = [
  "Inter",
  "Arial",
  "Helvetica",
  "Georgia",
] as const;

export type QuoteTemplateFontFamily = (typeof ALLOWED_QUOTE_TEMPLATE_FONTS)[number];

export type QuoteTemplateFontSize = "compact" | "normal" | "large";
export type QuoteTemplateMargin = "compact" | "normal" | "wide";
export type QuoteTemplateLogoSize = "small" | "medium" | "large";
export type QuoteTemplateHeaderLayout =
  | "logo-left-company-right"
  | "company-left-logo-right"
  | "centered";
export type QuoteTemplateCustomerSupplierLayout = "two-columns" | "stacked";
export type QuoteTemplateTotalsLayout = "right" | "full-width";
export type QuoteTemplateTableDensity = "compact" | "normal";
export type QuoteTemplateSignatureLayout = "classic" | "modern";

export type QuoteTemplateSettings = {
  defaultValidityDays: number;
  defaultTermsText: string;
  defaultPaymentNote: string;
  defaultFooterText: string;
  defaultQuoteTitle: string;
};

export type QuoteTemplateTheme = {
  primaryColor: string;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  fontFamily: QuoteTemplateFontFamily;
  fontSize: QuoteTemplateFontSize;
};

export type QuoteTemplateLayout = {
  pageSize: "A4";
  margin: QuoteTemplateMargin;
  headerLayout: QuoteTemplateHeaderLayout;
  logoSize: QuoteTemplateLogoSize;
  customerSupplierLayout: QuoteTemplateCustomerSupplierLayout;
  totalsLayout: QuoteTemplateTotalsLayout;
  tableDensity: QuoteTemplateTableDensity;
  signatureLayout: QuoteTemplateSignatureLayout;
};

export type QuoteTemplateVisibility = {
  showLogo: boolean;
  showCompanyAddress: boolean;
  showRegistrationNumber: boolean;
  showContactPerson: boolean;
  showCustomerNumber: boolean;
  showProjectNumber: boolean;
  showCurrency: boolean;
  showSummary: boolean;
  showScopeOfWork: boolean;
  showMaterialSection: boolean;
  showWorkSection: boolean;
  showTerms: boolean;
  showContactBlock: boolean;
  showSignatureBlock: boolean;
  showStavetoBranding: boolean;
  showIntroMessage: boolean;
  showIncludedInPrice: boolean;
  showNotIncludedInPrice: boolean;
  showTimeline: boolean;
  showPaymentMilestones: boolean;
  showWhyChooseUs: boolean;
  showReferences: boolean;
  showCallToAction: boolean;
};

export type QuoteDocumentTemplate = {
  type: "quote";
  name: string;
  isDefault: boolean;
  settings: QuoteTemplateSettings;
  theme: QuoteTemplateTheme;
  layout: QuoteTemplateLayout;
  visibility: QuoteTemplateVisibility;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export const ALLOWED_QUOTE_TEMPLATE_SECTIONS = [
  "logo",
  "companyAddress",
  "registrationNumber",
  "contactPerson",
  "customerNumber",
  "projectNumber",
  "currency",
  "summary",
  "scopeOfWork",
  "materialSection",
  "workSection",
  "terms",
  "contactBlock",
  "signatureBlock",
  "stavetoBranding",
  "introMessage",
  "includedInPrice",
  "notIncludedInPrice",
  "timeline",
  "paymentMilestones",
  "whyChooseUs",
  "references",
  "callToAction",
] as const;

const MAX_TEXT_FIELD_LENGTH = 4000;
const MAX_TITLE_LENGTH = 120;
const MIN_VALIDITY_DAYS = 1;
const MAX_VALIDITY_DAYS = 365;

const HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

const DEFAULT_SETTINGS: QuoteTemplateSettings = {
  defaultValidityDays: 14,
  defaultTermsText: "",
  defaultPaymentNote: "",
  defaultFooterText: "",
  defaultQuoteTitle: "",
};

const DEFAULT_THEME: QuoteTemplateTheme = {
  primaryColor: "#1D376A",
  accentColor: "#E06737",
  textColor: "#0F172A",
  mutedTextColor: "#64748B",
  borderColor: "#D8E1EA",
  fontFamily: "Inter",
  fontSize: "normal",
};

const DEFAULT_LAYOUT: QuoteTemplateLayout = {
  pageSize: "A4",
  margin: "normal",
  headerLayout: "logo-left-company-right",
  logoSize: "medium",
  customerSupplierLayout: "two-columns",
  totalsLayout: "right",
  tableDensity: "normal",
  signatureLayout: "classic",
};

const DEFAULT_VISIBILITY: QuoteTemplateVisibility = {
  showLogo: true,
  showCompanyAddress: true,
  showRegistrationNumber: true,
  showContactPerson: true,
  showCustomerNumber: true,
  showProjectNumber: true,
  showCurrency: true,
  showSummary: true,
  showScopeOfWork: true,
  showMaterialSection: true,
  showWorkSection: true,
  showTerms: true,
  showContactBlock: true,
  showSignatureBlock: true,
  showStavetoBranding: true,
  showIntroMessage: false,
  showIncludedInPrice: false,
  showNotIncludedInPrice: false,
  showTimeline: false,
  showPaymentMilestones: false,
  showWhyChooseUs: false,
  showReferences: false,
  showCallToAction: false,
};

export const DEFAULT_QUOTE_TEMPLATE: QuoteDocumentTemplate = {
  type: "quote",
  name: "Default quote",
  isDefault: true,
  settings: { ...DEFAULT_SETTINGS },
  theme: { ...DEFAULT_THEME },
  layout: { ...DEFAULT_LAYOUT },
  visibility: { ...DEFAULT_VISIBILITY },
};

function pickString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function pickColor(value: unknown, fallback: string): string {
  if (typeof value === "string" && HEX_COLOR.test(value.trim())) {
    return value.trim().toUpperCase();
  }
  return fallback;
}

function pickValidityDays(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < MIN_VALIDITY_DAYS) return MIN_VALIDITY_DAYS;
  if (rounded > MAX_VALIDITY_DAYS) return MAX_VALIDITY_DAYS;
  return rounded;
}

export function sanitizeTemplateText(value: string, maxLen = MAX_TEXT_FIELD_LENGTH): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim()
    .slice(0, maxLen);
}

function normalizeSettings(raw: unknown): QuoteTemplateSettings {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    defaultValidityDays: pickValidityDays(
      input.defaultValidityDays,
      DEFAULT_SETTINGS.defaultValidityDays
    ),
    defaultTermsText: sanitizeTemplateText(
      pickString(input.defaultTermsText, MAX_TEXT_FIELD_LENGTH)
    ),
    defaultPaymentNote: sanitizeTemplateText(
      pickString(input.defaultPaymentNote, MAX_TEXT_FIELD_LENGTH)
    ),
    defaultFooterText: sanitizeTemplateText(
      pickString(input.defaultFooterText, MAX_TEXT_FIELD_LENGTH)
    ),
    defaultQuoteTitle: sanitizeTemplateText(
      pickString(input.defaultQuoteTitle, MAX_TITLE_LENGTH)
    ),
  };
}

function normalizeTheme(raw: unknown): QuoteTemplateTheme {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    primaryColor: pickColor(input.primaryColor, DEFAULT_THEME.primaryColor),
    accentColor: pickColor(input.accentColor, DEFAULT_THEME.accentColor),
    textColor: pickColor(input.textColor, DEFAULT_THEME.textColor),
    mutedTextColor: pickColor(input.mutedTextColor, DEFAULT_THEME.mutedTextColor),
    borderColor: pickColor(input.borderColor, DEFAULT_THEME.borderColor),
    fontFamily: pickEnum(input.fontFamily, ALLOWED_QUOTE_TEMPLATE_FONTS, DEFAULT_THEME.fontFamily),
    fontSize: pickEnum(input.fontSize, ["compact", "normal", "large"] as const, DEFAULT_THEME.fontSize),
  };
}

function normalizeLayout(raw: unknown): QuoteTemplateLayout {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    pageSize: "A4",
    margin: pickEnum(input.margin, ["compact", "normal", "wide"] as const, DEFAULT_LAYOUT.margin),
    headerLayout: pickEnum(
      input.headerLayout,
      [
        "logo-left-company-right",
        "company-left-logo-right",
        "centered",
      ] as const,
      DEFAULT_LAYOUT.headerLayout
    ),
    logoSize: pickEnum(
      input.logoSize,
      ["small", "medium", "large"] as const,
      DEFAULT_LAYOUT.logoSize
    ),
    customerSupplierLayout: pickEnum(
      input.customerSupplierLayout,
      ["two-columns", "stacked"] as const,
      DEFAULT_LAYOUT.customerSupplierLayout
    ),
    totalsLayout: pickEnum(
      input.totalsLayout,
      ["right", "full-width"] as const,
      DEFAULT_LAYOUT.totalsLayout
    ),
    tableDensity: pickEnum(
      input.tableDensity,
      ["compact", "normal"] as const,
      DEFAULT_LAYOUT.tableDensity
    ),
    signatureLayout: pickEnum(
      input.signatureLayout,
      ["classic", "modern"] as const,
      DEFAULT_LAYOUT.signatureLayout
    ),
  };
}

function normalizeVisibility(raw: unknown): QuoteTemplateVisibility {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_VISIBILITY;
  return {
    showLogo: pickBoolean(input.showLogo, d.showLogo),
    showCompanyAddress: pickBoolean(input.showCompanyAddress, d.showCompanyAddress),
    showRegistrationNumber: pickBoolean(input.showRegistrationNumber, d.showRegistrationNumber),
    showContactPerson: pickBoolean(input.showContactPerson, d.showContactPerson),
    showCustomerNumber: pickBoolean(input.showCustomerNumber, d.showCustomerNumber),
    showProjectNumber: pickBoolean(input.showProjectNumber, d.showProjectNumber),
    showCurrency: pickBoolean(input.showCurrency, d.showCurrency),
    showSummary: pickBoolean(input.showSummary, d.showSummary),
    showScopeOfWork: pickBoolean(input.showScopeOfWork, d.showScopeOfWork),
    showMaterialSection: pickBoolean(input.showMaterialSection, d.showMaterialSection),
    showWorkSection: pickBoolean(input.showWorkSection, d.showWorkSection),
    showTerms: pickBoolean(input.showTerms, d.showTerms),
    showContactBlock: pickBoolean(input.showContactBlock, d.showContactBlock),
    showSignatureBlock: pickBoolean(input.showSignatureBlock, d.showSignatureBlock),
    showStavetoBranding: pickBoolean(input.showStavetoBranding, d.showStavetoBranding),
    showIntroMessage: pickBoolean(input.showIntroMessage, d.showIntroMessage),
    showIncludedInPrice: pickBoolean(input.showIncludedInPrice, d.showIncludedInPrice),
    showNotIncludedInPrice: pickBoolean(input.showNotIncludedInPrice, d.showNotIncludedInPrice),
    showTimeline: pickBoolean(input.showTimeline, d.showTimeline),
    showPaymentMilestones: pickBoolean(input.showPaymentMilestones, d.showPaymentMilestones),
    showWhyChooseUs: pickBoolean(input.showWhyChooseUs, d.showWhyChooseUs),
    showReferences: pickBoolean(input.showReferences, d.showReferences),
    showCallToAction: pickBoolean(input.showCallToAction, d.showCallToAction),
  };
}

export function normalizeQuoteTemplate(
  raw: unknown,
  meta?: { updatedAt?: string; updatedBy?: string; createdAt?: string }
): QuoteDocumentTemplate {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const base = DEFAULT_QUOTE_TEMPLATE;

  return {
    type: "quote",
    name: pickString(input.name, 120) || base.name,
    isDefault: pickBoolean(input.isDefault, true),
    settings: normalizeSettings(input.settings),
    theme: normalizeTheme(input.theme),
    layout: normalizeLayout(input.layout),
    visibility: normalizeVisibility(input.visibility),
    createdAt: meta?.createdAt,
    updatedAt: meta?.updatedAt,
    updatedBy: meta?.updatedBy,
  };
}

export type QuoteTemplateValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateQuoteTemplate(template: QuoteDocumentTemplate): QuoteTemplateValidationResult {
  const errors: string[] = [];

  if (template.type !== "quote") errors.push("INVALID_TYPE");
  if (!ALLOWED_QUOTE_TEMPLATE_FONTS.includes(template.theme.fontFamily)) {
    errors.push("INVALID_FONT");
  }
  if (!["logo-left-company-right", "company-left-logo-right", "centered"].includes(template.layout.headerLayout)) {
    errors.push("INVALID_HEADER_LAYOUT");
  }
  for (const key of ["primaryColor", "accentColor", "textColor", "mutedTextColor", "borderColor"] as const) {
    if (!HEX_COLOR.test(template.theme[key])) errors.push(`INVALID_COLOR_${key}`);
  }

  return { valid: errors.length === 0, errors };
}

export function quoteTemplateDocPath(orgId: string, templateId = DEFAULT_QUOTE_TEMPLATE_ID): string {
  return `organizations/${orgId}/documentTemplates/${templateId}`;
}

export function parseQuoteTemplateDoc(
  data: Record<string, unknown>,
  meta?: { updatedAt?: string; updatedBy?: string; createdAt?: string }
): QuoteDocumentTemplate {
  return normalizeQuoteTemplate(data, meta);
}

export function templateToFirestorePayload(
  template: QuoteDocumentTemplate,
  updatedBy: string
): Record<string, unknown> {
  const normalized = normalizeQuoteTemplate(template);
  validateQuoteTemplate(normalized);
  return {
    type: "quote",
    name: normalized.name,
    isDefault: normalized.isDefault,
    settings: normalized.settings,
    theme: normalized.theme,
    layout: normalized.layout,
    visibility: normalized.visibility,
    updatedBy,
  };
}
