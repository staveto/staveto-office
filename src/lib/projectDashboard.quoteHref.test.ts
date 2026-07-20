import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDashboardActions,
  getListPrimaryAction,
  getProjectQuoteHref,
} from "./projectDashboard";
import type { ProjectDoc } from "./projects";

function salesProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    id: "proj-1",
    name: "Job",
    phase: "sales",
    lifecycleStatus: "new_request",
    salesStatus: "draft",
    quoteStatus: "none",
    ...overrides,
  } as ProjectDoc;
}

describe("projectDashboard quote hrefs (Phase 1B)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("points prepare/open quote to ?tab=quote when manual workspace is on", () => {
    expect(getProjectQuoteHref(salesProject())).toBe(
      "/app/projects/proj-1?tab=quote"
    );
    expect(getListPrimaryAction(salesProject()).href).toBe(
      "/app/projects/proj-1?tab=quote"
    );
    const actions = getDashboardActions(salesProject());
    expect(actions[0]?.href).toBe("/app/projects/proj-1?tab=quote");
    expect(actions[0]?.labelKey).toBe("projects.dashboard.action.continueQuote");
    expect(actions.every((a) => !a.href?.includes("setup=ai"))).toBe(true);
  });

  it("falls back to setup=ai when manual workspace flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE", "0");
    expect(getProjectQuoteHref(salesProject())).toBe(
      "/app/projects/proj-1?setup=ai"
    );
    expect(getListPrimaryAction(salesProject()).href).toBe(
      "/app/projects/proj-1?setup=ai"
    );
  });
});
