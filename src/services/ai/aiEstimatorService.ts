import { getAiCallable } from "@/lib/firebase";
import { getCompanyIdForCallable, getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import {
  isAiEstimatorDebugEnabled,
  isAiEstimatorFlowEnabled,
  isAiSymbolReadingEnabled,
  logAiEstimatorDebug,
} from "@/lib/ai/aiEstimatorFeature";
import { resolveEstimatorCountryProfile } from "@/lib/ai/estimatorCountryProfile";
import type {
  AiEstimateLine,
  AiEstimatorFacts,
  AiQuoteDraft,
} from "@/types/aiEstimator";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DraftLanguage } from "@/types/aiProjectDraft";
import { mapCallableError, extractCallableErrorMessage } from "./projectDraftService";

export type GenerateEstimatorFactsInput = {
  workspace: ActiveWorkspace;
  userId: string;
  jobType: string;
  description: string;
  location?: string;
  language: DraftLanguage;
  attachedFileIds?: string[];
  documentStoragePaths?: string[];
  customerName?: string;
  countryCode?: string | null;
  currency?: string;
  vatPercent?: number;
};

export type GenerateEstimatorFactsResult = {
  sessionId: string;
  facts: AiEstimatorFacts;
  diagnostics: Record<string, unknown>;
};

function basePayload(
  input: GenerateEstimatorFactsInput
): Record<string, unknown> {
  const wsKey = getWorkspaceStorageKey(input.workspace, input.userId);
  const profile = resolveEstimatorCountryProfile(input.countryCode, {
    currency: input.currency,
    vatPercent: input.vatPercent,
    language: input.language,
  });
  const payload: Record<string, unknown> = {
    workspaceId: wsKey,
    userId: input.userId,
    jobType: input.jobType,
    description: input.description,
    language: input.language,
    countryProfile: {
      countryCode: profile.countryCode || "SK",
      language: profile.language || input.language || "sk",
      currency: profile.currency || "EUR",
      vatPercent:
        typeof profile.vatPercent === "number" && !Number.isNaN(profile.vatPercent)
          ? profile.vatPercent
          : 20,
      legalQuoteNotes: Array.isArray(profile.legalQuoteNotes)
        ? profile.legalQuoteNotes
        : [],
      tradeTerminology: profile.tradeTerminology || "construction",
      ...(typeof profile.defaultHourlyRate === "number"
        ? { defaultHourlyRate: profile.defaultHourlyRate }
        : {}),
      ...(typeof profile.defaultTravelRate === "number"
        ? { defaultTravelRate: profile.defaultTravelRate }
        : {}),
    },
    enableSymbolReading: isAiSymbolReadingEnabled(),
    debug: isAiEstimatorDebugEnabled(),
  };
  const companyId = getCompanyIdForCallable(input.workspace);
  if (companyId) payload.companyId = companyId;
  if (input.location?.trim()) payload.location = input.location.trim();
  if (input.customerName?.trim()) payload.customerName = input.customerName.trim();
  if (input.attachedFileIds?.length) payload.attachedFileIds = input.attachedFileIds;
  if (input.documentStoragePaths?.length) {
    payload.documentStoragePaths = input.documentStoragePaths;
  }
  return payload;
}

export async function generateEstimatorFacts(
  input: GenerateEstimatorFactsInput
): Promise<GenerateEstimatorFactsResult> {
  const fn = getAiCallable<Record<string, unknown>, GenerateEstimatorFactsResult>(
    "generateEstimatorFacts"
  );
  const result = await fn(basePayload(input));
  logAiEstimatorDebug("client_facts", {
    sessionId: result.data.sessionId,
    rooms: result.data.facts.rooms.length,
    extracted: result.data.facts.extractedItems.length,
    inferred: result.data.facts.inferredItems.length,
  });
  return result.data;
}

export async function generateEstimateDraft(params: {
  workspace: ActiveWorkspace;
  userId: string;
  sessionId: string;
  marginPercent?: number;
}): Promise<{ sessionId: string; lines: AiEstimateLine[] }> {
  const fn = getAiCallable<
    Record<string, unknown>,
    { sessionId: string; lines: AiEstimateLine[] }
  >("generateEstimateDraft");
  const payload: Record<string, unknown> = {
    workspaceId: getWorkspaceStorageKey(params.workspace, params.userId),
    sessionId: params.sessionId,
    debug: isAiEstimatorDebugEnabled(),
  };
  const companyId = getCompanyIdForCallable(params.workspace);
  if (companyId) payload.companyId = companyId;
  if (params.marginPercent != null) payload.marginPercent = params.marginPercent;
  const result = await fn(payload);
  return result.data;
}

