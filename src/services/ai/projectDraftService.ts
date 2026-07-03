import { getAiCallable, getCallable } from "@/lib/firebase";
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
  documentStoragePaths?: string[];
};

export function localeToDraftLanguage(locale: Locale): DraftLanguage {
  if (locale === "de") return "de";
  if (locale === "en") return "en";
  return "sk";
}

/** Omit null/undefined so Firebase callables do not send `null` for optional fields. */
function buildGenerateProjectDraftPayload(
  input: GenerateProjectDraftInput
): Record<string, unknown> {
  const wsKey = getWorkspaceStorageKey(input.workspace, input.userId);
  const payload: Record<string, unknown> = {
    workspaceId: wsKey,
    userId: input.userId,
    jobType: input.jobType,
    contactMode: input.contactMode,
    description: input.description,
    language: input.language,
  };

  const companyId = getCompanyIdForCallable(input.workspace);
  if (companyId) payload.companyId = companyId;
  if (input.contactId) payload.contactId = input.contactId;
  if (input.newContact) payload.newContact = input.newContact;
  const location = input.location?.trim();
  if (location) payload.location = location;
  if (input.attachedFileIds?.length) payload.attachedFileIds = input.attachedFileIds;
  if (input.documentStoragePaths?.length) {
    payload.documentStoragePaths = input.documentStoragePaths;
  }

  return payload;
}

export async function generateProjectDraft(
  input: GenerateProjectDraftInput
): Promise<{
  draftId: string;
  draft: ProjectDraftPayload;
  warnings?: string[];
  attachmentProcessing?: import("@/types/attachmentDraft").AttachmentProcessing;
}> {
  const fn = getAiCallable<
    Record<string, unknown>,
    {
      draftId: string;
      draft: ProjectDraftPayload;
      warnings?: string[];
      attachmentProcessing?: import("@/types/attachmentDraft").AttachmentProcessing;
    }
  >("generateProjectDraft");
  const res = await fn(buildGenerateProjectDraftPayload(input));
  return res.data;
}

export async function updateProjectDraftWithAI(params: {
  workspace: ActiveWorkspace;
  userId: string;
  draftId: string;
  userMessage: string;
  language: DraftLanguage;
}): Promise<{ draft: ProjectDraftPayload; version: number }> {
  const fn = getAiCallable<
    Record<string, unknown>,
    { draft: ProjectDraftPayload; version: number }
  >("updateProjectDraftWithAI");
  const wsKey = getWorkspaceStorageKey(params.workspace, params.userId);
  const payload: Record<string, unknown> = {
    workspaceId: wsKey,
    draftId: params.draftId,
    userMessage: params.userMessage,
    language: params.language,
  };
  const companyId = getCompanyIdForCallable(params.workspace);
  if (companyId) payload.companyId = companyId;
  const res = await fn(payload);
  return res.data;
}

export async function createProjectFromDraft(params: {
  workspace: ActiveWorkspace;
  userId: string;
  draftId: string;
}): Promise<{ projectId: string }> {
  const fn = getCallable<Record<string, unknown>, { projectId: string }>(
    "createProjectFromDraft",
    { timeoutMs: 120_000 }
  );
  const wsKey = getWorkspaceStorageKey(params.workspace, params.userId);
  const payload: Record<string, unknown> = {
    workspaceId: wsKey,
    draftId: params.draftId,
  };
  const companyId = getCompanyIdForCallable(params.workspace);
  if (companyId) payload.companyId = companyId;
  const res = await fn(payload);
  return res.data;
}

export type CallableErrorKind =
  | "permission"
  | "not_configured"
  | "not_deployed"
  | "unauthenticated"
  | "quota"
  | "overloaded"
  | "timeout"
  | "generic";

/** Firebase callable error message for UI (sanitized). */
export function extractCallableErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") {
    return err instanceof Error ? err.message : "";
  }
  const e = err as {
    code?: string;
    message?: string;
    details?: unknown;
    customData?: { message?: string };
  };

  if (typeof e.details === "string" && e.details.trim()) {
    return e.details.trim();
  }
  if (e.details && typeof e.details === "object" && "message" in e.details) {
    const nested = String((e.details as { message?: string }).message ?? "").trim();
    if (nested) return nested;
  }
  if (e.customData?.message?.trim()) {
    return e.customData.message.trim();
  }

  const raw = String(e.message ?? "").trim();
  if (!raw) return "";

  const cleaned = raw
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\(functions\/[^)]+\)\s*\.?$/i, "")
    .trim();

  if (
    cleaned.toLowerCase() === "internal" &&
    (e.code === "functions/internal" || e.code === "internal")
  ) {
    return "AI server unreachable (Cloud Run Invoker or GEMINI_API_KEY — see docs/STAVETO_AI_SETUP.md).";
  }

  return cleaned;
}

export function mapCallableError(err: unknown): CallableErrorKind {
  const code = (err as { code?: string })?.code ?? "";
  const message = extractCallableErrorMessage(err).toLowerCase();
  const rawMessage = String((err as { message?: string })?.message ?? "").toLowerCase();

  if (code === "functions/unauthenticated" || message.includes("auth")) {
    return "unauthenticated";
  }
  if (
    code === "functions/not-found" ||
    message.includes("not found") ||
    message.includes("404") ||
    rawMessage.includes("failed to fetch") ||
    rawMessage.includes("network") ||
    message.includes("cloud run invoker")
  ) {
    return "not_deployed";
  }
  if (
    code === "functions/unavailable" ||
    message.includes("503") ||
    message.includes("high demand") ||
    message.includes("service unavailable") ||
    message.includes("ai service is busy") ||
    message.includes("temporarily unavailable") ||
    message.includes("googlegenerativeai")
  ) {
    return "overloaded";
  }
  if (
    code === "functions/permission-denied" ||
    code === "functions/permission_denied" ||
    message.includes("permission") ||
    message.includes("not a member")
  ) {
    return "permission";
  }
  if (
    code === "functions/failed-precondition" ||
    message.includes("not configured") ||
    message.includes("gemini_api_key") ||
    message.includes("ai service is not configured")
  ) {
    return "not_configured";
  }
  if (
    code === "functions/resource-exhausted" ||
    message.includes("quota exceeded") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return "quota";
  }
  if (
    code === "functions/deadline-exceeded" ||
    code === "deadline-exceeded" ||
    code === "functions/cancelled" ||
    message.includes("deadline-exceeded") ||
    message.includes("deadline exceeded") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    rawMessage.includes("deadline-exceeded")
  ) {
    return "timeout";
  }
  return "generic";
}
