import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOrderedProjectDashboardTabs,
  isQuotePreparationPhase,
  resolveProjectDefaultTab,
  resolveProjectHeaderPrimaryAction,
} from "./projectDefaultTab";
import {
  getDashboardActions,
  getNextActionContent,
} from "./projectDashboard";
import {
  projectCreateLandingHref,
  projectQuoteTabHref,
} from "./projectCreationFeature";
import type { ProjectDoc } from "./projects";

function salesDraft(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
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

function deliveryProject(overrides: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    id: "proj-2",
    name: "Active",
    phase: "delivery",
    lifecycleStatus: "in_progress",
    salesStatus: "accepted",
    quoteStatus: "accepted",
    ...overrides,
  } as ProjectDoc;
}

describe("resolveProjectDefaultTab (Phase 1D)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("respects explicit valid tab (overview stays overview)", () => {
    expect(
      resolveProjectDefaultTab({
        requestedTab: "overview",
        projectPhase: "sales",
        lifecycleStatus: "new_request",
        quoteStatus: "none",
      })
    ).toBe("overview");
  });

  it("respects explicit documents tab", () => {
    expect(
      resolveProjectDefaultTab({
        requestedTab: "documents",
        projectPhase: "sales",
        lifecycleStatus: "new_request",
        quoteStatus: "none",
      })
    ).toBe("documents");
  });

  it("opens quote for sales/new_request without tab param", () => {
    expect(
      resolveProjectDefaultTab({
        requestedTab: null,
        projectPhase: "sales",
        lifecycleStatus: "new_request",
        quoteStatus: "none",
      })
    ).toBe("quote");
  });

  it("opens quote for quote draft without tab param", () => {
    expect(
      resolveProjectDefaultTab({
        requestedTab: null,
        projectPhase: "sales",
        lifecycleStatus: "quote_drafted",
        quoteStatus: "draft",
      })
    ).toBe("quote");
  });

  it("opens overview for accepted / delivery without tab param", () => {
    expect(
      resolveProjectDefaultTab({
        requestedTab: null,
        projectPhase: "delivery",
        lifecycleStatus: "in_progress",
        quoteStatus: "accepted",
      })
    ).toBe("overview");
    expect(
      resolveProjectDefaultTab({
        requestedTab: null,
        projectPhase: "sales",
        lifecycleStatus: "accepted",
        quoteStatus: "accepted",
      })
    ).toBe("overview");
  });

  it("keeps quote reachable when org quotes module is off", () => {
    expect(
      resolveProjectDefaultTab({
        requestedTab: "quote",
        projectPhase: "sales",
        lifecycleStatus: "new_request",
        quoteStatus: "none",
        modules: { quotes: false } as never,
      })
    ).toBe("quote");
  });

  it("falls back to overview when manual workspace is off and no tab", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE", "0");
    expect(
      resolveProjectDefaultTab({
        requestedTab: null,
        projectPhase: "sales",
        lifecycleStatus: "new_request",
        quoteStatus: "none",
        manualQuoteWorkspaceEnabled: false,
      })
    ).toBe("overview");
  });
});

describe("getOrderedProjectDashboardTabs (Phase 1D)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("puts quote first for draft / quote-prep project", () => {
    const tabs = getOrderedProjectDashboardTabs(salesDraft());
    expect(tabs[0]).toBe("quote");
    expect(tabs.indexOf("documents")).toBeLessThan(tabs.indexOf("overview"));
  });

  it("puts overview first for delivery project", () => {
    const tabs = getOrderedProjectDashboardTabs(deliveryProject());
    expect(tabs[0]).toBe("overview");
    expect(tabs.indexOf("overview")).toBeLessThan(tabs.indexOf("quote"));
  });
});

describe("post-create / copy landing (Phase 1D)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("create and copy land on ?tab=quote", () => {
    expect(projectCreateLandingHref("new-1")).toBe("/app/projects/new-1?tab=quote");
    expect(projectQuoteTabHref("copy-1")).toBe("/app/projects/copy-1?tab=quote");
  });

  it("upload-after-create still uses same landing href (tab preserved)", () => {
    // NewJobForm uploads then router.push(projectCreateLandingHref) — tab is not stripped.
    const afterUpload = projectCreateLandingHref("with-docs");
    expect(afterUpload).toContain("tab=quote");
    expect(afterUpload).not.toContain("tab=overview");
  });
});

describe("quote-prep CTAs (Phase 1D)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("quote-prep overview has single continue-quote CTA, no add-material", () => {
    const actions = getDashboardActions(salesDraft());
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe("continue-quote");
    expect(actions[0]?.href).toBe("/app/projects/proj-1?tab=quote");
    expect(actions.some((a) => a.id === "add-material")).toBe(false);
  });

  it("simplifies next-step card copy for quote prep", () => {
    const content = getNextActionContent(salesDraft());
    expect(content.statusKey).toBe("projects.dashboard.next.status.continueQuote");
    expect(content.badgeKey).toBeNull();
  });

  it("isQuotePreparationPhase reads ProjectDoc.phase", () => {
    expect(isQuotePreparationPhase(salesDraft())).toBe(true);
    expect(isQuotePreparationPhase(deliveryProject())).toBe(false);
  });
});

describe("header primary CTA (Phase 1D)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("quote-prep project does not use open work plan as primary CTA", () => {
    const onQuote = resolveProjectHeaderPrimaryAction({
      project: salesDraft(),
      activeTab: "quote",
    });
    const elsewhere = resolveProjectHeaderPrimaryAction({
      project: salesDraft(),
      activeTab: "overview",
    });
    expect(onQuote.labelKey).toBe("projects.cockpit.cta.previewQuote");
    expect(elsewhere.labelKey).toBe("projects.cockpit.cta.continueQuote");
    expect(onQuote.labelKey).not.toBe("projects.cockpit.cta.openPlan");
    expect(elsewhere.labelKey).not.toBe("projects.cockpit.cta.openPlan");
  });

  it("delivery project keeps open work plan as primary CTA", () => {
    const action = resolveProjectHeaderPrimaryAction({
      project: deliveryProject(),
      hasUrgent: false,
    });
    expect(action).toEqual({
      tab: "workplan",
      labelKey: "projects.cockpit.cta.openPlan",
    });
  });
});

describe("historical AI setup link (Phase 1D)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("setup=ai path remains available when manual workspace is off", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE", "0");
    const actions = getDashboardActions(salesDraft({ quoteStatus: "none" }));
    expect(actions[0]?.href).toContain("setup=ai");
  });
});
