/**
 * Post-create enrichment after createProjectFromAiPlan (workspace, sales, materials, docs).
 */

import {
  getFirestoreInstance,
  doc,
  updateDoc,
  serverTimestamp,
} from "@/lib/firebase";
import { parseMaterialCategory, parseMaterialUnit, resolveMaterialCurrency } from "@/lib/materialCatalog";
import type { AiMaterialSuggestion } from "@/lib/aiProjectSchema";
import type {
  ProjectLifecycleStatus,
  ProjectPhase,
  ProjectQuoteStatus,
  ProjectSalesStatus,
} from "@/lib/projectLifecycle";
import { mapArchetypeToFirestoreFields, type WorkType } from "@/lib/workTypes";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import { createMaterialSuggestionsBatch } from "@/services/materials/projectMaterialsService";
import { getProjectWorkspaceWriteFields } from "@/services/workspace/workspaceService";
import { importAiWizardAttachmentsToProject } from "@/services/projects/projectAiAttachmentsService";
import type { ActiveWorkspace } from "@/types/workspace";
import type { ProjectDoc } from "@/lib/projects";

export type AiProjectPostConfirmInput = {
  projectId: string;
  workspace: ActiveWorkspace;
  userId: string;
  workType: WorkType;
  aiDraftId?: string;
  customerId?: string;
  customerName?: string;
  customerCompanyName?: string;
  customerContactPersonName?: string;
  customerEmail?: string;
  customerPhone?: string;
  addressText?: string;
  materialSuggestions?: AiMaterialSuggestion[];
  uploadedFiles?: UploadedAiDraftFile[];
};

export type AiProjectPostConfirmOptions = {
  /** Office createProjectFromDraft already writes materialSuggestions server-side. */
  skipMaterialSuggestions?: boolean;
  /** Copying attachments via download+upload is slow — run after navigation instead. */
  skipAttachmentImport?: boolean;
};

export async function enrichProjectAfterAiConfirm(
  input: AiProjectPostConfirmInput,
  options?: AiProjectPostConfirmOptions
): Promise<{ importedDocuments: number }> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const engine = mapArchetypeToFirestoreFields(input.workType);
  const files = input.uploadedFiles ?? [];
  const attachmentPaths = files.map((f) => f.storagePath).filter(Boolean);
  const attachedFileIds = files
    .map((f) => f.id)
    .filter((id) => id && !id.startsWith("path:"));

  const patch: Record<string, unknown> = {
    ...getProjectWorkspaceWriteFields(input.workspace, input.userId),
    phase: "sales" satisfies ProjectPhase,
    lifecycleStatus: "new_request" satisfies ProjectLifecycleStatus,
    salesStatus: "draft" satisfies ProjectSalesStatus,
    quoteStatus: "none" satisfies ProjectQuoteStatus,
    projectType: engine.projectType,
    workType: engine.workType,
    jobArchetype: engine.jobArchetype,
    creationMethod: "ai",
    createdByAI: true,
    confirmedByUser: true,
    updatedAt: serverTimestamp(),
  };

  if (attachmentPaths.length > 0) patch.aiWizardAttachmentPaths = attachmentPaths;
  if (attachedFileIds.length > 0) {
    patch.attachedFileIds = attachedFileIds;
  } else if (files.some((f) => f.id.startsWith("path:"))) {
    patch.attachedFileIds = files.map((f) => f.id).filter((id) => id.startsWith("path:"));
  }
  if (input.aiDraftId?.trim()) patch.aiDraftId = input.aiDraftId.trim();

  if (engine.jobWorkflowKind) patch.jobWorkflowKind = engine.jobWorkflowKind;
  if (input.customerId?.trim()) patch.customerId = input.customerId.trim();
  if (input.customerName?.trim()) patch.customerName = input.customerName.trim();
  if (input.customerCompanyName?.trim()) {
    patch.customerCompanyName = input.customerCompanyName.trim();
  }
  if (input.customerContactPersonName?.trim()) {
    patch.customerContactPersonName = input.customerContactPersonName.trim();
  }
  if (input.customerEmail?.trim()) patch.customerEmail = input.customerEmail.trim();
  if (input.customerPhone?.trim()) patch.customerPhone = input.customerPhone.trim();
  if (input.addressText?.trim()) patch.addressText = input.addressText.trim();

  const materials = input.materialSuggestions ?? [];

  await updateDoc(doc(db, "projects", input.projectId), patch);

  if (!options?.skipMaterialSuggestions && materials.length > 0) {
    await createMaterialSuggestionsBatch(
      input.projectId,
      materials
        .filter((m) => m.name?.trim())
        .map((m) => ({
          name: m.name.trim(),
          category: parseMaterialCategory(m.category) ?? "unknown",
          description: m.description?.trim() || undefined,
          suggestedQuantity: m.suggestedQuantity,
          unit: parseMaterialUnit(m.unit),
          estimatedUnitPrice: m.estimatedUnitPrice,
          estimatedTotalPrice: m.estimatedTotalPrice,
          currency: resolveMaterialCurrency({ expenseCurrency: m.currency }),
          source: "ai" as const,
          confidence: m.confidence,
          sourceNote: m.sourceNote?.trim() || undefined,
        }))
    ).catch(() => undefined);
  }

  if (options?.skipAttachmentImport) {
    return { importedDocuments: 0 };
  }

  const projectForImport: ProjectDoc = {
    id: input.projectId,
    name: "",
    createdByAI: true,
    aiDraftId: input.aiDraftId,
    attachedFileIds: [
      ...attachedFileIds,
      ...files.filter((f) => f.id.startsWith("path:")).map((f) => f.id),
    ],
    aiWizardAttachmentPaths: attachmentPaths,
  };

  const imported = await importAiWizardAttachmentsToProject({
    projectId: input.projectId,
    workspace: input.workspace,
    userId: input.userId,
    project: projectForImport,
  });

  return { importedDocuments: imported.length };
}
