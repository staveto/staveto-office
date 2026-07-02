import type {
  AgentInsightMode,
  AskManagerAgentResult,
} from "@/lib/agent/managerAgentContract";
import type { ManagerScreenContext } from "@/lib/agent/managerScreenContext";
import type { Locale } from "@/i18n/translations";
import { getAiCallable } from "@/lib/firebase";
import {
  getAgentSummaryText,
  localizeAgentInsights,
  normalizeAgentSummary,
} from "@/lib/agent/managerAgentI18n";
import {
  isWizardAiGenerationEnabled,
} from "@/services/ai/aiWizardGenerationService";
import {
  mergeAgentInsights,
  runManagerAgentLocalRules,
} from "@/lib/agent/managerAgentLocalRules";
import { isValidManagerScreenContext } from "@/lib/agent/managerScreenContext";

export function isManagerAgentAiEnabled(): boolean {
  return isWizardAiGenerationEnabled();
}

export async function askManagerAgent(params: {
  screenContext: ManagerScreenContext;
  mode: AgentInsightMode;
  question?: string;
  locale: Locale;
}): Promise<AskManagerAgentResult> {
  if (!isValidManagerScreenContext(params.screenContext)) {
    throw new Error("INVALID_SCREEN_CONTEXT");
  }

  const localInsights = localizeAgentInsights(
    runManagerAgentLocalRules(params.screenContext),
    params.locale
  );
  const aiEnabled = isManagerAgentAiEnabled();

  if (!aiEnabled) {
    return {
      insights: localInsights,
      summary: getAgentSummaryText(params.locale, "basicMode"),
      aiEnabled: false,
    };
  }

  try {
    const fn = getAiCallable<
      {
        screenContext: ManagerScreenContext;
        mode: AgentInsightMode;
        question?: string;
        userId: string;
        responseLanguage: Locale;
      },
      { insights: AskManagerAgentResult["insights"]; summary: string }
    >("askManagerAgent");

    const res = await fn({
      screenContext: params.screenContext,
      mode: params.mode,
      question: params.question,
      userId: params.screenContext.userId!,
      responseLanguage: params.locale,
    });

    return {
      insights: mergeAgentInsights(localInsights, res.data.insights ?? []),
      summary:
        normalizeAgentSummary(res.data.summary, params.locale) ||
        getAgentSummaryText(params.locale, "analysisComplete"),
      aiEnabled: true,
    };
  } catch {
    return {
      insights: localInsights,
      summary: getAgentSummaryText(params.locale, "basicMode"),
      aiEnabled: false,
    };
  }
}

export function analyzeManagerScreenLocally(
  screenContext: ManagerScreenContext | null,
  locale: Locale
): AskManagerAgentResult {
  if (!isValidManagerScreenContext(screenContext)) {
    return {
      insights: [],
      summary: getAgentSummaryText(locale, "noWorkspace"),
      aiEnabled: false,
    };
  }

  return {
    insights: localizeAgentInsights(runManagerAgentLocalRules(screenContext), locale),
    summary: isManagerAgentAiEnabled()
      ? getAgentSummaryText(locale, "localChecksComplete")
      : getAgentSummaryText(locale, "basicMode"),
    aiEnabled: isManagerAgentAiEnabled(),
  };
}