export async function generateQuoteDraftFromEstimate(params: {
  workspace: ActiveWorkspace;
  userId: string;
  sessionId: string;
  title?: string;
}): Promise<{ sessionId: string; quoteDraft: AiQuoteDraft }> {
  const fn = getAiCallable<
    Record<string, unknown>,
    { sessionId: string; quoteDraft: AiQuoteDraft }
  >("generateQuoteDraftFromEstimate");
  const payload: Record<string, unknown> = {
    workspaceId: getWorkspaceStorageKey(params.workspace, params.userId),
    sessionId: params.sessionId,
    debug: isAiEstimatorDebugEnabled(),
  };
  const companyId = getCompanyIdForCallable(params.workspace);
  if (companyId) payload.companyId = companyId;
  if (params.title?.trim()) payload.title = params.title.trim();
  const result = await fn(payload);
  return result.data;
}

export async function convertEstimatorSessionToProject(params: {
  workspace: ActiveWorkspace;
  userId: string;
  sessionId: string;
  createQuoteDocument?: boolean;
  projectTitle?: string;
  customerId?: string;
  customerName?: string;
  customerCompanyName?: string;
  customerContactPersonName?: string;
  customerEmail?: string;
  customerPhone?: string;
  addressText?: string;
}): Promise<{ projectId: string; quoteId?: string; sessionId: string }> {
  const fn = getAiCallable<
    Record<string, unknown>,
    { projectId: string; quoteId?: string; sessionId: string }
  >("convertEstimatorSessionToProject");
  const payload: Record<string, unknown> = {
    workspaceId: getWorkspaceStorageKey(params.workspace, params.userId),
    sessionId: params.sessionId,
    createQuoteDocument: params.createQuoteDocument !== false,
    debug: isAiEstimatorDebugEnabled(),
  };
  const companyId = getCompanyIdForCallable(params.workspace);
  if (companyId) payload.companyId = companyId;
  if (params.projectTitle?.trim()) payload.projectTitle = params.projectTitle.trim();
  if (params.customerId?.trim()) payload.customerId = params.customerId.trim();
  if (params.customerName?.trim()) payload.customerName = params.customerName.trim();
  if (params.customerCompanyName?.trim()) {
    payload.customerCompanyName = params.customerCompanyName.trim();
  }
  if (params.customerContactPersonName?.trim()) {
    payload.customerContactPersonName = params.customerContactPersonName.trim();
  }
  if (params.customerEmail?.trim()) payload.customerEmail = params.customerEmail.trim();
  if (params.customerPhone?.trim()) payload.customerPhone = params.customerPhone.trim();
  if (params.addressText?.trim()) payload.addressText = params.addressText.trim();
  const result = await fn(payload);
  return result.data;
}

export async function syncEstimatorMaterialsToProject(params: {
  workspace: ActiveWorkspace;
  userId: string;
  projectId: string;
  sessionId?: string;
  regenerateFromAttachments?: boolean;
}): Promise<{ projectId: string; materialCount: number; sessionId: string | null }> {
  const fn = getAiCallable<
    Record<string, unknown>,
    { projectId: string; materialCount: number; sessionId: string | null }
  >("syncEstimatorMaterialsToProject");
  const payload: Record<string, unknown> = {
    workspaceId: getWorkspaceStorageKey(params.workspace, params.userId),
    projectId: params.projectId,
    regenerateFromAttachments: params.regenerateFromAttachments === true,
    debug: isAiEstimatorDebugEnabled(),
  };
  const companyId = getCompanyIdForCallable(params.workspace);
  if (companyId) payload.companyId = companyId;
  if (params.sessionId?.trim()) payload.sessionId = params.sessionId.trim();
  const result = await fn(payload);
  return result.data;
}

export function isEstimatorCallableUnavailable(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  return (
    code === "functions/not-found" ||
    mapCallableError(err) === "not_deployed" ||
    extractCallableErrorMessage(err).toLowerCase().includes("not found")
  );
}

export { isAiEstimatorFlowEnabled };
