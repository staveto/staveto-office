import { getCallable } from "@/lib/firebase";
import { getCompanyIdForCallable, getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DraftLanguage, ProjectDraftPayload } from "@/types/aiProjectDraft";
import type { WorkType } from "@/lib/workTypes";
import type { ContactMode } from "@/components/jobs/new/newJobWizardTypes";
import type { CustomerType } from "@/lib/customers";
import type { Locale } from "@/i18n/translations";

export type GenerateProjectDraftInput = {
  workspace: ActiveWorkspace;
  userId: string;
  jobType: WorkType;
  contactMode: ContactMode;
  contactId?: string;
  newContact?: {
    type: CustomerType;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    ico?: string;
    dic?: string;
    vatId?: string;
  };
  description: string;
  location?: string;
  language: DraftLanguage;
  attachedFileIds?: string[];
};

export function localeToDraftLanguage(locale: Locale): DraftLanguage {
  if (locale === "de") return "de";
  if (locale === "en") return "en";
  return "sk";
}

export async function generateProjectDraft(
  input: GenerateProjectDraftInput
): Promise<{ draftId: string; draft: ProjectDraftPayload; warnings?: string[] }> {
  const fn = getCallable<Record<string, unknown>, { draftId: string; draft: ProjectDraftPayload; warnings?: string[] }>(
    "generateProjectDraft"
  );
  const wsKey = getWorkspaceStorageKey(input.workspace, input.userId);
  const res = await fn({
    workspaceId: wsKey,
    companyId: getCompanyIdForCallable(input.workspace),
    userId: input.userId,
    jobType: input.jobType,
    contactMode: input.contactMode,
    contactId: input.contactId,
    newContact: input.newContact,
    description: input.description,
    location: input.location,
    language: input.language,
    attachedFileIds: input.attachedFileIds,
  });
  return res.data;
}

export async function updateProjectDraftWithAI(params: {
  workspace: ActiveWorkspace;
  userId: string;
  draftId: string;
  userMessage: string;
  language: DraftLanguage;
}): Promise<{ draft: ProjectDraftPayload; version: number }> {
  const fn = getCallable<
    Record<string, unknown>,
    { draft: ProjectDraftPayload; version: number }
  >("updateProjectDraftWithAI");
  const wsKey = getWorkspaceStorageKey(params.workspace, params.userId);
  const res = await fn({
    workspaceId: wsKey,
    companyId: getCompanyIdForCallable(params.workspace),
    draftId: params.draftId,
    userMessage: params.userMessage,
    language: params.language,
  });
  return res.data;
}

export async function createProjectFromDraft(params: {
  workspace: ActiveWorkspace;
  userId: string;
  draftId: string;
}): Promise<{ projectId: string }> {
  const fn = getCallable<Record<string, unknown>, { projectId: string }>(
    "createProjectFromDraft"
  );
  const wsKey = getWorkspaceStorageKey(params.workspace, params.userId);
  const res = await fn({
    workspaceId: wsKey,
    companyId: getCompanyIdForCallable(params.workspace),
    draftId: params.draftId,
  });
  return res.data;
}

export function mapCallableError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const message = (err as { message?: string })?.message ?? "";
  if (code === "functions/permission-denied" || message.includes("permission")) {
    return "permission";
  }
  if (message.includes("AI service is not configured")) {
    return "not_configured";
  }
  return "generic";
}
