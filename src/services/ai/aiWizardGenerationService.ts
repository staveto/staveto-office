/**
 * AI generation for /app/projects/new wizard.
 * Office generateProjectDraft is primary on web (vision + deployed stack); mobile callables fallback.
 */

import type { AttachmentProcessing } from "@/types/attachmentDraft";
import type { AiProjectPlan } from "@/lib/aiProjectSchema";
import {
  sanitizeAiProjectPlanFromModel,
  validateAiProjectPlan,
} from "@/lib/aiProjectSchema";
import {
  appendContactToAiProjectDetails,
  buildAiProjectBriefForGenerate,
  buildUnifiedAiProjectDetails,
} from "@/lib/aiProjectGeneratePayload";
import { officeDraftToAiProjectPlan } from "@/lib/officeDraftToAiPlan";
import type { WorkType } from "@/lib/workTypes";
import type { ContactMode } from "@/components/jobs/new/newJobWizardTypes";
import type { CustomerDoc, CustomerType } from "@/lib/customers";
import type { ActiveWorkspace } from "@/types/workspace";
import type { Locale } from "@/i18n/translations";
import {
  filterOfficeAttachedFileIds,
  type UploadedAiDraftFile,
} from "@/services/ai/aiDraftFiles";
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
} from "./mobileAiProjectService";

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
  jobWorkflowKind?: string;
  attachedFileIds?: string[];
  documentStoragePaths?: string[];
  uploadedFiles?: UploadedAiDraftFile[];
};

export type AiWizardGenerateResult = {
  plan: AiProjectPlan;
  source: "mobile" | "office";
  officeDraftId?: string;
  warnings?: string[];
  attachmentProcessing?: AttachmentProcessing;
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

function isCallableUnavailable(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  return (
    code === "functions/not-found" ||
    code === "functions/unavailable" ||
    mapCallableError(err) === "not_deployed"
  );
}

function ensureReviewableAiPlan(plan: AiProjectPlan, fallbackSummary?: string): AiProjectPlan {
  const normalized = sanitizeAiProjectPlanFromModel(plan) as AiProjectPlan;
  let phases = normalized.phases.map((phase) => ({
    ...phase,
    tasks:
      phase.tasks.length > 0 ?
        phase.tasks
      : [
          {
            title: fallbackSummary?.trim().slice(0, 120) || "Review scope and define tasks",
            description: fallbackSummary?.trim() || undefined,
            taskType: "execution" as const,
            priority: "medium" as const,
          },
        ],
  }));

  if (phases.length === 0) {
    phases = [
      {
        name: "Main phase",
        description: fallbackSummary?.trim() || undefined,
        tasks: [
          {
            title: fallbackSummary?.trim().slice(0, 120) || "Review scope and define tasks",
            taskType: "execution" as const,
            priority: "medium" as const,
          },
        ],
      },
    ];
  }

  const candidate = { ...normalized, phases };
  const errors = validateAiProjectPlan(candidate);
  if (errors) {
    throw new Error(`Invalid AI response: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
  }
  return candidate;
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
  const projectBrief = buildAiProjectBriefForGenerate(input.projectTitle, input.projectBrief);
  if (!projectBrief) {
    throw new Error("Project brief is required");
  }

  const projectDetails = appendContactToAiProjectDetails(
    buildUnifiedAiProjectDetails({
      archetype: input.workType,
      extraContext: input.extraContext,
      location: input.location,
    }),
    {
      contactMode: input.contactMode,
      selectedCustomer: input.selectedCustomer,
      newContactName: input.newContactName,
      newContactType: input.newContactType,
      newContactEmail: input.newContactEmail,
      newContactPhone: input.newContactPhone,
      newContactAddress: input.newContactAddress,
    }
  );

  const plan = await generateProjectStructure({
    projectBrief,
    projectDetails,
    documentStoragePaths: input.documentStoragePaths?.length
      ? input.documentStoragePaths
      : undefined,
    jobWorkflowKind: input.jobWorkflowKind,
  });

  return {
    plan: ensureReviewableAiPlan(
      {
        ...plan,
        projectTitle: input.projectTitle.trim() || plan.projectTitle,
      },
      plan.summary
    ),
    source: "mobile",
  };
}

function resolveOfficeAttachedFileIds(input: AiWizardGenerateInput): string[] | undefined {
  if (input.uploadedFiles?.length) {
    const ids = filterOfficeAttachedFileIds(input.uploadedFiles);
    return ids.length > 0 ? ids : undefined;
  }
  if (!input.attachedFileIds?.length) return undefined;
  const ids = input.attachedFileIds.filter((id) => !id.includes("/"));
  return ids.length > 0 ? ids : undefined;
}

async function generateViaOffice(input: AiWizardGenerateInput): Promise<AiWizardGenerateResult> {
  const brief = buildAiProjectBriefForGenerate(input.projectTitle, input.projectBrief);
  const contextBlock = appendContactToAiProjectDetails(
    buildUnifiedAiProjectDetails({
      archetype: input.workType,
      extraContext: input.extraContext,
      location: input.location,
    }),
    {
      contactMode: input.contactMode,
      selectedCustomer: input.selectedCustomer,
      newContactName: input.newContactName,
      newContactType: input.newContactType,
      newContactEmail: input.newContactEmail,
      newContactPhone: input.newContactPhone,
      newContactAddress: input.newContactAddress,
    }
  );

  const description = [brief, contextBlock].filter(Boolean).join("\n\n");

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
    attachedFileIds: resolveOfficeAttachedFileIds(input),
    documentStoragePaths: input.documentStoragePaths?.length
      ? input.documentStoragePaths
      : undefined,
  });

  const plan = ensureReviewableAiPlan(
    officeDraftToAiProjectPlan(
      res.draft,
      input.workType,
      input.projectTitle.trim() || res.draft.projectTitle,
      { attachmentProcessing: res.attachmentProcessing }
    ),
    res.draft.summary
  );

  return {
    plan,
    source: "office",
    officeDraftId: res.draftId,
    warnings: res.warnings,
    attachmentProcessing: res.attachmentProcessing,
  };
}

export async function generateWizardAiPlan(
  input: AiWizardGenerateInput
): Promise<AiWizardGenerateResult> {
  if (!isWizardAiGenerationEnabled()) {
    throw new Error("AI_GENERATION_DISABLED");
  }

  try {
    return await generateViaOffice(input);
  } catch (err) {
    if (isCallableUnavailable(err)) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[staveto ai generate] office callable unavailable, trying mobile", {
          message: extractCallableErrorMessage(err),
        });
      }
      return generateViaMobile(input);
    }
    throw err;
  }
}

export async function confirmWizardAiProject(params: {
  source: "mobile" | "office";
  officeDraftId?: string;
  workspace: ActiveWorkspace;
  userId: string;
  plan: AiProjectPlan;
  originalBrief?: string;
  addressText?: string;
}): Promise<string> {
  if (params.source === "office" && params.officeDraftId) {
    const res = await createProjectFromDraft({
      workspace: params.workspace,
      userId: params.userId,
      draftId: params.officeDraftId,
    });
    return res.projectId;
  }

  return createProjectFromAiPlan({
    plan: params.plan,
    originalBrief: params.originalBrief,
    addressText: params.addressText,
  });
}
