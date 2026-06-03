/**
 * AI generation for /app/projects/new wizard.
 * Mobile callables when NEXT_PUBLIC_MOBILE_AI_CALLABLES=1; otherwise deployed office
 * generateProjectDraft (reads attachedFileIds from workspaces/.../aiDraftFiles).
 */

import type { AiProjectPlan } from "@/lib/aiProjectSchema";
import { officeDraftToAiProjectPlan } from "@/lib/officeDraftToAiPlan";
import type { WorkType } from "@/lib/workTypes";
import type { ContactMode } from "@/components/jobs/new/newJobWizardTypes";
import type { CustomerDoc, CustomerType } from "@/lib/customers";
import type { ActiveWorkspace } from "@/types/workspace";
import type { Locale } from "@/i18n/translations";
import {
  createProjectFromDraft,
  extractCallableErrorMessage,
  generateProjectDraft,
  localeToDraftLanguage,
  mapCallableError,
  type CallableErrorKind,
} from "./projectDraftService";
import {
  createProjectFromAiPlan,
  generateProjectStructure,
  isMobileAiCallablesEnabled,
} from "./mobileAiProjectService";
import { applyAiPlanToDraftProject } from "./applyAiPlanToProject";

export type AiWizardGenerateInput = {
  workspace: ActiveWorkspace;
  userId: string;
  locale: Locale;
  workType: WorkType;
  contactMode: ContactMode;
  selectedCustomer: CustomerDoc | null;
  newContactName: string;
  newContactEmail: string;
  newContactPhone: string;
  newContactType: CustomerType;
  newContactIco: string;
  newContactTaxId: string;
  newContactAddress: string;
  projectTitle: string;
  projectBrief: string;
  extraContext?: string;
  location?: string;
  archetypeHint?: string;
  mappedWorkType: string;
  jobWorkflowKind?: string;
  attachedFileIds?: string[];
  documentStoragePaths?: string[];
};

export type AiWizardGenerateResult = {
  plan: AiProjectPlan;
  source: "mobile" | "office";
  officeDraftId?: string;
  warnings?: string[];
};

export function isWizardAiGenerationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_AI_GENERATION !== "1";
}

export function mapWizardAiError(err: unknown): CallableErrorKind {
  return mapCallableError(err);
}

export function getWizardAiErrorDetail(err: unknown): string | undefined {
  const detail = extractCallableErrorMessage(err);
  return detail.length > 0 ? detail : undefined;
}

function buildNewContact(input: AiWizardGenerateInput) {
  if (input.contactMode !== "new" || !input.newContactName.trim()) return undefined;
  return {
    type: input.newContactType,
    name: input.newContactName.trim(),
    email: input.newContactEmail.trim() || undefined,
    phone: input.newContactPhone.trim() || undefined,
    address: input.newContactAddress.trim() || undefined,
    ico: input.newContactIco.trim() || undefined,
    dic: input.newContactTaxId.trim() || undefined,
  };
}

async function generateViaMobile(input: AiWizardGenerateInput): Promise<AiWizardGenerateResult> {
  const details = [
    input.archetypeHint,
    input.extraContext?.trim(),
    input.location?.trim() ? `Location: ${input.location.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const plan = await generateProjectStructure({
    projectBrief: input.projectBrief.trim(),
    projectDetails: details || undefined,
    documentStoragePaths: input.documentStoragePaths?.length
      ? input.documentStoragePaths
      : undefined,
    workType: input.mappedWorkType,
    jobWorkflowKind: input.jobWorkflowKind,
  });

  return {
    plan: {
      ...plan,
      projectTitle: input.projectTitle.trim() || plan.projectTitle,
    },
    source: "mobile",
  };
}

async function generateViaOffice(input: AiWizardGenerateInput): Promise<AiWizardGenerateResult> {
  const description = [input.projectBrief.trim(), input.extraContext?.trim()]
    .filter(Boolean)
    .join("\n\n");

  const res = await generateProjectDraft({
    workspace: input.workspace,
    userId: input.userId,
    jobType: input.workType,
    contactMode: input.contactMode,
    contactId: input.selectedCustomer?.id,
    newContact: buildNewContact(input),
    description,
    location: input.location?.trim() || undefined,
    language: localeToDraftLanguage(input.locale),
    attachedFileIds: input.attachedFileIds,
  });

  return {
    plan: officeDraftToAiProjectPlan(
      res.draft,
      input.workType,
      input.projectTitle.trim() || res.draft.projectTitle
    ),
    source: "office",
    officeDraftId: res.draftId,
    warnings: res.warnings,
  };
}

export async function generateWizardAiPlan(
  input: AiWizardGenerateInput
): Promise<AiWizardGenerateResult> {
  if (!isWizardAiGenerationEnabled()) {
    throw new Error("AI_GENERATION_DISABLED");
  }

  if (isMobileAiCallablesEnabled()) {
    try {
      return await generateViaMobile(input);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "functions/not-found" || (err as Error).message === "MOBILE_AI_DISABLED") {
        return generateViaOffice(input);
      }
      throw err;
    }
  }

  return generateViaOffice(input);
}

export async function confirmWizardAiProject(params: {
  source: "mobile" | "office";
  officeDraftId?: string;
  existingProjectId?: string;
  workspace: ActiveWorkspace;
  userId: string;
  plan: AiProjectPlan;
  originalBrief?: string;
  addressText?: string;
  attachedFileIds?: string[];
}): Promise<string> {
  if (params.source === "office" && params.existingProjectId) {
    await applyAiPlanToDraftProject(params.existingProjectId, params.plan, {
      originalBrief: params.originalBrief,
      addressText: params.addressText,
      attachedFileIds: params.attachedFileIds,
    });
    return params.existingProjectId;
  }

  if (params.source === "office" && params.officeDraftId) {
    const res = await createProjectFromDraft({
      workspace: params.workspace,
      userId: params.userId,
      draftId: params.officeDraftId,
    });
    return res.projectId;
  }

  if (!isMobileAiCallablesEnabled()) {
    throw new Error("AI_GENERATION_DISABLED");
  }

  return createProjectFromAiPlan({
    plan: params.plan,
    originalBrief: params.originalBrief,
    addressText: params.addressText,
  });
}
