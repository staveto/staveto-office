import type { ActiveWorkspaceContext } from "@/lib/workspace/workspaceContract";
import type { WorkspaceRole } from "@/types/workspace";

export type ManagerScreenType =
  | "dashboard"
  | "projects"
  | "project_detail"
  | "quotes"
  | "quote_detail"
  | "company_settings"
  | "quote_settings"
  | "new_project_wizard"
  | "unknown";

export type ManagerScreenContext = {
  screenType: ManagerScreenType;
  route: string;
  activeWorkspaceId: string | null;
  activeWorkspaceType: "personal" | "company" | null;
  activeWorkspaceName: string | null;
  userRole: WorkspaceRole | null;
  userId: string | null;
  userPreferredLanguage: string | null;
  companyCountryCode: string | null;
  companyCurrency: string | null;
  companyLocale: string | null;
  companyDefaultLanguage: string | null;
  visibleEntityType: string | null;
  visibleEntityId: string | null;
  visibleEntitySummary: string | null;
  warnings: string[];
  missingFields: string[];
  unsavedChanges: boolean;
  selectedAction: string | null;
  timestamp: string;
};

export type AgentContextBaseInput = {
  route: string;
  userId: string | null;
  workspaceCtx: ActiveWorkspaceContext | null;
  userRole: WorkspaceRole | null;
  userPreferredLanguage?: string | null;
};

export type DashboardAgentInput = AgentContextBaseInput & {
  activeProjectCount?: number;
  openQuoteCount?: number;
  delayedJobCount?: number;
};

export type ProjectsAgentInput = AgentContextBaseInput & {
  visibleProjectCount?: number;
};

export type ProjectDetailAgentInput = AgentContextBaseInput & {
  projectId: string;
  projectName?: string | null;
  projectStatus?: string | null;
  hasTasks?: boolean;
  hasLocation?: boolean;
  hasAssignedMembers?: boolean;
  hasAttachments?: boolean;
  unsavedChanges?: boolean;
};

export type QuotesAgentInput = AgentContextBaseInput & {
  visibleQuoteCount?: number;
};

export type QuoteDetailAgentInput = AgentContextBaseInput & {
  quoteId: string;
  quoteTitle?: string | null;
  quoteStatus?: string | null;
  quoteAccepted?: boolean;
  quoteCurrency?: string | null;
  customerEmailMissing?: boolean;
  projectTaskCount?: number;
  linkedProjectId?: string | null;
  unsavedChanges?: boolean;
};

export type CompanySettingsAgentInput = AgentContextBaseInput & {
  legalNameMissing?: boolean;
  logoMissing?: boolean;
  vatIdMissing?: boolean;
  registeredCountryMissing?: boolean;
  bankAccountMissing?: boolean;
};

export type NewProjectWizardAgentInput = AgentContextBaseInput & {
  briefLength?: number;
  hasAttachments?: boolean;
  locationMissing?: boolean;
  projectNameMissing?: boolean;
  /** Wizard step id from NewJobForm — used to avoid stale AI hints on ai-review. */
  wizardStep?: string | null;
};

const EMPTY_CONTEXT: ManagerScreenContext = {
  screenType: "unknown",
  route: "",
  activeWorkspaceId: null,
  activeWorkspaceType: null,
  activeWorkspaceName: null,
  userRole: null,
  userId: null,
  userPreferredLanguage: null,
  companyCountryCode: null,
  companyCurrency: null,
  companyLocale: null,
  companyDefaultLanguage: null,
  visibleEntityType: null,
  visibleEntityId: null,
  visibleEntitySummary: null,
  warnings: [],
  missingFields: [],
  unsavedChanges: false,
  selectedAction: null,
  timestamp: new Date(0).toISOString(),
};

function resolveWorkspaceFields(workspaceCtx: ActiveWorkspaceContext | null): {
  activeWorkspaceId: string | null;
  activeWorkspaceType: "personal" | "company" | null;
  activeWorkspaceName: string | null;
  companyCountryCode: string | null;
  companyCurrency: string | null;
  companyLocale: string | null;
  companyDefaultLanguage: string | null;
} {
  if (!workspaceCtx) {
    return {
      activeWorkspaceId: null,
      activeWorkspaceType: null,
      activeWorkspaceName: null,
      companyCountryCode: null,
      companyCurrency: null,
      companyLocale: null,
      companyDefaultLanguage: null,
    };
  }

  return {
    activeWorkspaceId: workspaceCtx.activeWorkspaceId,
    activeWorkspaceType:
      workspaceCtx.activeWorkspaceType === "company" ? "company" : "personal",
    activeWorkspaceName: workspaceCtx.activeWorkspaceName,
    companyCountryCode: workspaceCtx.activeCountryCode,
    companyCurrency: workspaceCtx.activeCurrency,
    companyLocale: workspaceCtx.activeLocale,
    companyDefaultLanguage: workspaceCtx.activeDefaultDocumentLanguage,
  };
}

