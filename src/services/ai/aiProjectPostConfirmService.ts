/**

 * Post-create enrichment after createProjectFromAiPlan (workspace, sales, materials, docs).

 */



import {

  getFirestoreInstance,

  getStorageInstance,

  ref,

  uploadBytes,

  collection,

  addDoc,

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

import type { ActiveWorkspace } from "@/types/workspace";



export type AiProjectPostConfirmInput = {

  projectId: string;

  workspace: ActiveWorkspace;

  userId: string;

  workType: WorkType;

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



function sanitizeFileName(name: string): string {

  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);

}



async function copyAiDraftFileToProject(

  projectId: string,

  uid: string,

  file: UploadedAiDraftFile

): Promise<void> {

  const storage = getStorageInstance();

  const db = getFirestoreInstance();

  if (!storage || !db) return;



  const { getBytes } = await import("firebase/storage");

  const srcRef = ref(storage, file.storagePath);

  const bytes = await getBytes(srcRef);

  const safeName = sanitizeFileName(file.fileName);

  const destPath = `projects/${projectId}/documents/${safeName}`;

  await uploadBytes(ref(storage, destPath), bytes, { contentType: file.mimeType });



  await addDoc(collection(db, "projects", projectId, "documents"), {

    fileName: file.fileName,

    mimeType: file.mimeType,

    storagePath: destPath,

    uploadedBy: uid,

    source: "ai_wizard",

    createdAt: serverTimestamp(),

    updatedAt: serverTimestamp(),

  });

}



export async function enrichProjectAfterAiConfirm(input: AiProjectPostConfirmInput): Promise<void> {

  const db = getFirestoreInstance();

  if (!db) throw new Error("Firestore not configured");



  const engine = mapArchetypeToFirestoreFields(input.workType);

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

  const files = input.uploadedFiles ?? [];



  await updateDoc(doc(db, "projects", input.projectId), patch);



  await Promise.all([

    materials.length > 0

      ? createMaterialSuggestionsBatch(

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

        ).catch(() => undefined)

      : Promise.resolve(),

    files.length > 0

      ? Promise.allSettled(

          files.map((f) => copyAiDraftFileToProject(input.projectId, input.userId, f))

        )

      : Promise.resolve(),

  ]);

}


