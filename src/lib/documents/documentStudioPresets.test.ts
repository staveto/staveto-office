import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE_TEMPLATE } from "@/lib/documents/quoteTemplateContract";
import {
  applyDocumentStudioPreset,
  detectActiveDocumentStudioPreset,
} from "@/lib/documents/documentStudioPresets";
import { SAMPLE_ORGANIZATION } from "@/lib/documents/quoteTemplateSampleData";

describe("applyDocumentStudioPreset", () => {
  it("updates visual fields only, keeps company default text settings", () => {
    const base = {
      ...DEFAULT_QUOTE_TEMPLATE,
      settings: {
        ...DEFAULT_QUOTE_TEMPLATE.settings,
        defaultTermsText: "Custom terms",
        defaultQuoteTitle: "Firemná ponuka",
      },
    };
    const next = applyDocumentStudioPreset(base, "premium-offer");
    expect(next.settings.defaultTermsText).toBe("Custom terms");
    expect(next.settings.defaultQuoteTitle).toBe("Firemná ponuka");
    expect(next.theme.accentColor).toBe("#C9A227");
    expect(next.layout.headerLayout).toBe("centered");
    expect(next.visibility.showStavetoBranding).toBe(false);
    expect(next.visibility.showIntroMessage).toBe(true);
  });

  it("does not mutate organization profile data (template only)", () => {
    const orgBefore = { ...SAMPLE_ORGANIZATION.profile };
    const base = {
      ...DEFAULT_QUOTE_TEMPLATE,
      settings: {
        ...DEFAULT_QUOTE_TEMPLATE.settings,
        defaultFooterText: "Footer from company template",
      },
    };
    applyDocumentStudioPreset(base, "slovak-builder");
    expect(SAMPLE_ORGANIZATION.profile).toEqual(orgBefore);
    expect(SAMPLE_ORGANIZATION.name).toBe("Sample Builder s.r.o.");
  });

  it("detects active preset after apply", () => {
    const applied = applyDocumentStudioPreset(DEFAULT_QUOTE_TEMPLATE, "modern-construction");
    expect(detectActiveDocumentStudioPreset(applied)).toBe("modern-construction");
  });

  it("returns null when template was customized beyond preset", () => {
    const applied = applyDocumentStudioPreset(DEFAULT_QUOTE_TEMPLATE, "modern-construction");
    const customized = {
      ...applied,
      theme: { ...applied.theme, primaryColor: "#000000" },
    };
    expect(detectActiveDocumentStudioPreset(customized)).toBeNull();
  });
});
