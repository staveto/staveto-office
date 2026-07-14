/**
 * Persist NewJobForm AI-review state so returning from Plan Takeoff Workbench
 * restores "Kontrola podkladov" instead of a blank/wrong screen.
 */

import type { AiProjectDraftLocal } from "@/lib/aiProjectDraftLocal";
import type {
  AiEstimateLine,
  AiEstimatorFacts,
  AiQuoteDraft,
} from "@/types/aiEstimator";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import type { WorkType } from "@/lib/workTypes";

export const VISUAL_TAKEOFF_RESUME_KEY = "staveto:visual-takeoff-resume";

export type VisualTakeoffResumePayload = {
  version: 1;
  savedAt: string;
  projectId: string;
  workType: WorkType | null;
  aiProjectName: string;
  aiBrief: string;
  location: string;
  estimatorSessionId: string | null;
  estimatorFacts: AiEstimatorFacts | null;
  estimateLines: AiEstimateLine[];
  quoteDraft: AiQuoteDraft | null;
  aiDraft: AiProjectDraftLocal | null;
  aiDraftSource: "mobile" | "office" | null;
  aiOfficeDraftId: string | null;
  aiUploadedFiles: UploadedAiDraftFile[];
};

export function saveVisualTakeoffResume(payload: Omit<VisualTakeoffResumePayload, "version" | "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const full: VisualTakeoffResumePayload = {
      ...payload,
      version: 1,
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(VISUAL_TAKEOFF_RESUME_KEY, JSON.stringify(full));
  } catch {
    // Quota / private mode — takeoff still works; resume is best-effort.
  }
}

export function loadVisualTakeoffResume(): VisualTakeoffResumePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(VISUAL_TAKEOFF_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VisualTakeoffResumePayload;
    if (parsed?.version !== 1 || !parsed.projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearVisualTakeoffResume(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(VISUAL_TAKEOFF_RESUME_KEY);
  } catch {
    // ignore
  }
}

/** Return path that restores the AI review step after takeoff. */
export function visualTakeoffResumeHref(projectId: string): string {
  return `/app/projects/new?resume=takeoff&projectId=${encodeURIComponent(projectId)}`;
}
