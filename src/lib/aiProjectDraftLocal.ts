/**
 * Client-only AI draft (React state). Not persisted to Firestore until confirm.
 */

import type {
  AiMaterialSuggestion,
  AiPhase,
  AiProjectPlan,
  AiTask,
} from "./aiProjectSchema";

function newNodeId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type DraftTask = AiTask & { id: string };

export type DraftPhase = Omit<AiPhase, "tasks"> & {
  id: string;
  tasks: DraftTask[];
};

export type DraftMaterialSuggestion = AiMaterialSuggestion & {
  id: string;
  selected: boolean;
};

export type AiProjectDraftLocal = Omit<AiProjectPlan, "phases" | "materialSuggestions"> & {
  draftId: string;
  phases: DraftPhase[];
  materialSuggestions?: DraftMaterialSuggestion[];
  projectNumber?: string;
};

export function aiPlanToLocalDraft(
  plan: AiProjectPlan,
  opts?: { projectNumber?: string }
): AiProjectDraftLocal {
  return {
    draftId: newNodeId(),
    projectTitle: plan.projectTitle,
    category: plan.category,
    scope: plan.scope,
    summary: plan.summary,
    uiMode: plan.uiMode,
    projectNumber: opts?.projectNumber?.trim() || undefined,
    phases: plan.phases.map((p) => ({
      id: newNodeId(),
      name: p.name,
      description: p.description,
      tasks: p.tasks.map((t) => ({ ...t, id: newNodeId() })),
    })),
    materialSuggestions: (plan.materialSuggestions ?? []).map((m) => ({
      ...m,
      id: newNodeId(),
      selected: m.confidence !== "low",
    })),
  };
}

export function draftPhaseToAiPhase(p: DraftPhase): AiPhase {
  return {
    name: p.name,
    description: p.description,
    tasks: p.tasks.map(({ id: _id, ...t }) => t),
  };
}

export function localDraftToAiProjectPlan(draft: AiProjectDraftLocal): AiProjectPlan {
  return {
    projectTitle: draft.projectTitle.trim(),
    category: draft.category,
    scope: draft.scope,
    summary: draft.summary,
    uiMode: draft.uiMode,
    phases: draft.phases.map((p) => draftPhaseToAiPhase(p)),
    materialSuggestions: draft.materialSuggestions
      ?.filter((m) => m.selected && m.name?.trim())
      .map(({ id: _id, selected: _s, ...m }) => m),
  };
}

export function updateDraftPhase(
  draft: AiProjectDraftLocal,
  phaseId: string,
  patch: Partial<Pick<DraftPhase, "name" | "description">>
): AiProjectDraftLocal {
  return {
    ...draft,
    phases: draft.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)),
  };
}

export function updateDraftTask(
  draft: AiProjectDraftLocal,
  phaseId: string,
  taskId: string,
  patch: Partial<Pick<DraftTask, "title" | "description">>
): AiProjectDraftLocal {
  return {
    ...draft,
    phases: draft.phases.map((p) =>
      p.id === phaseId
        ? {
            ...p,
            tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
          }
        : p
    ),
  };
}

export function removeDraftPhase(draft: AiProjectDraftLocal, phaseId: string): AiProjectDraftLocal {
  return { ...draft, phases: draft.phases.filter((p) => p.id !== phaseId) };
}

export function removeDraftTask(
  draft: AiProjectDraftLocal,
  phaseId: string,
  taskId: string
): AiProjectDraftLocal {
  return {
    ...draft,
    phases: draft.phases.map((p) =>
      p.id === phaseId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) } : p
    ),
  };
}

export function toggleMaterialSelection(
  draft: AiProjectDraftLocal,
  materialId: string,
  selected: boolean
): AiProjectDraftLocal {
  if (!draft.materialSuggestions) return draft;
  return {
    ...draft,
    materialSuggestions: draft.materialSuggestions.map((m) =>
      m.id === materialId ? { ...m, selected } : m
    ),
  };
}
