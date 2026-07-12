import { describe, expect, it } from "vitest";
import { resolveEstimatorCountryProfile } from "./estimatorCountryProfile";

describe("resolveEstimatorCountryProfile", () => {
  it("never returns null/undefined currency when overrides pass null", () => {
    const profile = resolveEstimatorCountryProfile("SK", {
      currency: null as unknown as string,
      vatPercent: null as unknown as number,
      language: null as unknown as string,
    });
    expect(profile.currency).toBe("EUR");
    expect(profile.language).toBe("sk");
    expect(typeof profile.vatPercent).toBe("number");
  });

  it("defaults unknown country to SK profile currency", () => {
    const profile = resolveEstimatorCountryProfile(null);
    expect(profile.countryCode).toBe("SK");
    expect(profile.currency).toBe("EUR");
  });
});
