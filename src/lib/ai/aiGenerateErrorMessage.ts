import type { Locale } from "@/i18n/translations";
import {
  extractCallableErrorMessage,
  mapCallableError,
  type CallableErrorKind,
} from "@/services/ai/projectDraftService";

export type AiGenerateErrorPresentation = {
  headline: string;
  detail?: string;
  kind: CallableErrorKind;
};

type Translate = (key: string, params?: Record<string, string>) => string;

export function presentAiGenerateError(
  err: unknown,
  t: Translate
): AiGenerateErrorPresentation {
  if (process.env.NODE_ENV === "development") {
    console.warn("[staveto ai generate]", extractCallableErrorMessage(err) || err);
  }

  if (err instanceof Error && err.message === "AI_GENERATION_DISABLED") {
    return { headline: t("projects.new.ai.errorNotConfigured"), kind: "not_configured" };
  }

  const kind = mapCallableError(err);
  const detail = extractCallableErrorMessage(err);
  const detailLower = detail?.toLowerCase() ?? "";

  if (kind === "unauthenticated" || kind === "permission") {
    return {
      headline: t("projects.new.ai.errorPermission"),
      detail: detail || undefined,
      kind,
    };
  }
  if (kind === "not_configured") {
    return {
      headline: detail || t("projects.new.ai.errorNotConfigured"),
      kind,
    };
  }
  if (kind === "not_deployed") {
    return {
      headline: detail || t("projects.new.ai.errorFunctionsNotDeployed"),
      detail,
      kind,
    };
  }
  if (kind === "quota") {
    return {
      headline: t("projects.new.ai.errorQuota"),
      detail,
      kind,
    };
  }
  if (
    kind === "overloaded" ||
    detailLower.includes("503") ||
    detailLower.includes("high demand") ||
    detailLower.includes("service unavailable") ||
    detailLower.includes("googlegenerativeai")
  ) {
    return {
      headline: t("projects.new.ai.errorOverloaded"),
      detail,
      kind: "overloaded",
    };
  }
  if (kind === "timeout" || detailLower.includes("deadline-exceeded")) {
    return {
      headline: t("projects.new.ai.errorTimeout"),
      detail,
      kind: "timeout",
    };
  }

  if (err instanceof Error && err.message.startsWith("Invalid AI response:")) {
    return {
      headline: t("projects.new.ai.errorGenerate"),
      detail: err.message,
      kind: "generic",
    };
  }

  return {
    headline: t("projects.new.ai.errorGenerate"),
    detail: detail || undefined,
    kind: "generic",
  };
}

export function formatAiErrorForDevTools(locale: Locale, detail?: string): string | undefined {
  if (process.env.NODE_ENV !== "development" || !detail) return undefined;
  return `[${locale}] ${detail}`;
}
