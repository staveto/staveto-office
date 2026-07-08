import { describe, expect, it } from "vitest";
import { DEFAULT_QUOTE_TEMPLATE } from "@/lib/documents/quoteTemplateContract";
import { applyDocumentStudioPreset } from "@/lib/documents/documentStudioPresets";

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
  });
});
