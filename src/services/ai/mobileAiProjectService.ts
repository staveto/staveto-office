/**
 * Mobile-aligned AI project callables (europe-west1).
 * Wired only when explicitly enabled — interim office draft callables are not used here.
 */

import type { AiPhase, AiProjectPlan, AiTask } from "@/lib/aiProjectSchema";
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

/**
 * Mobile callables are deployed in the shared Firebase project but not yet validated from web.
 * Set NEXT_PUBLIC_MOBILE_AI_CALLABLES=1 after E2E verification.
 */
export function isMobileAiCallablesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOBILE_AI_CALLABLES === "1";
}

export async function generateProjectStructure(
  input: GenerateProjectStructureInput
): Promise<AiProjectPlan> {
  if (!isMobileAiCallablesEnabled()) {
    throw new Error("MOBILE_AI_DISABLED");
  }
  const fn = getCallable<GenerateProjectStructureInput, { plan: AiProjectPlan }>(
    "generateProjectStructure"
  );
  const res = await fn(input);
  if (!res.data?.plan) throw new Error("Empty AI plan");
  return res.data.plan;
}

export async function refineGeneratedProjectNode(
  input: RefineGeneratedNodeInput
): Promise<{ kind: "phase"; phase: AiPhase } | { kind: "task"; task: AiTask }> {
  if (!isMobileAiCallablesEnabled()) {
    throw new Error("MOBILE_AI_DISABLED");
  }
  const fn = getCallable<
    RefineGeneratedNodeInput,
    { kind: "phase"; phase: AiPhase } | { kind: "task"; task: AiTask }
  >("refineGeneratedProjectNode");
  const res = await fn(input);
  return res.data;
}

export async function createProjectFromAiPlan(
  input: CreateProjectFromAiPlanInput
): Promise<string> {
  if (!isMobileAiCallablesEnabled()) {
    throw new Error("MOBILE_AI_DISABLED");
  }
  const fn = getCallable<CreateProjectFromAiPlanInput, { projectId: string }>(
    "createProjectFromAiPlan"
  );
  const res = await fn(input);
  if (!res.data?.projectId) throw new Error("Missing projectId");
  return res.data.projectId;
}
