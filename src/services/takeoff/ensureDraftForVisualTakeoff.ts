/**
 * Ensure a draft project exists with PDF documents, then open visual takeoff.
 * Used from /app/projects/new AI review when no projectId exists yet.
 */

import {
  getFirestoreInstance,
  doc,
  updateDoc,
  serverTimestamp,
} from "@/lib/firebase";
import { getProject, type ProjectDoc } from "@/lib/projects";
import { createDraftJob } from "@/services/projects/projectService";
import { importAiWizardAttachmentsToProject } from "@/services/projects/projectAiAttachmentsService";
import { listProjectDocuments } from "@/services/projects/projectDocuments";
import { getProjectDocumentPreviewKind } from "@/lib/projectDocumentPreview";
import {
  filterOfficeAttachedFileIds,
  type UploadedAiDraftFile,
} from "@/services/ai/aiDraftFiles";
import type { ActiveWorkspace } from "@/types/workspace";
import type { WorkType } from "@/lib/workTypes";
import type { VisualTakeoffStatus } from "@/lib/takeoff/drawingTakeoffSummary";

export type EnsureDraftForTakeoffInput = {
  workspace: ActiveWorkspace;
  userId: string;
  workType: WorkType;
  projectName: string;
  addressText?: string;
  customerId?: string;
  customerName?: string;
  customerCompanyName?: string;
  customerContactPersonName?: string;
  customerEmail?: string;
  customerPhone?: string;
  uploadedFiles: UploadedAiDraftFile[];
  estimatorSessionId?: string | null;
  aiDraftId?: string | null;
  /** Reuse an already-created draft instead of creating another. */
  existingProjectId?: string | null;
};

export type EnsureDraftForTakeoffResult = {
  projectId: string;
  documentId: string | null;
};

async function attachWizardMeta(
  projectId: string,
  input: EnsureDraftForTakeoffInput
): Promise<ProjectDoc | null> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const attachedFileIds = filterOfficeAttachedFileIds(input.uploadedFiles);
  const paths = input.uploadedFiles
    .map((f) => f.storagePath)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  const update: Record<string, unknown> = {
    createdByAI: true,
    updatedAt: serverTimestamp(),
  };
  if (attachedFileIds.length) update.attachedFileIds = attachedFileIds;
  if (paths.length) update.aiWizardAttachmentPaths = paths;
  if (input.estimatorSessionId) update.aiEstimatorSessionId = input.estimatorSessionId;
  if (input.aiDraftId) update.aiDraftId = input.aiDraftId;

  await updateDoc(doc(db, "projects", projectId), update);
  return getProject(projectId);
}

async function pickFirstPdfDocumentId(projectId: string): Promise<string | null> {
  const docs = await listProjectDocuments(projectId);
  const pdf = docs.find((d) => getProjectDocumentPreviewKind(d.mimeType) === "pdf");
  return pdf?.id ?? null;
}

/**
 * Creates (or reuses) a draft job, copies wizard PDFs into project documents,
 * and returns the first PDF document id for the takeoff workbench.
 */
export async function ensureDraftProjectForVisualTakeoff(
  input: EnsureDraftForTakeoffInput
): Promise<EnsureDraftForTakeoffResult> {
  let projectId = input.existingProjectId?.trim() || "";

  if (!projectId) {
    const name = input.projectName.trim() || "AI zákazka";
    projectId = await createDraftJob(input.workspace, input.userId, {
      workType: input.workType,
      name,
      source: "web",
      addressText: input.addressText,
      customerId: input.customerId,
      customerName: input.customerName,
      customerCompanyName: input.customerCompanyName,
      customerContactPersonName: input.customerContactPersonName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
    });
  }

  const project = await attachWizardMeta(projectId, input);
  if (project && input.uploadedFiles.length > 0) {
    await importAiWizardAttachmentsToProject({
      projectId,
      workspace: input.workspace,
      userId: input.userId,
      project,
    });
  }

  const documentId = await pickFirstPdfDocumentId(projectId);
  return { projectId, documentId };
}

/**
 * Legacy Plan Takeoff Workbench URL (`DrawingOccurrence`).
 * Kept for debug/documents entry — not the main AI wizard CTA.
 */
export function buildVisualTakeoffHref(params: {
  projectId: string;
  documentId?: string | null;
  returnTo?: "new-project-proposal" | "quote-review" | "documents";
  mode?: "quote-precheck";
}): string {
  const q = new URLSearchParams();
  if (params.documentId) q.set("doc", params.documentId);
  q.set("returnTo", params.returnTo ?? "new-project-proposal");
  q.set("mode", params.mode ?? "quote-precheck");
  const qs = q.toString();
  return `/app/projects/${params.projectId}/takeoff${qs ? `?${qs}` : ""}`;
}

/**
 * Main AI estimator visual tool — PDF marking in setup workspace
 * (`EstimatorPosition` + PdfMarkingWorkspace).
 */
export function buildEstimatorPdfMarkingHref(params: {
  projectId: string;
  step?: "material" | "overview";
  tab?: "pdf" | "summary" | "detail" | "prices" | "review";
}): string {
  const q = new URLSearchParams();
  q.set("setup", "ai");
  q.set("step", params.step ?? "material");
  q.set("tab", params.tab ?? "pdf");
  return `/app/projects/${params.projectId}?${q.toString()}`;
}

export async function setProjectVisualTakeoffStatus(
  projectId: string,
  status: VisualTakeoffStatus
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await updateDoc(doc(db, "projects", projectId), {
    visualTakeoffStatus: status,
    updatedAt: serverTimestamp(),
  });
}
