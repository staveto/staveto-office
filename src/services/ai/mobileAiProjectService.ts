/**
 * Mobile-aligned AI project callables (europe-west1).
 * Default path for web wizard — office draft callables are fallback only.
 */

import {
  type AiPhase,
  type AiProjectPlan,
  type AiTask,
  sanitizeAiProjectPlanFromModel,
  validateAiProjectPlan,
} from "@/lib/aiProjectSchema";
import { getCallable } from "@/lib/firebase";

export type GenerateProjectStructureInput = {
  projectBrief: string;
  projectDetails?: string;
  documentStoragePaths?: string[];
  engineType?: string;
  workType?: string;
  jobWorkflowKind?: string;
  serviceMaintenanceScope?: string;
};

export type RefineGeneratedNodeInput = {
  projectBrief: string;
  draftSummary?: string;
  nodeKind: "phase" | "task";
  phaseIndex: number;
  taskIndex?: number;
  currentPhase?: AiPhase;
  currentTask?: AiTask;
  userChangeRequest: string;
  extraContext?: string;
};

export type CreateProjectFromAiPlanInput = {
  plan: AiProjectPlan;
  originalBrief?: string;
  addressText?: string;
  countryCode?: string;
  city?: string;
  projectNumber?: string;
};

/** @deprecated Use mobile callables directly; kept for diagnostics only. */
export function isMobileAiCallablesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_AI_GENERATION !== "1";
}

export async function generateProjectStructure(
  input: GenerateProjectStructureInput
): Promise<AiProjectPlan> {
  const fn = getCallable<GenerateProjectStructureInput, { plan: AiProjectPlan }>(
    "generateProjectStructure"
  );
  const res = await fn(input);
  if (!res.data?.plan) {
    throw new Error("AI returned empty response. Please try again or create manually.");
  }

  const normalized = sanitizeAiProjectPlanFromModel(res.data.plan);
  const validationErrors = validateAiProjectPlan(normalized);
  if (validationErrors) {
    const msg = validationErrors.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new Error(`Invalid AI response: ${msg}`);
  }

  return normalized as AiProjectPlan;
}

export async function refineGeneratedProjectNode(
  input: RefineGeneratedNodeInput
): Promise<{ kind: "phase"; phase: AiPhase } | { kind: "task"; task: AiTask }> {
  const payload = {
    projectBrief: input.projectBrief.trim(),
    draftSummary: input.draftSummary?.trim().slice(0, 400) || undefined,
    nodeKind: input.nodeKind,
    phaseIndex: input.phaseIndex,
    taskIndex: input.taskIndex,
    currentPhaseJson: input.currentPhase,
    currentTaskJson: input.currentTask,
    userChangeRequest: input.userChangeRequest.trim(),
    extraContext: input.extraContext?.trim().slice(0, 600) || undefined,
  };

  const fn = getCallable<
    typeof payload,
    { kind: "phase"; phase: AiPhase } | { kind: "task"; task: AiTask }
  >("refineGeneratedProjectNode");
  const res = await fn(payload);
  if (!res.data?.kind) {
    throw new Error("AI returned empty response. Please try again or edit manually.");
  }
  return res.data;
}

export async function createProjectFromAiPlan(
  input: CreateProjectFromAiPlanInput
): Promise<string> {
  const fn = getCallable<CreateProjectFromAiPlanInput, { projectId: string }>(
    "createProjectFromAiPlan"
  );
  const res = await fn(input);
  if (!res.data?.projectId) throw new Error("Missing projectId");
  return res.data.projectId;
}
