import { describe, expect, it } from "vitest";
import {
  buildCompanyProfileSaveMarketPayload,
  buildOrganizationMarketFields,
  getCompanyMarketConfig,
  getComplianceStatusLabel,
  resolveOrganizationMarketPreview,
} from "./companyMarketConfig";
import { resolveSupportedCountryCode } from "./countryOptions";
import { resolveActiveMarketProfile } from "./resolveActiveMarketProfile";

describe("getCompanyMarketConfig", () => {
  it("CH config returns CHF, Europe/Zurich, de-CH, de", () => {
    const config = getCompanyMarketConfig("CH");
    expect(config).not.toBeNull();
    expect(config?.currency).toBe("CHF");
    expect(config?.timezone).toBe("Europe/Zurich");
    expect(config?.locale).toBe("de-CH");
    expect(config?.defaultLanguage).toBe("de");
  });

  it("CH legal labels are UID, Unternehmens-ID, MWST-Nr., MWST", () => {
    const config = getCompanyMarketConfig("CH");
    expect(config?.legalProfile.companyRegistrationNumberLabel).toBe("UID");
    expect(config?.legalProfile.taxIdLabel).toBe("Unternehmens-ID");
    expect(config?.legalProfile.vatIdLabel).toBe("MWST-Nr.");
    expect(config?.taxProfile.vatLabel).toBe("MWST");
  });

  it("handles missing or unsupported country safely", () => {
    expect(getCompanyMarketConfig(null)).toBeNull();
    expect(getCompanyMarketConfig("US")).toBeNull();
    expect(
      resolveOrganizationMarketPreview(null, null).missingCountry
    ).toBe(true);
  });
});

describe("buildOrganizationMarketFields", () => {
  it("returns only organization market fields for CH", () => {
    const fields = buildOrganizationMarketFields("CH");
    expect(fields).toMatchObject({
      countryCode: "CH",
      currency: "CHF",
      timezone: "Europe/Zurich",
      locale: "de-CH",
      defaultLanguage: "de",
      marketConfigVersion: 1,
    });
    expect(fields?.taxProfile?.complianceStatus).toBe("needs_legal_review");
    expect(fields?.legalProfile?.complianceStatus).toBe("needs_legal_review");
  });

  it("does not include users.primaryCountry", () => {
    const fields = buildOrganizationMarketFields("SK") as Record<string, unknown>;
    expect(fields).not.toHaveProperty("primaryCountry");
    expect(fields).not.toHaveProperty("soloCountryCode");
    expect(fields).not.toHaveProperty("preferredLanguage");
  });

  it("does not include users.soloCountryCode", () => {
    const payload = buildCompanyProfileSaveMarketPayload("DE", "user-1");
    expect(payload).not.toHaveProperty("soloCountryCode");
    expect(payload).not.toHaveProperty("primaryCountry");
  });

  it("save payload does not include quote or project fields", () => {
    const payload = buildCompanyProfileSaveMarketPayload("AT", "user-1") ?? {};
    expect(payload).not.toHaveProperty("quotes");
    expect(payload).not.toHaveProperty("projects");
    expect(payload).not.toHaveProperty("items");
  });

  it("includes market config version and compliance status", () => {
    const fields = buildOrganizationMarketFields("SK");
    expect(fields?.marketConfigVersion).toBe(1);
    expect(getComplianceStatusLabel()).toBe("needs_legal_review");
  });
});

describe("resolveOrganizationMarketPreview", () => {
  it("UI language SK + company country CH keeps market CH", () => {
    const preview = resolveOrganizationMarketPreview(
      { countryCode: "CH" },
      "CH",
      "sk"
    );
    expect(preview.countryCode).toBe("CH");
    expect(preview.currency).toBe("CHF");
    expect(preview.defaultLanguage).toBe("de");
    expect(preview.countryDisplayName).toBe("Švajčiarsko");
  });

  it("maps legacy profile.country CH to supported code", () => {
    expect(resolveSupportedCountryCode(null, "CH")).toBe("CH");
    expect(resolveSupportedCountryCode(null, "Switzerland")).toBe("CH");
  });
});

describe("resolveActiveMarketProfile", () => {
  it("company market does not use user primaryCountry", () => {
    const market = resolveActiveMarketProfile({
      activeWorkspaceType: "company",
      userProfile: { primaryCountry: "SK", preferredLanguage: "sk" },
      organizationProfile: { countryCode: "CH" },
    });
    expect(market.activeCountryCode).toBe("CH");
    expect(market.activeCurrency).toBe("CHF");
  });
});

describe("company country dropdown contract", () => {
  it("supported country codes are fixed ISO values", () => {
    const codes = ["SK", "CZ", "DE", "AT", "CH"];
    for (const code of codes) {
      expect(buildOrganizationMarketFields(code)?.countryCode).toBe(code);
    }
  });
});
