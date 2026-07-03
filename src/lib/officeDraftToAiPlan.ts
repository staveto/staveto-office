import type { AiCategory, AiProjectPlan, AiScope, AiTaskType } from "./aiProjectSchema";
import type { ProjectDraftPayload } from "@/types/aiProjectDraft";
import type {
  AttachmentProcessing,
  AttachmentSummary,
  DraftMaterialSuggestion,
  MaterialSourceKind,
} from "@/types/attachmentDraft";
import { resolveMaterialSourceKind } from "@/types/attachmentDraft";
import type { WorkType } from "./workTypes";
import { dedupeMaterialSuggestions } from "./dedupeMaterialSuggestions";

const DEFAULT_PHASE_NAME = "Main phase";

function collectMaterialSuggestions(
  draft: ProjectDraftPayload
): (NonNullable<AiProjectPlan["materialSuggestions"]>[number] & {
  materialSource?: MaterialSourceKind;
})[] {
  const items: (NonNullable<AiProjectPlan["materialSuggestions"]>[number] & {
    materialSource?: MaterialSourceKind;
  })[] = [];

  for (const m of draft.materialSuggestions ?? []) {
    const name = m.name?.trim();
    if (!name) continue;
    items.push({
      name,
      category: m.category,
      description: m.sourceNote?.trim() || undefined,
      suggestedQuantity: m.quantity,
      unit: m.unit?.trim() || undefined,
      confidence: m.confidence ?? "medium",
      sourceNote: m.sourceNote,
      materialSource: resolveMaterialSourceKind(m),
    });
  }

  for (const m of draft.materials ?? []) {
    const name = m.name?.trim();
    if (!name) continue;
    const draftSuggestion = draft.materialSuggestions?.find(
      (s) => s.name.trim().toLowerCase() === name.toLowerCase()
    );
    items.push({
      name,
      description: m.note?.trim() || undefined,
      suggestedQuantity: m.quantity ?? undefined,
      unit: m.unit?.trim() || undefined,
      confidence: draftSuggestion?.confidence ?? "medium",
      sourceNote: (draftSuggestion?.sourceNote ?? m.note?.trim()) || undefined,
      materialSource: draftSuggestion
        ? resolveMaterialSourceKind(draftSuggestion)
        : "inferred",
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
      materialSource: "inferred",
    });
  }

  const seen = new Set<string>();
  const merged = items.filter((m) => {
    const key = m.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return dedupeMaterialSuggestions(merged) as typeof merged;
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

export type OfficeAiProjectPlan = AiProjectPlan & {
  attachmentFindings?: AttachmentSummary[];
  projectFacts?: ProjectDraftPayload["projectFacts"];
  missingQuestions?: string[];
  draftWarnings?: string[];
  attachmentProcessing?: AttachmentProcessing;
};

/** Map office `generateProjectDraft` payload → mobile-aligned `AiProjectPlan` for review UI. */
export function officeDraftToAiProjectPlan(
  draft: ProjectDraftPayload,
  workType: WorkType,
  projectTitleOverride?: string,
  extras?: {
    attachmentProcessing?: AttachmentProcessing;
  }
): OfficeAiProjectPlan {
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

  const materialSuggestions = collectMaterialSuggestions(draft).map((m) => ({
    ...m,
    materialSource: m.materialSource,
  }));

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
    materialSuggestions,
    attachmentFindings: draft.attachmentFindings,
    projectFacts: draft.projectFacts,
    missingQuestions: draft.missingQuestions ?? draft.clarificationQuestions,
    draftWarnings: draft.draftWarnings,
    attachmentProcessing: extras?.attachmentProcessing,
  };
}
