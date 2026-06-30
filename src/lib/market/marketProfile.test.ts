import { describe, expect, it } from "vitest";
import { readSoloMarketProfile } from "./marketProfileAdapters";
import { resolveActiveMarketProfile } from "./resolveActiveMarketProfile";

describe("readSoloMarketProfile", () => {
  it("uses soloCountryCode and never preferredLanguage as country", () => {
    const result = readSoloMarketProfile({
      preferredLanguage: "sk",
      soloCountryCode: "CH",
    });
    expect(result.resolvedCountryCode).toBe("CH");
    expect(result.warnings).not.toContain("legacy_primaryCountry_fallback");
  });

  it("falls back to primaryCountry with legacy warning", () => {
    const result = readSoloMarketProfile({
      primaryCountry: "SK",
    });
    expect(result.resolvedCountryCode).toBe("SK");
    expect(result.warnings).toContain("legacy_primaryCountry_fallback");
  });
});

describe("resolveActiveMarketProfile", () => {
  it("solo: explicit soloCountryCode CH with UI sk", () => {
    const market = resolveActiveMarketProfile({
      activeWorkspaceType: "solo",
      userProfile: {
        preferredLanguage: "sk",
        soloCountryCode: "CH",
      },
      userPreferredLanguage: "sk",
    });
    expect(market.activeMarketSource).toBe("solo_user");
    expect(market.activeCountryCode).toBe("CH");
    expect(market.activeCurrency).toBe("CHF");
    expect(market.activeTimezone).toBe("Europe/Zurich");
  });

  it("solo: legacy primaryCountry SK when soloCountryCode missing", () => {
    const market = resolveActiveMarketProfile({
      activeWorkspaceType: "solo",
      userProfile: { primaryCountry: "SK" },
    });
    expect(market.activeCountryCode).toBe("SK");
    expect(market.marketConfigWarnings).toContain("legacy_primaryCountry_fallback");
  });

  it("company: uses org country and ignores user solo/primary country", () => {
    const market = resolveActiveMarketProfile({
      activeWorkspaceType: "company",
      userProfile: {
        soloCountryCode: "SK",
        primaryCountry: "SK",
        preferredLanguage: "sk",
      },
      organizationProfile: { countryCode: "CH" },
    });
    expect(market.activeMarketSource).toBe("company_org");
    expect(market.activeCountryCode).toBe("CH");
    expect(market.activeCurrency).toBe("CHF");
    expect(market.marketConfigWarnings).not.toContain("legacy_primaryCountry_fallback");
  });

  it("company: missing org country does not use user primaryCountry", () => {
    const market = resolveActiveMarketProfile({
      activeWorkspaceType: "company",
      userProfile: { primaryCountry: "SK", preferredLanguage: "sk" },
      organizationProfile: {},
    });
    expect(market.activeCountryCode).toBeNull();
    expect(market.marketConfigWarnings).toContain("company_country_missing");
    expect(market.marketConfigWarnings).not.toContain("legacy_primaryCountry_fallback");
  });

  it("preferredLanguage de is never used as country", () => {
    const market = resolveActiveMarketProfile({
      activeWorkspaceType: "solo",
      userProfile: { preferredLanguage: "de" },
      userPreferredLanguage: "de",
    });
    expect(market.activeCountryCode).not.toBe("DE");
    expect(market.marketConfigWarnings).toContain("preferred_language_not_used_as_country");
    expect(market.marketConfigWarnings).toContain("solo_country_missing");
  });
});
