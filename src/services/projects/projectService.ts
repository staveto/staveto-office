/**
 * Zákazka (project) lifecycle — Firestore writes via lib/projects patterns.
 */
import {
  getFirestoreInstance,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  collection,
  serverTimestamp,
} from "@/lib/firebase";
import type { Workspace } from "@/lib/workspace-types";
import type { ActiveWorkspace } from "@/types/workspace";
import { getProjectWorkspaceWriteFields } from "@/services/workspace/workspaceService";
import { fromLegacyWorkspace } from "@/lib/workspace-types";
import { toProjectDoc, type ProjectDoc, isNormalizedActiveWorkspace } from "@/lib/projects";
import { isDraftJob } from "@/lib/projectLifecycle";
import type {
  ProjectLifecycleStatus,
  ProjectSalesStatus,
  ProjectQuoteStatus,
  JobSource,
  ProjectPhase,
} from "@/lib/projectLifecycle";
import type { WorkType } from "@/lib/workTypes";
import { isWorkType, mapArchetypeToFirestoreFields } from "@/lib/workTypes";

export type CreateDraftJobInput = {
  workType: WorkType;
  name: string;
  customerId?: string;
  customerRequest?: string;
  customerName?: string;
  customerCompanyName?: string;
  customerContactPersonName?: string;
  customerEmail?: string;
  customerPhone?: string;
  addressText?: string;
  city?: string;
  source: JobSource;
  internalNote?: string;
};

function toActiveWorkspaceForWrite(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): ActiveWorkspace {
  if (isNormalizedActiveWorkspace(workspace)) {
    return workspace;
  }
  return fromLegacyWorkspace(workspace, uid);
}

export async function createDraftJob(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  input: CreateDraftJobInput
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  if (!isWorkType(input.workType)) throw new Error("Work type is required");

  const name = input.name?.trim();
  const customerRequest = input.customerRequest?.trim();
  if (!name) throw new Error("Job name is required");

  const active = toActiveWorkspaceForWrite(workspace, uid);
  const engine = mapArchetypeToFirestoreFields(input.workType);
  const projectData: Record<string, unknown> = {
    name,
    projectType: engine.projectType,
    workType: engine.workType,
    jobArchetype: engine.jobArchetype,
    ...(engine.jobWorkflowKind ? { jobWorkflowKind: engine.jobWorkflowKind } : {}),
    phase: "sales" satisfies ProjectPhase,
    lifecycleStatus: "new_request" satisfies ProjectLifecycleStatus,
    salesStatus: "draft" satisfies ProjectSalesStatus,
    quoteStatus: "none" satisfies ProjectQuoteStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...getProjectWorkspaceWriteFields(active, uid),
    source: input.source,
  };

  if (input.customerId?.trim()) projectData.customerId = input.customerId.trim();
  if (customerRequest) projectData.customerRequest = customerRequest;
  if (input.customerName?.trim()) projectData.customerName = input.customerName.trim();
  if (input.customerCompanyName?.trim()) {
    projectData.customerCompanyName = input.customerCompanyName.trim();
  }
  if (input.customerContactPersonName?.trim()) {
    projectData.customerContactPersonName = input.customerContactPersonName.trim();
  }
  if (input.customerEmail?.trim()) projectData.customerEmail = input.customerEmail.trim();
  if (input.customerPhone?.trim()) projectData.customerPhone = input.customerPhone.trim();
  if (input.addressText?.trim()) projectData.addressText = input.addressText.trim();
  if (input.city?.trim()) projectData.city = input.city.trim();
  if (input.internalNote?.trim()) projectData.internalNote = input.internalNote.trim();

  const ref = await addDoc(collection(db, "projects"), projectData);
  return ref.id;
}

export async function convertDraftToActiveProject(
  projectId: string,
  _userId: string
): Promise<ProjectDoc> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Project not found");

  const existing = toProjectDoc(projectId, snap.data() as Record<string, unknown>);
  if (!isDraftJob(existing)) {
    throw new Error("Only draft jobs can be converted");
  }

  await updateDoc(ref, {
    phase: "delivery",
    lifecycleStatus: "planned",
    salesStatus: "accepted",
    convertedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updated = await getDoc(ref);
  return toProjectDoc(projectId, updated.data() as Record<string, unknown>);
}

export async function updateDraftJobStatus(
  projectId: string,
  status: ProjectLifecycleStatus,
  options?: { salesStatus?: ProjectSalesStatus; quoteStatus?: ProjectQuoteStatus }
): Promise<ProjectDoc> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "projects", projectId);
  const update: Record<string, unknown> = {
    lifecycleStatus: status,
    updatedAt: serverTimestamp(),
  };
  if (options?.salesStatus) update.salesStatus = options.salesStatus;
  if (options?.quoteStatus) update.quoteStatus = options.quoteStatus;

  await updateDoc(ref, update);

  const snap = await getDoc(ref);
  return toProjectDoc(projectId, snap.data() as Record<string, unknown>);
}

export async function updateDraftJobFields(
  projectId: string,
  fields: Partial<
    Pick<
      ProjectDoc,
      | "name"
      | "customerRequest"
      | "customerName"
      | "customerEmail"
      | "customerPhone"
      | "addressText"
      | "city"
      | "source"
      | "quoteDraftVatPercent"
      | "quoteDraftNotes"
    >
  >
): Promise<ProjectDoc> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "projects", projectId);
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (fields.name !== undefined) update.name = fields.name.trim();
  if (fields.customerRequest !== undefined) {
    update.customerRequest = fields.customerRequest.trim();
  }
  if (fields.customerName !== undefined) update.customerName = fields.customerName.trim() || null;
  if (fields.customerEmail !== undefined) update.customerEmail = fields.customerEmail.trim() || null;
  if (fields.customerPhone !== undefined) update.customerPhone = fields.customerPhone.trim() || null;
  if (fields.addressText !== undefined) update.addressText = fields.addressText.trim() || null;
  if (fields.city !== undefined) update.city = fields.city.trim() || null;
  if (fields.source !== undefined) update.source = fields.source;
  if (fields.quoteDraftVatPercent !== undefined) {
    const vat = fields.quoteDraftVatPercent;
    update.quoteDraftVatPercent =
      typeof vat === "number" && vat >= 0 && vat <= 100 ? vat : null;
  }
  if (fields.quoteDraftNotes !== undefined) {
    update.quoteDraftNotes = fields.quoteDraftNotes.trim() || null;
  }

  await updateDoc(ref, update);

  const snap = await getDoc(ref);
  return toProjectDoc(projectId, snap.data() as Record<string, unknown>);
}

export {
  normalizeProjectPhase,
  isDraftJob,
  isActiveJob,
  matchesProjectFilter,
  getLifecycleBadgeKey,
  getSourceBadgeKey,
} from "@/lib/projectLifecycle";
