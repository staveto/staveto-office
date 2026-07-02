import { translations, type Locale } from "@/i18n/translations";
import { AGENT_TRANSLATIONS } from "./managerAgentTranslations";
import type { AgentInsight, AgentSuggestedAction } from "./managerAgentContract";

const FALLBACK_LOCALE: Locale = "en";

type InsightActionKeys = {
  label: string;
  description: string;
  confirmationText?: string;
};

type InsightTextKeys = {
  title: string;
  message: string;
  reason: string;
  action?: InsightActionKeys;
};

const LOCAL_INSIGHT_I18N: Record<string, InsightTextKeys> = {
  "local-company-country-missing": {
    title: "agent.insights.localCompanyCountryMissing.title",
    message: "agent.insights.localCompanyCountryMissing.message",
    reason: "agent.insights.localCompanyCountryMissing.reason",
    action: {
      label: "agent.insights.localCompanyCountryMissing.action.label",
      description: "agent.insights.localCompanyCountryMissing.action.description",
    },
  },
  "local-ch-vat-missing": {
    title: "agent.insights.localChVatMissing.title",
    message: "agent.insights.localChVatMissing.message",
    reason: "agent.insights.localChVatMissing.reason",
  },
  "local-company-legal-name": {
    title: "agent.insights.localCompanyLegalName.title",
    message: "agent.insights.localCompanyLegalName.message",
    reason: "agent.insights.localCompanyLegalName.reason",
  },
  "local-company-logo": {
    title: "agent.insights.localCompanyLogo.title",
    message: "agent.insights.localCompanyLogo.message",
    reason: "agent.insights.localCompanyLogo.reason",
  },
  "local-quote-currency-mismatch": {
    title: "agent.insights.localQuoteCurrencyMismatch.title",
    message: "agent.insights.localQuoteCurrencyMismatch.message",
    reason: "agent.insights.localQuoteCurrencyMismatch.reason",
  },
  "local-quote-customer-email": {
    title: "agent.insights.localQuoteCustomerEmail.title",
    message: "agent.insights.localQuoteCustomerEmail.message",
    reason: "agent.insights.localQuoteCustomerEmail.reason",
  },
  "local-quote-no-tasks": {
    title: "agent.insights.localQuoteNoTasks.title",
    message: "agent.insights.localQuoteNoTasks.message",
    reason: "agent.insights.localQuoteNoTasks.reason",
    action: {
      label: "agent.insights.localQuoteNoTasks.action.label",
      description: "agent.insights.localQuoteNoTasks.action.description",
    },
  },
  "local-project-no-members": {
    title: "agent.insights.localProjectNoMembers.title",
    message: "agent.insights.localProjectNoMembers.message",
    reason: "agent.insights.localProjectNoMembers.reason",
  },
  "local-project-location": {
    title: "agent.insights.localProjectLocation.title",
    message: "agent.insights.localProjectLocation.message",
    reason: "agent.insights.localProjectLocation.reason",
  },
  "local-project-no-tasks": {
    title: "agent.insights.localProjectNoTasks.title",
    message: "agent.insights.localProjectNoTasks.message",
    reason: "agent.insights.localProjectNoTasks.reason",
  },
  "local-project-docs-scope": {
    title: "agent.insights.localProjectDocsScope.title",
    message: "agent.insights.localProjectDocsScope.message",
    reason: "agent.insights.localProjectDocsScope.reason",
    action: {
      label: "agent.insights.localProjectDocsScope.action.label",
      description: "agent.insights.localProjectDocsScope.action.description",
      confirmationText: "agent.insights.localProjectDocsScope.action.confirmationText",
    },
  },
  "local-wizard-brief-short": {
    title: "agent.insights.localWizardBriefShort.title",
    message: "agent.insights.localWizardBriefShort.message",
    reason: "agent.insights.localWizardBriefShort.reason",
  },
  "local-wizard-attachments": {
    title: "agent.insights.localWizardAttachments.title",
    message: "agent.insights.localWizardAttachments.message",
    reason: "agent.insights.localWizardAttachments.reason",
    action: {
      label: "agent.insights.localWizardAttachments.action.label",
      description: "agent.insights.localWizardAttachments.action.description",
      confirmationText: "agent.insights.localWizardAttachments.action.confirmationText",
    },
  },
  "local-wizard-location": {
    title: "agent.insights.localWizardLocation.title",
    message: "agent.insights.localWizardLocation.message",
    reason: "agent.insights.localWizardLocation.reason",
  },
  "local-dashboard-delayed": {
    title: "agent.insights.localDashboardDelayed.title",
    message: "agent.insights.localDashboardDelayed.message",
    reason: "agent.insights.localDashboardDelayed.reason",
    action: {
      label: "agent.insights.localDashboardDelayed.action.label",
      description: "agent.insights.localDashboardDelayed.action.description",
    },
  },
  "local-dashboard-next": {
    title: "agent.insights.localDashboardNext.title",
    message: "agent.insights.localDashboardNext.message",
    reason: "agent.insights.localDashboardNext.reason",
  },
  "local-unsaved-changes": {
    title: "agent.insights.localUnsavedChanges.title",
    message: "agent.insights.localUnsavedChanges.message",
    reason: "agent.insights.localUnsavedChanges.reason",
  },
};

