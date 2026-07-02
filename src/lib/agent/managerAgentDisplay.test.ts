import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AgentInsight } from "./managerAgentContract";
import {
  buildProactiveScreenKey,
  dismissHint,
  getDefaultDisplayMode,
  getFloatingDockLayout,
  hideProactiveOnScreen,
  isProactiveCandidate,
  isSnoozed,
  loadDisplayMode,
  loadDismissedHints,
  loadHiddenScreens,
  pruneHiddenScreensForWorkspace,
  selectProactiveInsight,
  shouldShowProactiveHint,
  snoozeHintsForHours,
} from "./managerAgentDisplay";
import { runManagerAgentLocalRules } from "./managerAgentLocalRules";
import {
  buildCompanySettingsAgentContext,
  buildNewProjectWizardAgentContext,
} from "./managerScreenContext";
import type { ActiveWorkspaceContext } from "@/lib/workspace/workspaceContract";

function mockWorkspace(): ActiveWorkspaceContext {
  return {
    activeWorkspaceId: "org-a",
    activeWorkspaceType: "company",
    activeWorkspaceName: "Org A",
    activeRole: "owner",
    activeCountryCode: "CH",
    activeCurrency: "CHF",
    activeTimezone: "Europe/Zurich",
    activeLanguage: "de",
    userPreferredLanguage: "en",
    activeMarketSource: "company_org",
    activeLocale: "de-CH",
    activeDefaultDocumentLanguage: "de",
    activeTaxProfile: null,
    activeLegalProfile: null,
    marketConfigVersion: 1,
    marketConfigWarnings: [],
  };
}

function localInsight(partial: Partial<AgentInsight> & Pick<AgentInsight, "id">): AgentInsight {
  return {
    severity: "warning",
    title: partial.title ?? "Title",
    message: partial.message ?? "Message",
    reason: partial.reason ?? "Reason",
    source: "local",
    confidence: "high",
    requiresConfirmation: false,
    ...partial,
  };
}

describe("managerAgentDisplay", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    const localStorageMock = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        storage = {};
      },
    };
    vi.stubGlobal("window", { localStorage: localStorageMock });
    vi.stubGlobal("localStorage", localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults display mode to proactive", () => {
    expect(getDefaultDisplayMode()).toBe("proactive");
    expect(loadDisplayMode()).toBe("proactive");
  });

  it("shows proactive hint only for useful local insights", () => {
    const insights = [
      localInsight({ id: "local-dashboard-next", severity: "info" }),
      localInsight({ id: "local-wizard-attachments", severity: "opportunity" }),
    ];
    expect(isProactiveCandidate(insights[0]!)).toBe(false);
    expect(selectProactiveInsight(insights)?.id).toBe("local-wizard-attachments");
  });

  it("does not show dismissed hints again", () => {
    dismissHint("local-ch-vat-missing");
    expect(loadDismissedHints()).toContain("local-ch-vat-missing");
    expect(
      shouldShowProactiveHint({
        displayMode: "proactive",
        hint: localInsight({ id: "local-ch-vat-missing" }),
        screenKey: "org-a:company_settings",
        inputFocused: false,
        modalOpen: false,
      })
    ).toBe(false);
  });

  it("suppresses hints while snoozed", () => {
    snoozeHintsForHours(1);
    expect(isSnoozed()).toBe(true);
    expect(
      shouldShowProactiveHint({
        displayMode: "proactive",
        hint: localInsight({ id: "local-project-location" }),
        screenKey: "org-a:project_detail",
        inputFocused: false,
        modalOpen: false,
      })
    ).toBe(false);
  });

  it("suppresses hints during focused input", () => {
    expect(
      shouldShowProactiveHint({
        displayMode: "proactive",
        hint: localInsight({ id: "local-project-location" }),
        screenKey: "org-a:project_detail",
        inputFocused: true,
        modalOpen: false,
      })
    ).toBe(false);
  });

  it("hides hints on screen when requested", () => {
    hideProactiveOnScreen("org-a:new_project_wizard");
    expect(loadHiddenScreens()).toContain("org-a:new_project_wizard");
  });

  it("prunes hidden screens to active workspace only", () => {
    hideProactiveOnScreen("org-a:quotes");
    hideProactiveOnScreen("org-b:quotes");
    pruneHiddenScreensForWorkspace("org-a");
    expect(loadHiddenScreens()).toEqual(["org-a:quotes"]);
  });

  it("keeps AI advisor dock stacked above messages without shared coordinates", () => {
    const layout = getFloatingDockLayout(false);
    expect(layout.dockClassName).toContain("flex-col-reverse");
    expect(layout.agentPanelShiftClassName).toBe("");
    expect(getFloatingDockLayout(true).agentPanelShiftClassName).toContain("translate-x");
  });

  it("builds stable screen keys per workspace", () => {
    expect(buildProactiveScreenKey("org-a", "project_detail")).toBe("org-a:project_detail");
  });
});

describe("proactive local rules integration", () => {
  it("produces CH MWST and wizard attachment hints without Gemini", () => {
    const companyCtx = buildCompanySettingsAgentContext({
      route: "/app/settings/company",
      userId: "user-1",
      workspaceCtx: mockWorkspace(),
      userRole: "owner",
      vatIdMissing: true,
    });
    const wizardCtx = buildNewProjectWizardAgentContext({
      route: "/app/projects/new",
      userId: "user-1",
      workspaceCtx: mockWorkspace(),
      userRole: "owner",
      hasAttachments: true,
      wizardStep: "ai-brief",
    });

    const companyInsights = runManagerAgentLocalRules(companyCtx!);
    const wizardInsights = runManagerAgentLocalRules(wizardCtx!);

    expect(companyInsights.some((i) => i.id === "local-ch-vat-missing")).toBe(true);
    expect(wizardInsights.some((i) => i.id === "local-wizard-attachments")).toBe(true);
    expect(companyInsights.every((i) => i.source === "local")).toBe(true);
  });

  it("does not suggest attachment draft on ai-review step", () => {
    const wizardCtx = buildNewProjectWizardAgentContext({
      route: "/app/projects/new",
      userId: "user-1",
      workspaceCtx: mockWorkspace(),
      userRole: "owner",
      hasAttachments: true,
      wizardStep: "ai-review",
    });
    const wizardInsights = runManagerAgentLocalRules(wizardCtx!);
    expect(wizardInsights.some((i) => i.id === "local-wizard-attachments")).toBe(false);
  });
});

describe("display mode behavior contracts", () => {
  it("off mode is not proactive", () => {
    expect(
      shouldShowProactiveHint({
        displayMode: "off",
        hint: localInsight({ id: "local-project-location" }),
        screenKey: "org-a:project_detail",
        inputFocused: false,
        modalOpen: false,
      })
    ).toBe(false);
  });

  it("minimized mode is not proactive", () => {
    expect(
      shouldShowProactiveHint({
        displayMode: "minimized",
        hint: localInsight({ id: "local-project-location" }),
        screenKey: "org-a:project_detail",
        inputFocused: false,
        modalOpen: false,
      })
    ).toBe(false);
  });
});
