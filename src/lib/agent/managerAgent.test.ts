import { describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@/lib/workspace/workspaceContract";
import {
  buildCompanySettingsAgentContext,
  buildDashboardAgentContext,
  buildNewProjectWizardAgentContext,
  buildProjectDetailAgentContext,
  buildQuoteDetailAgentContext,
  isValidManagerScreenContext,
} from "@/lib/agent/managerScreenContext";
import {
  mergeAgentInsights,
  runManagerAgentLocalRules,
} from "@/lib/agent/managerAgentLocalRules";
import { analyzeManagerScreenLocally } from "@/services/agent/managerAgentService";
import { localizeAgentInsight } from "@/lib/agent/managerAgentI18n";

function mockWorkspace(overrides: Partial<ActiveWorkspaceContext> = {}): ActiveWorkspaceContext {
  return {
    activeWorkspaceId: "org-a",
    activeWorkspaceType: "company",
    activeWorkspaceName: "Org A",
    activeRole: "owner",
    activeCountryCode: "SK",
    activeCurrency: "EUR",
    activeTimezone: "Europe/Bratislava",
    activeLanguage: "sk",
    userPreferredLanguage: "en",
    activeMarketSource: "company_org",
    activeLocale: "sk-SK",
    activeDefaultDocumentLanguage: "sk",
    activeTaxProfile: null,
    activeLegalProfile: null,
    marketConfigVersion: 1,
    marketConfigWarnings: [],
    ...overrides,
  };
}

const baseInput = {
  route: "/app/settings/company",
  userId: "user-1",
  workspaceCtx: mockWorkspace(),
  userRole: "owner" as const,
  userPreferredLanguage: "en",
};

describe("manager screen context", () => {
  it("does not include global data when workspace is missing", () => {
    const ctx = buildDashboardAgentContext({
      route: "/app",
      userId: "user-1",
      workspaceCtx: null,
      userRole: "owner",
    });
    expect(ctx).toBeNull();
  });

  it("returns no context when active workspace is missing", () => {
    expect(
      buildDashboardAgentContext({
        route: "/app",
        userId: "user-1",
        workspaceCtx: mockWorkspace({ activeWorkspaceId: "" }),
        userRole: "owner",
      })
    ).toBeNull();
    expect(isValidManagerScreenContext(null)).toBe(false);
  });

  it("scopes quote advice to active workspace only", () => {
    const ctx = buildQuoteDetailAgentContext({
      ...baseInput,
      route: "/app/quotes/q-1",
      quoteId: "q-1",
      quoteCurrency: "EUR",
      quoteAccepted: true,
      projectTaskCount: 0,
      linkedProjectId: "proj-1",
    });
    expect(ctx?.activeWorkspaceId).toBe("org-a");
    expect(ctx?.warnings).toContain("accepted_quote_without_tasks");
    expect(ctx?.selectedAction).toBe("/app/projects/proj-1");
  });

  it("scopes project advice to active workspace only", () => {
    const ctx = buildProjectDetailAgentContext({
      ...baseInput,
      route: "/app/projects/p-1",
      projectId: "p-1",
      hasLocation: false,
      hasTasks: false,
    });
    expect(ctx?.activeWorkspaceId).toBe("org-a");
    expect(ctx?.missingFields).toContain("location");
    expect(ctx?.missingFields).toContain("tasks");
  });
});

describe("manager agent local rules", () => {
  it("warns for CH company without MWST/UID", () => {
    const ctx = buildCompanySettingsAgentContext({
      ...baseInput,
      workspaceCtx: mockWorkspace({ activeCountryCode: "CH" }),
      vatIdMissing: true,
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.warnings).toContain("ch_vat_id_missing");
    const insights = runManagerAgentLocalRules(ctx!);
    expect(insights.some((i) => i.id === "local-ch-vat-missing")).toBe(true);
  });

  it("does not let preferredLanguage change company market advice", () => {
    const skCtx = buildCompanySettingsAgentContext({
      ...baseInput,
      userPreferredLanguage: "de",
      registeredCountryMissing: true,
    });
    const enCtx = buildCompanySettingsAgentContext({
      ...baseInput,
      userPreferredLanguage: "en",
      registeredCountryMissing: true,
    });
    const skInsights = runManagerAgentLocalRules(skCtx!);
    const enInsights = runManagerAgentLocalRules(enCtx!);
    expect(skInsights.map((i) => i.id)).toEqual(enInsights.map((i) => i.id));
    expect(skInsights[0]?.message).toBe(enInsights[0]?.message);
  });

  it("requires confirmation for suggested actions", () => {
    const ctx = buildQuoteDetailAgentContext({
      ...baseInput,
      route: "/app/quotes/q-2",
      quoteId: "q-2",
      quoteAccepted: true,
      projectTaskCount: 0,
      linkedProjectId: "proj-9",
    });
    const insights = runManagerAgentLocalRules(ctx!);
    const withAction = insights.find((i) => i.suggestedAction);
    expect(withAction?.requiresConfirmation).toBe(true);
    expect(withAction?.suggestedAction?.type).toBe("navigate");
  });
});

describe("manager agent service", () => {
  it("does not write Firestore during insight generation", async () => {
    const firestoreSpy = vi.fn();
    const ctx = buildDashboardAgentContext({
      route: "/app",
      userId: "user-1",
      workspaceCtx: mockWorkspace(),
      userRole: "owner",
      delayedJobCount: 2,
    });
    const result = analyzeManagerScreenLocally(ctx, "en");
    expect(firestoreSpy).not.toHaveBeenCalled();
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it("localizes wizard insights to the app locale", () => {
    const ctx = buildNewProjectWizardAgentContext({
      ...baseInput,
      route: "/app/projects/new",
      hasAttachments: true,
      wizardStep: "ai-brief",
    });
    const raw = runManagerAgentLocalRules(ctx!);
    const attachment = raw.find((i) => i.id === "local-wizard-attachments");
    expect(attachment?.title).toBe("Attachments can power the AI draft");

    const localized = localizeAgentInsight(attachment!, "sk");
    expect(localized.title).toBe("Prílohy môžu podporiť AI návrh");
    expect(localized.suggestedAction?.label).toBe("Pokračovať s AI návrhom");

    const result = analyzeManagerScreenLocally(ctx, "sk");
    expect(result.summary).toBe("Lokálne kontroly dokončené.");
    expect(
      result.insights.find((i) => i.id === "local-wizard-attachments")?.message
    ).toContain("PDF");
  });

  it("returns empty insights for invalid screen context", () => {
    const result = analyzeManagerScreenLocally(null, "en");
    expect(result.insights).toEqual([]);
    expect(result.summary).toContain("workspace");
  });

  it("still shows local insights when AI is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_DISABLE_AI_GENERATION", "1");
    const ctx = buildCompanySettingsAgentContext({
      ...baseInput,
      legalNameMissing: true,
    });
    const { askManagerAgent } = await import("@/services/agent/managerAgentService");
    const result = await askManagerAgent({
      screenContext: ctx!,
      mode: "analyze_screen",
      locale: "en",
    });
    expect(result.aiEnabled).toBe(false);
    expect(result.insights.some((i) => i.id === "local-company-legal-name")).toBe(true);
    expect(result.summary).toContain("basic mode");
    vi.unstubAllEnvs();
  });

  it("rejects cross-organization context at validation layer", () => {
    const orgA = buildDashboardAgentContext({
      route: "/app",
      userId: "user-a",
      workspaceCtx: mockWorkspace({ activeWorkspaceId: "org-a" }),
      userRole: "owner",
    });
    const orgB = buildDashboardAgentContext({
      route: "/app",
      userId: "user-b",
      workspaceCtx: mockWorkspace({ activeWorkspaceId: "org-b", activeWorkspaceName: "Org B" }),
      userRole: "owner",
    });
    expect(orgA?.activeWorkspaceId).toBe("org-a");
    expect(orgB?.activeWorkspaceId).toBe("org-b");
    expect(orgA?.activeWorkspaceId).not.toBe(orgB?.activeWorkspaceId);
  });
});

describe("mergeAgentInsights", () => {
  it("deduplicates insight ids", () => {
    const merged = mergeAgentInsights(
      [
        {
          id: "a",
          severity: "info",
          title: "A",
          message: "A",
          reason: "A",
          source: "local",
          confidence: "high",
          requiresConfirmation: false,
        },
      ],
      [
        {
          id: "a",
          severity: "warning",
          title: "A2",
          message: "A2",
          reason: "A2",
          source: "gemini",
          confidence: "medium",
          requiresConfirmation: false,
        },
      ]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("local");
  });
});
