/**
 * Client-only AI draft (React state). Not persisted to Firestore until confirm.
 */

import type {
  AiMaterialSuggestion,
  AiPhase,
  AiProjectPlan,
  AiTask,
} from "./aiProjectSchema";
import type {
  AttachmentProcessing,
  AttachmentSummary,
  MaterialSourceKind,
} from "@/types/attachmentDraft";
import type { OfficeAiProjectPlan } from "./officeDraftToAiPlan";

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
  materialSource?: MaterialSourceKind;
};

export type AiProjectDraftLocal = Omit<OfficeAiProjectPlan, "phases" | "materialSuggestions"> & {
  draftId: string;
  phases: DraftPhase[];
  materialSuggestions?: DraftMaterialSuggestion[];
  projectNumber?: string;
};

export function aiPlanToLocalDraft(
  plan: OfficeAiProjectPlan | AiProjectPlan,
  opts?: { projectNumber?: string }
): AiProjectDraftLocal {
  const extended = plan as OfficeAiProjectPlan;
  return {
    draftId: newNodeId(),
    projectTitle: plan.projectTitle,
    category: plan.category,
    scope: plan.scope,
    summary: plan.summary,
    uiMode: plan.uiMode,
    projectNumber: opts?.projectNumber?.trim() || undefined,
    attachmentFindings: extended.attachmentFindings,
    projectFacts: extended.projectFacts,
    missingQuestions: extended.missingQuestions,
    draftWarnings: extended.draftWarnings,
    attachmentProcessing: extended.attachmentProcessing,
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
      materialSource: (m as DraftMaterialSuggestion).materialSource,
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

export function updateDraftProjectTitle(
  draft: AiProjectDraftLocal,
  projectTitle: string
): AiProjectDraftLocal {
  return { ...draft, projectTitle };
}

export function replaceDraftPhase(
  draft: AiProjectDraftLocal,
  phaseId: string,
  next: AiPhase
): AiProjectDraftLocal {
  return {
    ...draft,
    phases: draft.phases.map((p) => {
      if (p.id !== phaseId) return p;
      return {
        ...p,
        name: next.name,
        description: next.description,
        tasks: next.tasks.map((t) => ({ ...t, id: newNodeId() })),
      };
    }),
  };
}

export function replaceDraftTask(
  draft: AiProjectDraftLocal,
  phaseId: string,
  taskId: string,
  next: AiTask
): AiProjectDraftLocal {
  return {
    ...draft,
    phases: draft.phases.map((p) => {
      if (p.id !== phaseId) return p;
      return {
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                title: next.title,
                description: next.description,
                taskType: next.taskType,
                priority: next.priority,
              }
            : t
        ),
      };
    }),
  };
}
