import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIMPLIFIED_LEGACY_WORK_TYPE,
  isAiProjectCreationEnabled,
  isLegacyProjectTypeSettingsEnabled,
  isManualQuoteWorkspaceEnabled,
  isSimplifiedProjectCreationEnabled,
  projectCreateLandingHref,
  projectQuoteTabHref,
} from "./projectCreationFeature";

describe("projectCreationFeature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses customer_job as simplified legacy work type", () => {
    expect(SIMPLIFIED_LEGACY_WORK_TYPE).toBe("customer_job");
  });

  it("enables simplified creation by default", () => {
    expect(isSimplifiedProjectCreationEnabled()).toBe(true);
  });

  it("disables simplified creation when flag is 0", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SIMPLIFIED_PROJECT_CREATION", "0");
    expect(isSimplifiedProjectCreationEnabled()).toBe(false);
  });

  it("disables AI project creation by default", () => {
    expect(isAiProjectCreationEnabled()).toBe(false);
  });

  it("enables AI project creation only when explicitly set to 1", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_AI_PROJECT_CREATION", "1");
    expect(isAiProjectCreationEnabled()).toBe(true);
  });

  it("keeps AI project creation off when DISABLE_AI_GENERATION=1", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_AI_PROJECT_CREATION", "1");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_AI_GENERATION", "1");
    expect(isAiProjectCreationEnabled()).toBe(false);
  });

  it("hides legacy project type settings by default", () => {
    expect(isLegacyProjectTypeSettingsEnabled()).toBe(false);
  });

  it("enables manual quote workspace by default", () => {
    expect(isManualQuoteWorkspaceEnabled()).toBe(true);
  });

  it("disables manual quote workspace when flag is 0", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE", "0");
    expect(isManualQuoteWorkspaceEnabled()).toBe(false);
  });

  it("builds quote tab href", () => {
    expect(projectQuoteTabHref("abc")).toBe("/app/projects/abc?tab=quote");
  });

  it("lands create/copy on quote tab when manual workspace is on", () => {
    expect(projectCreateLandingHref("abc")).toBe("/app/projects/abc?tab=quote");
  });

  it("lands create/copy on project detail when manual workspace is off", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE", "0");
    expect(projectCreateLandingHref("abc")).toBe("/app/projects/abc");
  });
});