export type AgentSummaryKey =
  | "basicMode"
  | "localChecksComplete"
  | "analysisComplete"
  | "noWorkspace";

const SUMMARY_KEYS: Record<AgentSummaryKey, string> = {
  basicMode: "agent.summary.basicMode",
  localChecksComplete: "agent.summary.localChecksComplete",
  analysisComplete: "agent.summary.analysisComplete",
  noWorkspace: "agent.summary.noWorkspace",
};

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let result = text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(params[key] ?? `{{${key}}}`));
  result = result.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
  return result;
}

export function translateAgentText(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const agentText = AGENT_TRANSLATIONS[locale]?.[key];
  if (agentText) return interpolate(agentText, params);

  const primary = translations[locale]?.[key];
  if (primary) return interpolate(primary, params);
  if (locale !== FALLBACK_LOCALE) {
    const agentFallback = AGENT_TRANSLATIONS[FALLBACK_LOCALE]?.[key];
    if (agentFallback) return interpolate(agentFallback, params);
    const fallback = translations[FALLBACK_LOCALE]?.[key];
    if (fallback) return interpolate(fallback, params);
  }
  return key;
}

export function getAgentSummaryText(locale: Locale, key: AgentSummaryKey): string {
  return translateAgentText(locale, SUMMARY_KEYS[key]);
}

function localizeSuggestedAction(
  action: AgentSuggestedAction,
  keys: InsightActionKeys | undefined,
  locale: Locale
): AgentSuggestedAction {
  if (!keys) return action;
  return {
    ...action,
    label: translateAgentText(locale, keys.label),
    description: translateAgentText(locale, keys.description),
    confirmationText: keys.confirmationText
      ? translateAgentText(locale, keys.confirmationText)
      : action.confirmationText,
  };
}

export function localizeAgentInsight(insight: AgentInsight, locale: Locale): AgentInsight {
  if (insight.source !== "local") return insight;
  const keys = LOCAL_INSIGHT_I18N[insight.id];
  if (!keys) return insight;

  return {
    ...insight,
    title: translateAgentText(locale, keys.title),
    message: translateAgentText(locale, keys.message),
    reason: translateAgentText(locale, keys.reason),
    suggestedAction: insight.suggestedAction
      ? localizeSuggestedAction(insight.suggestedAction, keys.action, locale)
      : undefined,
  };
}

export function localizeAgentInsights(insights: AgentInsight[], locale: Locale): AgentInsight[] {
  return insights.map((insight) => localizeAgentInsight(insight, locale));
}

export function resolveAgentResponseLanguage(appLocale: Locale): Locale {
  return appLocale;
}

export function normalizeAgentSummary(
  summary: string | null | undefined,
  locale: Locale
): string | null {
  if (!summary) return null;
  const normalized = summary.trim().toLowerCase();
  if (normalized.includes("basic mode")) return getAgentSummaryText(locale, "basicMode");
  if (normalized.includes("local checks complete")) {
    return getAgentSummaryText(locale, "localChecksComplete");
  }
  if (normalized.includes("analysis complete")) {
    return getAgentSummaryText(locale, "analysisComplete");
  }
  if (normalized.includes("active workspace")) {
    return getAgentSummaryText(locale, "noWorkspace");
  }
  return summary;
}
