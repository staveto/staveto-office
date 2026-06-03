import type { AiCategory, AiProjectPlan, AiScope, AiTaskType } from "./aiProjectSchema";
import type { ProjectDraftPayload } from "@/types/aiProjectDraft";
import type { WorkType } from "./workTypes";

const DEFAULT_PHASE_NAME = "Main phase";

function archetypeToAiMeta(workType: WorkType): { category: AiCategory; scope: AiScope } {
  switch (workType) {
    case "service_inspection":
      return { category: "service", scope: "small_job" };
    case "customer_job":
      return { category: "renovation", scope: "single_trade" };
    case "large_construction_project":
      return { category: "construction", scope: "full_build" };
    case "own_build":
      return { category: "renovation", scope: "full_build" };
    case "internal_project":
      return { category: "service", scope: "small_job" };
    default:
      return { category: "renovation", scope: "single_trade" };
  }
}

/** Map office `generateProjectDraft` payload → mobile-aligned `AiProjectPlan` for review UI. */
export function officeDraftToAiProjectPlan(
  draft: ProjectDraftPayload,
  workType: WorkType,
  projectTitleOverride?: string
): AiProjectPlan {
  const { category, scope } = archetypeToAiMeta(workType);
  const phaseMap = new Map<string, { name: string; tasks: AiProjectPlan["phases"][0]["tasks"] }>();

  for (const task of draft.tasks) {
    const phaseName = task.phase?.trim() || DEFAULT_PHASE_NAME;
    let bucket = phaseMap.get(phaseName);
    if (!bucket) {
      bucket = { name: phaseName, tasks: [] };
      phaseMap.set(phaseName, bucket);
    }
    bucket.tasks.push({
      title: task.title?.trim() || "Task",
      description: task.description?.trim() || undefined,
      taskType: "execution" satisfies AiTaskType,
      priority: task.priority ?? "medium",
    });
  }

  const phases =
    phaseMap.size > 0
      ? Array.from(phaseMap.values()).map((p) => ({
          name: p.name,
          tasks: p.tasks,
        }))
      : [
          {
            name: DEFAULT_PHASE_NAME,
            description: draft.summary?.trim() || undefined,
            tasks: [] as AiProjectPlan["phases"][0]["tasks"],
          },
        ];

  return {
    projectTitle: (projectTitleOverride?.trim() || draft.projectTitle?.trim() || "New job").slice(
      0,
      200
    ),
    category,
    scope,
    summary: draft.summary?.trim() || undefined,
    uiMode: "phases",
    phases,
    materialSuggestions: (draft.materials ?? []).map((m) => ({
      name: m.name?.trim() || "Material",
      description: m.note?.trim() || undefined,
      suggestedQuantity: m.quantity ?? undefined,
      unit: m.unit?.trim() || undefined,
      confidence: "medium" as const,
    })),
  };
}
