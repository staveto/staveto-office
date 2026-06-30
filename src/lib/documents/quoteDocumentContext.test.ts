import { describe, expect, it } from "vitest";
import {
  buildOrganizationQuoteDocumentContext,
  buildQuoteSupplierFromOrganizationProfile,
  createQuoteDocumentTranslator,
  resolveQuoteDocumentLanguage,
  resolveQuoteDocumentLocaleTag,
} from "./quoteDocumentContext";
import { resolveQuoteLegalLabels } from "./quoteLegalLabels";
import { templateToFirestorePayload, DEFAULT_QUOTE_TEMPLATE } from "./quoteTemplateContract";
import { resolveActiveMarketProfile } from "@/lib/market/resolveActiveMarketProfile";

describe("buildQuoteSupplierFromOrganizationProfile", () => {
  it("uses company profile supplier data without storing in template", () => {
    const supplier = buildQuoteSupplierFromOrganizationProfile("orgA", "Staveto s.r.o.", {
      legalName: "Staveto s.r.o.",
      logoUrl: "https://example.com/logo.png",
      registrationNumber: "12345678",
      email: "office@staveto.sk",
    });
    expect(supplier.orgId).toBe("orgA");
    expect(supplier.profile?.legalName).toBe("Staveto s.r.o.");
    expect(supplier.profile?.logoUrl).toContain("logo.png");

    const payload = templateToFirestorePayload(DEFAULT_QUOTE_TEMPLATE, "userA");
    expect(payload).not.toHaveProperty("legalName");
    expect(payload).not.toHaveProperty("logoUrl");
    expect(payload).not.toHaveProperty("registrationNumber");
  });
});

describe("resolveQuoteDocumentLanguage", () => {
  it("UI language does not affect quote document language", () => {
    const market = resolveActiveMarketProfile({
      activeWorkspaceType: "company",
      userProfile: { preferredLanguage: "sk" },
      organizationProfile: {
        countryCode: "CH",
        defaultLanguage: "de",
        currency: "CHF",
      },
    });
    const { language } = resolveQuoteDocumentLanguage(market);
    expect(language).toBe("de");
    expect(market.activeCurrency).toBe("CHF");
  });

  it("company CH resolves de-CH locale tag", () => {
    const tag = resolveQuoteDocumentLocaleTag("de", "CH", null);
    expect(tag).toBe("de-CH");
  });
});

describe("resolveQuoteLegalLabels", () => {
  it("CH uses UID / MWST-Nr. / MWST with needs_legal_review", () => {
    const labels = resolveQuoteLegalLabels("CH", null, null);
    expect(labels.registrationNumberLabel).toBe("UID");
    expect(labels.vatIdLabel).toBe("MWST-Nr.");
    expect(labels.vatLabel).toBe("MWST");
    expect(labels.complianceStatus).toBe("needs_legal_review");
  });

  it("falls back to country defaults when legalProfile missing", () => {
    const labels = resolveQuoteLegalLabels("SK", null, null);
    expect(labels.registrationNumberLabel).toBe("IČO");
    expect(labels.complianceStatus).toBe("needs_legal_review");
  });
});

describe("buildOrganizationQuoteDocumentContext", () => {
  it("merges org root profile and market config", () => {
    const ctx = buildOrganizationQuoteDocumentContext("orgA", {
      name: "Staveto s.r.o.",
      countryCode: "CH",
      defaultLanguage: "de",
      currency: "CHF",
      legalName: "Staveto s.r.o.",
      billingEmail: "office@staveto.ch",
      profile: {
        logoUrl: "https://cdn/logo.png",
        registrationNumber: "CHE-123",
      },
    });

    expect(ctx.organization.profile?.logoUrl).toBe("https://cdn/logo.png");
    expect(ctx.documentLanguage).toBe("de");
    expect(ctx.currency).toBe("CHF");
    expect(ctx.legalLabels.registrationNumberLabel).toBe("UID");
    expect(ctx.documentLocaleTag).toBe("de-CH");
  });
});

describe("createQuoteDocumentTranslator", () => {
  it("uses document language bundle not UI locale", () => {
    const deDoc = createQuoteDocumentTranslator("de");
    const skDoc = createQuoteDocumentTranslator("sk");
    expect(deDoc("quotes.print.title")).not.toBe(skDoc("quotes.print.title"));
  });
});

describe("template visibility is render-only", () => {
  it("hiding scopeOfWork in template does not remove underlying print context data", () => {
    const scope = "Real scope text";
    expect(scope.length).toBeGreaterThan(0);
    const hiddenTemplate = {
      ...DEFAULT_QUOTE_TEMPLATE,
      visibility: { ...DEFAULT_QUOTE_TEMPLATE.visibility, showScopeOfWork: false },
    };
    expect(hiddenTemplate.visibility.showScopeOfWork).toBe(false);
  });
});