function assertWorkspaceScoped(input: AgentContextBaseInput): boolean {
  if (!input.userId?.trim()) return false;
  if (!input.workspaceCtx) return false;
  return Boolean(resolveWorkspaceFields(input.workspaceCtx).activeWorkspaceId);
}

function buildBase(
  screenType: ManagerScreenType,
  input: AgentContextBaseInput,
  extra: Partial<ManagerScreenContext> = {}
): ManagerScreenContext | null {
  if (!assertWorkspaceScoped(input)) return null;

  const ws = resolveWorkspaceFields(input.workspaceCtx);

  return {
    screenType,
    route: input.route,
    activeWorkspaceId: ws.activeWorkspaceId,
    activeWorkspaceType: ws.activeWorkspaceType,
    activeWorkspaceName: ws.activeWorkspaceName,
    userRole: input.userRole,
    userId: input.userId,
    userPreferredLanguage: input.userPreferredLanguage ?? null,
    companyCountryCode: ws.companyCountryCode,
    companyCurrency: ws.companyCurrency,
    companyLocale: ws.companyLocale,
    companyDefaultLanguage: ws.companyDefaultLanguage,
    visibleEntityType: null,
    visibleEntityId: null,
    visibleEntitySummary: null,
    warnings: [],
    missingFields: [],
    unsavedChanges: false,
    selectedAction: null,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

export function detectManagerScreenType(route: string): ManagerScreenType {
  const path = route.split("?")[0]?.replace(/\/$/, "") || "";

  if (path === "/app" || path === "/app/dashboard") return "dashboard";
  if (path === "/app/projects/new") return "new_project_wizard";
  if (/^\/app\/projects\/[^/]+$/.test(path) && path !== "/app/projects/new") {
    return "project_detail";
  }
  if (path === "/app/projects") return "projects";
  if (/^\/app\/quotes\/[^/]+$/.test(path) && path !== "/app/quotes/new") {
    return "quote_detail";
  }
  if (path === "/app/quotes" || path === "/app/quotes/new") return "quotes";
  if (path === "/app/settings/company") return "company_settings";
  if (path.startsWith("/app/settings/quotes")) return "quote_settings";
  return "unknown";
}

export function extractEntityIdFromRoute(
  route: string,
  screenType: ManagerScreenType
): string | null {
  const path = route.split("?")[0] ?? "";
  if (screenType === "project_detail") {
    const match = path.match(/^\/app\/projects\/([^/]+)$/);
    return match?.[1] ?? null;
  }
  if (screenType === "quote_detail") {
    const match = path.match(/^\/app\/quotes\/([^/]+)$/);
    return match?.[1] ?? null;
  }
  return null;
}

export function buildDashboardAgentContext(input: DashboardAgentInput): ManagerScreenContext | null {
  const ctx = buildBase("dashboard", input);
  if (!ctx) return null;

  const warnings: string[] = [];
  if ((input.delayedJobCount ?? 0) > 0) {
    warnings.push("delayed_jobs_in_workspace");
  }

  const summaryParts = [
    input.activeProjectCount != null ? `${input.activeProjectCount} active projects` : null,
    input.openQuoteCount != null ? `${input.openQuoteCount} open quotes` : null,
  ].filter(Boolean);

  return {
    ...ctx,
    visibleEntityType: "dashboard",
    visibleEntitySummary: summaryParts.length ? summaryParts.join(", ") : "Workspace dashboard",
    warnings,
  };
}

export function buildProjectsAgentContext(input: ProjectsAgentInput): ManagerScreenContext | null {
  const ctx = buildBase("projects", input);
  if (!ctx) return null;

  return {
    ...ctx,
    visibleEntityType: "projects_list",
    visibleEntitySummary:
      input.visibleProjectCount != null
        ? `${input.visibleProjectCount} projects in active workspace`
        : "Project list",
  };
}

export function buildProjectDetailAgentContext(
  input: ProjectDetailAgentInput
): ManagerScreenContext | null {
  const ctx = buildBase("project_detail", input, {
    visibleEntityType: "project",
    visibleEntityId: input.projectId,
    visibleEntitySummary: input.projectName?.trim() || `Project ${input.projectId}`,
    unsavedChanges: input.unsavedChanges ?? false,
  });
  if (!ctx) return null;

  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (input.hasLocation === false) missingFields.push("location");
  if (input.hasAssignedMembers === false) warnings.push("no_assigned_members");
  if (input.hasTasks === false) missingFields.push("tasks");
  if (input.hasAttachments === true) {
    missingFields.push("scope_from_documents");
  }

  return { ...ctx, missingFields, warnings };
}

export function buildQuotesAgentContext(input: QuotesAgentInput): ManagerScreenContext | null {
  const ctx = buildBase("quotes", input);
  if (!ctx) return null;

  return {
    ...ctx,
    visibleEntityType: "quotes_list",
    visibleEntitySummary:
      input.visibleQuoteCount != null
        ? `${input.visibleQuoteCount} quotes in active workspace`
        : "Quote list",
  };
}

export function buildQuoteDetailAgentContext(input: QuoteDetailAgentInput): ManagerScreenContext | null {
  const ctx = buildBase("quote_detail", input, {
    visibleEntityType: "quote",
    visibleEntityId: input.quoteId,
    visibleEntitySummary: input.quoteTitle?.trim() || `Quote ${input.quoteId}`,
    unsavedChanges: input.unsavedChanges ?? false,
  });
  if (!ctx) return null;

  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (input.customerEmailMissing) missingFields.push("customer_email");
  if (
    input.quoteCurrency &&
    ctx.companyCurrency &&
    input.quoteCurrency !== ctx.companyCurrency
  ) {
    warnings.push("quote_currency_mismatch");
  }
  if (input.quoteAccepted && (input.projectTaskCount ?? 0) === 0) {
    warnings.push("accepted_quote_without_tasks");
  }

  return {
    ...ctx,
    missingFields,
    warnings,
    selectedAction:
      input.quoteAccepted &&
      (input.projectTaskCount ?? 0) === 0 &&
      input.linkedProjectId?.trim()
        ? `/app/projects/${input.linkedProjectId.trim()}`
        : ctx.selectedAction,
  };
}

export function buildCompanySettingsAgentContext(
  input: CompanySettingsAgentInput
): ManagerScreenContext | null {
  const ctx = buildBase("company_settings", input, {
    visibleEntityType: "company_profile",
  });
  if (!ctx) return null;

  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (input.registeredCountryMissing || !ctx.companyCountryCode) {
    missingFields.push("registered_country");
  }
  if (input.legalNameMissing) missingFields.push("legal_name");
  if (input.logoMissing) missingFields.push("logo");
  if (input.bankAccountMissing) missingFields.push("bank_account");

  const country = ctx.companyCountryCode?.toUpperCase();
  if (country === "CH" && input.vatIdMissing) {
    warnings.push("ch_vat_id_missing");
  }

  return { ...ctx, missingFields, warnings };
}

export function buildNewProjectWizardAgentContext(
  input: NewProjectWizardAgentInput
): ManagerScreenContext | null {
  const ctx = buildBase("new_project_wizard", input, {
    visibleEntityType: "new_project_wizard",
  });
  if (!ctx) return null;

  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (input.projectNameMissing) missingFields.push("project_name");
  if (input.locationMissing) missingFields.push("location");
  if ((input.briefLength ?? 0) > 0 && (input.briefLength ?? 0) < 40) {
    warnings.push("brief_too_short");
  }
  if (input.hasAttachments && input.wizardStep === "ai-brief") {
    missingFields.push("ai_brief_from_attachments");
  }

  return { ...ctx, missingFields, warnings };
}

export function buildQuoteSettingsAgentContext(input: AgentContextBaseInput): ManagerScreenContext | null {
  return buildBase("quote_settings", input, {
    visibleEntityType: "quote_settings",
    visibleEntitySummary: "Quote template settings",
  });
}

export function buildUnknownAgentContext(input: AgentContextBaseInput): ManagerScreenContext | null {
  return buildBase("unknown", input);
}

export function isValidManagerScreenContext(ctx: ManagerScreenContext | null): ctx is ManagerScreenContext {
  if (!ctx) return false;
  if (!ctx.userId?.trim()) return false;
  if (!ctx.activeWorkspaceId?.trim()) return false;
  if (!ctx.timestamp) return false;
  return true;
}

export function emptyManagerScreenContext(): ManagerScreenContext {
  return { ...EMPTY_CONTEXT };
}
