import { describe, expect, it } from "vitest";
import { buildWizardPath, getNextStep, getPrevStep } from "./newJobWizardTypes";

describe("newJobWizardTypes simplified path", () => {
  it("builds contact → manual-details for simplified manual", () => {
    expect(buildWizardPath("manual", { simplified: true })).toEqual([
      "contact",
      "manual-details",
    ]);
  });

  it("builds copy sub-path without AI or type steps", () => {
    expect(buildWizardPath("copy", { simplified: true })).toEqual([
      "contact",
      "copy-source",
      "copy-options",
      "copy-details",
    ]);
  });

  it("never includes AI steps when simplified even if method is ai", () => {
    // simplified ignores ai method and falls back to manual path
    expect(buildWizardPath("ai", { simplified: true })).toEqual([
      "contact",
      "manual-details",
    ]);
  });

  it("navigates next/prev on simplified path", () => {
    const opts = { simplified: true as const };
    expect(getNextStep("contact", "manual", opts)).toBe("manual-details");
    expect(getNextStep("manual-details", "manual", opts)).toBeNull();
    expect(getPrevStep("manual-details", "manual", opts)).toBe("contact");
  });

  it("keeps legacy path when simplified is off", () => {
    expect(buildWizardPath("manual")).toEqual([
      "type",
      "contact",
      "method",
      "manual-details",
      "concept",
    ]);
  });
});
