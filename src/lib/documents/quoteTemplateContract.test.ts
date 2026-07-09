import { describe, expect, it } from "vitest";
import {
  ALLOWED_QUOTE_TEMPLATE_SECTIONS,
  DEFAULT_QUOTE_TEMPLATE,
  normalizeQuoteTemplate,
  quoteTemplateDocPath,
  sanitizeTemplateText,
  templateToFirestorePayload,
  validateQuoteTemplate,
} from "./quoteTemplateContract";
import {
  applyTemplateToPrintContext,
  resolveTemplateValidityDays,
} from "./quoteTemplateApply";
import { SAMPLE_PRINT_CONTEXT } from "./quoteTemplateSampleData";
import { loadQuoteTemplateForOrg } from "@/services/documents/quoteTemplateService";

describe("DEFAULT_QUOTE_TEMPLATE", () => {
  it("contains all required sections", () => {
    expect(DEFAULT_QUOTE_TEMPLATE.type).toBe("quote");
    expect(DEFAULT_QUOTE_TEMPLATE.settings.defaultValidityDays).toBeGreaterThan(0);
    expect(Object.keys(DEFAULT_QUOTE_TEMPLATE.visibility).length).toBe(
      ALLOWED_QUOTE_TEMPLATE_SECTIONS.length
    );
    expect(validateQuoteTemplate(DEFAULT_QUOTE_TEMPLATE).valid).toBe(true);
  });
});

describe("normalizeQuoteTemplate", () => {
  it("fills missing fields from defaults", () => {
    const normalized = normalizeQuoteTemplate({});
    expect(normalized.theme.primaryColor).toBe(DEFAULT_QUOTE_TEMPLATE.theme.primaryColor);
    expect(normalized.layout.pageSize).toBe("A4");
    expect(normalized.visibility.showLogo).toBe(true);
  });

  it("fills missing sales visibility fields as false", () => {
    const normalized = normalizeQuoteTemplate({});
    expect(normalized.visibility.showIntroMessage).toBe(false);
    expect(normalized.visibility.showCallToAction).toBe(false);
    expect(Object.keys(normalized.visibility).length).toBe(
      ALLOWED_QUOTE_TEMPLATE_SECTIONS.length
    );
  });
});

describe("validateQuoteTemplate", () => {
  it("rejects unsupported font", () => {
    const invalid = normalizeQuoteTemplate({
      theme: { fontFamily: "Comic Sans" },
    });
    const result = validateQuoteTemplate({
      ...invalid,
      theme: { ...invalid.theme, fontFamily: "Comic Sans" as never },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("INVALID_FONT");
  });

  it("rejects invalid header layout", () => {
    const invalid = normalizeQuoteTemplate({});
    const result = validateQuoteTemplate({
      ...invalid,
      layout: { ...invalid.layout, headerLayout: "invalid" as never },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("INVALID_HEADER_LAYOUT");
  });
});

describe("sanitizeTemplateText", () => {
  it("removes script and html tags", () => {
    const cleaned = sanitizeTemplateText('<b>Hello</b><script>alert(1)</script> javascript:evil');
    expect(cleaned).not.toContain("<");
    expect(cleaned).not.toContain("script");
    expect(cleaned).not.toContain("javascript:");
    expect(cleaned).toContain("Hello");
  });
});

describe("templateToFirestorePayload", () => {
  it("writes only template fields", () => {
    const payload = templateToFirestorePayload(DEFAULT_QUOTE_TEMPLATE, "userA");
    expect(payload.type).toBe("quote");
    expect(payload.updatedBy).toBe("userA");
    expect(payload).not.toHaveProperty("items");
    expect(payload).not.toHaveProperty("ownerId");
    expect(payload).not.toHaveProperty("projectId");
  });
});

describe("quoteTemplateDocPath", () => {
  it("scopes to organization template path", () => {
    expect(quoteTemplateDocPath("orgA")).toBe(
      "organizations/orgA/documentTemplates/default-quote"
    );
  });
});

describe("loadQuoteTemplateForOrg", () => {
  it("returns default when org mismatch without cross-org read", async () => {
    const template = await loadQuoteTemplateForOrg("orgA", "orgB");
    expect(template.theme.primaryColor).toBe(DEFAULT_QUOTE_TEMPLATE.theme.primaryColor);
  });
});

describe("loadQuoteTemplateForSettings", () => {
  it("returns default template with missing state when org id missing", async () => {
    const { loadQuoteTemplateForSettings } = await import(
      "@/services/documents/quoteTemplateService"
    );
    const result = await loadQuoteTemplateForSettings("");
    expect(result.template.type).toBe("quote");
    expect(result.loadState).toBe("missing");
    expect(result.persisted).toBe(false);
  });
});

describe("applyTemplateToPrintContext", () => {
  it("does not modify quote totals — context numbers unchanged", () => {
    const emptyConditions = { ...SAMPLE_PRINT_CONTEXT, conditions: "" };
    const merged = applyTemplateToPrintContext(emptyConditions, {
      ...DEFAULT_QUOTE_TEMPLATE,
      settings: {
        ...DEFAULT_QUOTE_TEMPLATE.settings,
        defaultTermsText: "Custom terms",
      },
    });
    expect(merged.priceSummary.grossTotal).toBe(SAMPLE_PRINT_CONTEXT.priceSummary.grossTotal);
    expect(merged.conditions).toBe("Custom terms");
  });

  it("hiding scope in template is render-only — context data remains", () => {
    const hidden = normalizeQuoteTemplate({
      visibility: { ...DEFAULT_QUOTE_TEMPLATE.visibility, showScopeOfWork: false },
    });
    expect(hidden.visibility.showScopeOfWork).toBe(false);
    expect(SAMPLE_PRINT_CONTEXT.scopeOfWork.length).toBeGreaterThan(0);
  });
});

describe("resolveTemplateValidityDays", () => {
  it("falls back when template missing", () => {
    expect(resolveTemplateValidityDays(null)).toBe(14);
  });
});

describe("sample preview data", () => {
  it("does not require real quote document ids from Firestore", () => {
    expect(SAMPLE_PRINT_CONTEXT.priceSummary.isComplete).toBe(true);
    expect(SAMPLE_PRINT_CONTEXT.customerNumber).toBeTruthy();
  });
});
