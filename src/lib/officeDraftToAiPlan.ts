import type { AiCategory, AiProjectPlan, AiScope, AiTaskType } from "./aiProjectSchema";
import type { ProjectDraftPayload } from "@/types/aiProjectDraft";
import type { WorkType } from "./workTypes";
import { dedupeMaterialSuggestions } from "./dedupeMaterialSuggestions";

const DEFAULT_PHASE_NAME = "Main phase";

function collectMaterialSuggestions(draft: ProjectDraftPayload): AiProjectPlan["materialSuggestions"] {
  const items: NonNullable<AiProjectPlan["materialSuggestions"]> = [];

  for (const m of draft.materials ?? []) {
    const name = m.name?.trim();
    if (!name) continue;
    items.push({
      name,
      description: m.note?.trim() || undefined,
      suggestedQuantity: m.quantity ?? undefined,
      unit: m.unit?.trim() || undefined,
      confidence: "medium",
    });
  }

  for (const line of draft.offerPreparation?.suggestedLineItems ?? []) {
    if (line.category !== "material") continue;
    const name = line.title?.trim();
    if (!name) continue;
    items.push({
      name,
      description: line.description?.trim() || undefined,
      suggestedQuantity: line.quantity ?? undefined,
      unit: line.unit?.trim() || undefined,
      confidence: "medium",
    });
  }

  const seen = new Set<string>();
  const merged = items.filter((m) => {
    const key = m.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return dedupeMaterialSuggestions(merged);
}

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
    materialSuggestions: collectMaterialSuggestions(draft),
  };
}
