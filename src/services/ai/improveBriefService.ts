import { getAiCallable } from "@/lib/firebase";
import type { Locale } from "@/i18n/translations";
import { isWizardAiGenerationEnabled } from "./aiWizardGenerationService";
import { extractCallableErrorMessage, mapCallableError } from "./projectDraftService";

export type ImproveBriefResult = {
  improvedBrief: string;
  addedDetails: string[];
  openQuestions: string[];
};

export type ImproveBriefInput = {
  brief: string;
  projectName?: string;
  jobType?: string;
  extraContext?: string;
  location?: string;
  attachmentNames?: string[];
  locale: Locale;
};

function localeToBriefLanguage(locale: Locale): "sk" | "cs" | "de" | "en" {
  if (locale === "de") return "de";
  if (locale === "en") return "en";
  return "sk";
}

export function isImproveBriefEnabled(): boolean {
  return isWizardAiGenerationEnabled();
}

export async function improveProjectBrief(
  input: ImproveBriefInput
): Promise<ImproveBriefResult> {
  const fn = getAiCallable<Record<string, unknown>, ImproveBriefResult>(
    "improveProjectBrief"
  );
  const payload: Record<string, unknown> = {
    brief: input.brief,
    language: localeToBriefLanguage(input.locale),
  };
  if (input.projectName?.trim()) payload.projectName = input.projectName.trim();
  if (input.jobType?.trim()) payload.jobType = input.jobType.trim();
  if (input.extraContext?.trim()) payload.extraContext = input.extraContext.trim();
  if (input.location?.trim()) payload.location = input.location.trim();
  if (input.attachmentNames?.length) payload.attachmentNames = input.attachmentNames;

  const res = await fn(payload);
  return res.data;
}

export { extractCallableErrorMessage as extractImproveBriefError, mapCallableError };
