/**
 * Project materials — Firestore CRUD mirroring mobile `projectMaterials.ts`.
 * Paths: projects/{projectId}/materials, projects/{projectId}/materialSuggestions
 */
import {
  getFirestoreInstance,
  getAuthInstance,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "@/lib/firebase";
import {
  calculateMaterialTotals,
  parseMaterialCategory,
  parseMaterialSource,
  parseMaterialUnit,
  resolveMaterialCurrency,
  MATERIAL_UNITS,
  type MaterialTotals,
} from "@/lib/materialCatalog";
import type {
  MaterialCategory,
  MaterialConfidence,
  MaterialSuggestionDoc,
  MaterialSuggestionSource,
  MaterialSuggestionStatus,
  MaterialUnit,
  ProjectMaterialDoc,
} from "@/services/materials/types";

export type { MaterialTotals, MaterialSuggestionDoc, ProjectMaterialDoc };
export { calculateMaterialTotals, MATERIAL_UNITS };

function projectMaterialsPath(projectId: string): string {
  return `projects/${projectId}/materials`;
}

function projectMaterialPath(projectId: string, materialId: string): string {
  return `projects/${projectId}/materials/${materialId}`;
}

function projectMaterialSuggestionsPath(projectId: string): string {
  return `projects/${projectId}/materialSuggestions`;
}

function projectMaterialSuggestionPath(projectId: string, suggestionId: string): string {
  return `projects/${projectId}/materialSuggestions/${suggestionId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function convertTimestamp(ts: unknown): string | undefined {
  if (!ts) return undefined;
  if (typeof ts === "string") return ts;
  if (typeof ts === "object" && ts !== null) {
    const o = ts as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof o.toDate === "function") {
      try {
        return o.toDate().toISOString();
      } catch {
        return undefined;
      }
    }
    if (typeof o.seconds === "number") {
      const nanos = typeof o.nanoseconds === "number" ? o.nanoseconds : 0;
      return new Date(o.seconds * 1000 + nanos / 1e6).toISOString();
    }
  }
  return undefined;
}

function toSuggestionDoc(docSnap: { id: string; data: () => Record<string, unknown> }): MaterialSuggestionDoc | null {
  let d: Record<string, unknown>;
  try {
    const raw = docSnap.data();
    if (!isPlainObject(raw)) return null;
    d = raw;
  } catch {
    return null;
  }
  const name = typeof d.name === "string" ? d.name.trim() : "";
  if (!name) return null;
  return {
    id: docSnap.id,
    projectId: (d.projectId as string) ?? "",
    name,
    category: parseMaterialCategory(d.category),
    description: typeof d.description === "string" ? d.description : undefined,
    suggestedQuantity: typeof d.suggestedQuantity === "number" ? d.suggestedQuantity : undefined,
    unit: parseMaterialUnit(d.unit),
    estimatedUnitPrice: typeof d.estimatedUnitPrice === "number" ? d.estimatedUnitPrice : undefined,
    estimatedTotalPrice: typeof d.estimatedTotalPrice === "number" ? d.estimatedTotalPrice : undefined,
    currency: typeof d.currency === "string" ? d.currency : "EUR",
    source: parseMaterialSource(d.source),
    confidence:
      d.confidence === "low" || d.confidence === "medium" || d.confidence === "high"
        ? d.confidence
        : undefined,
    sourceDocumentId: typeof d.sourceDocumentId === "string" ? d.sourceDocumentId : undefined,
    sourceExpenseId: typeof d.sourceExpenseId === "string" ? d.sourceExpenseId : undefined,
    sourceNote: typeof d.sourceNote === "string" ? d.sourceNote : undefined,
    phaseId: typeof d.phaseId === "string" ? d.phaseId : undefined,
    taskId: typeof d.taskId === "string" ? d.taskId : undefined,
    status:
      d.status === "accepted" || d.status === "rejected" ? d.status : "planned",
    createdAt: convertTimestamp(d.createdAt) ?? new Date().toISOString(),
    updatedAt: convertTimestamp(d.updatedAt),
    createdBy: (d.createdBy as string) ?? "",
  };
}

function toMaterialDoc(docSnap: { id: string; data: () => Record<string, unknown> }): ProjectMaterialDoc | null {
  let d: Record<string, unknown>;
  try {
    const raw = docSnap.data();
    if (!isPlainObject(raw)) return null;
    d = raw;
  } catch {
    return null;
  }
  const name = typeof d.name === "string" ? d.name.trim() : "";
  const quantity = typeof d.quantity === "number" ? d.quantity : NaN;
  const unit = parseMaterialUnit(d.unit);
  if (!name || !Number.isFinite(quantity) || !unit) return null;
  return {
    id: docSnap.id,
    projectId: (d.projectId as string) ?? "",
    organizationId: typeof d.organizationId === "string" ? d.organizationId : undefined,
    name,
    category: parseMaterialCategory(d.category),
    quantity,
    unit,
    unitPrice: typeof d.unitPrice === "number" ? d.unitPrice : undefined,
    totalPrice: typeof d.totalPrice === "number" ? d.totalPrice : undefined,
    currency: typeof d.currency === "string" ? d.currency : "EUR",
    supplierName: typeof d.supplierName === "string" ? d.supplierName : undefined,
    receiptUrl: typeof d.receiptUrl === "string" ? d.receiptUrl : undefined,
    phaseId: typeof d.phaseId === "string" ? d.phaseId : undefined,
    taskId: typeof d.taskId === "string" ? d.taskId : undefined,
    usedByUserId: typeof d.usedByUserId === "string" ? d.usedByUserId : undefined,
    usedByName: typeof d.usedByName === "string" ? d.usedByName : undefined,
    usedAt: convertTimestamp(d.usedAt) ?? convertTimestamp(d.createdAt) ?? new Date().toISOString(),
    notes: typeof d.notes === "string" ? d.notes : undefined,
    createdAt: convertTimestamp(d.createdAt) ?? new Date().toISOString(),
    updatedAt: convertTimestamp(d.updatedAt),
    createdBy: (d.createdBy as string) ?? "",
    sourceSuggestionId: typeof d.sourceSuggestionId === "string" ? d.sourceSuggestionId : undefined,
  };
}

function requireAuth(): string {
  const uid = getAuthInstance()?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

export async function listMaterialSuggestions(projectId: string): Promise<MaterialSuggestionDoc[]> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  requireAuth();
  const snap = await getDocs(collection(db, projectMaterialSuggestionsPath(projectId)));
  const list = snap.docs
    .map((d) => toSuggestionDoc({ id: d.id, data: d.data.bind(d) }))
    .filter((x): x is MaterialSuggestionDoc => x != null);
  list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return list;
}

export type CreateMaterialSuggestionInput = {
  name: string;
  category?: MaterialCategory;
  description?: string;
  suggestedQuantity?: number;
  unit?: MaterialUnit;
  estimatedUnitPrice?: number;
  estimatedTotalPrice?: number;
  currency?: string;
  source?: MaterialSuggestionSource;
  confidence?: MaterialConfidence;
  sourceDocumentId?: string;
  sourceExpenseId?: string;
  sourceNote?: string;
  phaseId?: string;
  taskId?: string;
};

export async function createMaterialSuggestion(
  projectId: string,
  input: CreateMaterialSuggestionInput
): Promise<MaterialSuggestionDoc> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const uid = requireAuth();
  const name = input.name.trim();
  if (!name) throw new Error("Material name is required");

  const currency = resolveMaterialCurrency({ expenseCurrency: input.currency });
  const ref = await addDoc(collection(db, projectMaterialSuggestionsPath(projectId)), {
    projectId,
    name,
    category: input.category ?? null,
    description: input.description?.trim() ?? null,
    suggestedQuantity: input.suggestedQuantity ?? null,
    unit: input.unit ?? null,
    estimatedUnitPrice: input.estimatedUnitPrice ?? null,
    estimatedTotalPrice: input.estimatedTotalPrice ?? null,
    currency,
    source: input.source ?? "manual",
    confidence: input.confidence ?? null,
    sourceDocumentId: input.sourceDocumentId ?? null,
    sourceExpenseId: input.sourceExpenseId ?? null,
    sourceNote: input.sourceNote?.trim() ?? null,
    phaseId: input.phaseId ?? null,
    taskId: input.taskId ?? null,
    status: "planned",
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    id: ref.id,
    projectId,
    name,
    category: input.category,
    description: input.description,
    suggestedQuantity: input.suggestedQuantity,
    unit: input.unit,
    estimatedUnitPrice: input.estimatedUnitPrice,
    estimatedTotalPrice: input.estimatedTotalPrice,
    currency,
    source: input.source ?? "manual",
    confidence: input.confidence,
    sourceDocumentId: input.sourceDocumentId,
    sourceExpenseId: input.sourceExpenseId,
    sourceNote: input.sourceNote,
    phaseId: input.phaseId,
    taskId: input.taskId,
    status: "planned",
    createdBy: uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateMaterialSuggestion(
  projectId: string,
  suggestionId: string,
  patch: Partial<CreateMaterialSuggestionInput> & { status?: MaterialSuggestionStatus }
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  requireAuth();
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) updateData.name = patch.name.trim();
  if (patch.category !== undefined) updateData.category = patch.category ?? null;
  if (patch.description !== undefined) updateData.description = patch.description?.trim() ?? null;
  if (patch.suggestedQuantity !== undefined) updateData.suggestedQuantity = patch.suggestedQuantity ?? null;
  if (patch.unit !== undefined) updateData.unit = patch.unit ?? null;
  if (patch.estimatedUnitPrice !== undefined) updateData.estimatedUnitPrice = patch.estimatedUnitPrice ?? null;
  if (patch.estimatedTotalPrice !== undefined) updateData.estimatedTotalPrice = patch.estimatedTotalPrice ?? null;
  if (patch.currency !== undefined) updateData.currency = resolveMaterialCurrency({ expenseCurrency: patch.currency });
  if (patch.confidence !== undefined) updateData.confidence = patch.confidence ?? null;
  if (patch.sourceExpenseId !== undefined) updateData.sourceExpenseId = patch.sourceExpenseId ?? null;
  if (patch.sourceNote !== undefined) updateData.sourceNote = patch.sourceNote?.trim() ?? null;
  if (patch.status !== undefined) updateData.status = patch.status;
  await updateDoc(doc(db, projectMaterialSuggestionPath(projectId, suggestionId)), updateData);
}

export async function rejectMaterialSuggestion(projectId: string, suggestionId: string): Promise<void> {
  await updateMaterialSuggestion(projectId, suggestionId, { status: "rejected" });
}

export async function acceptMaterialSuggestion(projectId: string, suggestionId: string): Promise<void> {
  await updateMaterialSuggestion(projectId, suggestionId, { status: "accepted" });
}

export async function listProjectMaterials(projectId: string): Promise<ProjectMaterialDoc[]> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  requireAuth();
  const snap = await getDocs(collection(db, projectMaterialsPath(projectId)));
  const list = snap.docs
    .map((d) => toMaterialDoc({ id: d.id, data: d.data.bind(d) }))
    .filter((x): x is ProjectMaterialDoc => x != null);
  list.sort((a, b) => (b.usedAt ?? "").localeCompare(a.usedAt ?? ""));
  return list;
}

export type CreateProjectMaterialInput = {
  name: string;
  category?: MaterialCategory;
  quantity: number;
  unit: MaterialUnit;
  unitPrice?: number;
  totalPrice?: number;
  currency?: string;
  supplierName?: string;
  receiptUrl?: string;
  phaseId?: string;
  taskId?: string;
  usedAt?: Date;
  notes?: string;
  organizationId?: string;
  sourceSuggestionId?: string;
};

export async function createProjectMaterial(
  projectId: string,
  input: CreateProjectMaterialInput
): Promise<ProjectMaterialDoc> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const uid = requireAuth();
  const name = input.name.trim();
  if (!name) throw new Error("Material name is required");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantity must be a positive number");
  }

  const unitPrice = input.unitPrice;
  const totalPrice =
    input.totalPrice ??
    (unitPrice != null && Number.isFinite(unitPrice) ? unitPrice * input.quantity : undefined);
  const usedAt = input.usedAt ?? new Date();
  const currentUser = getAuthInstance()?.currentUser;
  const displayName = currentUser?.displayName ?? currentUser?.email ?? undefined;

  const currency = resolveMaterialCurrency({ expenseCurrency: input.currency });
  const ref = await addDoc(collection(db, projectMaterialsPath(projectId)), {
    projectId,
    organizationId: input.organizationId ?? null,
    name,
    category: input.category ?? null,
    quantity: input.quantity,
    unit: input.unit,
    unitPrice: unitPrice ?? null,
    totalPrice: totalPrice ?? null,
    currency,
    supplierName: input.supplierName?.trim() ?? null,
    receiptUrl: input.receiptUrl?.trim() ?? null,
    phaseId: input.phaseId ?? null,
    taskId: input.taskId ?? null,
    usedByUserId: uid,
    usedByName: displayName ?? null,
    usedAt: Timestamp.fromDate(usedAt),
    notes: input.notes?.trim() ?? null,
    sourceSuggestionId: input.sourceSuggestionId ?? null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (input.sourceSuggestionId) {
    try {
      await acceptMaterialSuggestion(projectId, input.sourceSuggestionId);
    } catch {
      // non-fatal — material was created
    }
  }

  return {
    id: ref.id,
    projectId,
    organizationId: input.organizationId,
    name,
    category: input.category,
    quantity: input.quantity,
    unit: input.unit,
    unitPrice,
    totalPrice,
    currency,
    supplierName: input.supplierName,
    receiptUrl: input.receiptUrl,
    phaseId: input.phaseId,
    taskId: input.taskId,
    usedByUserId: uid,
    usedByName: displayName,
    usedAt: usedAt.toISOString(),
    notes: input.notes,
    createdBy: uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceSuggestionId: input.sourceSuggestionId,
  };
}

export async function updateProjectMaterial(
  projectId: string,
  materialId: string,
  patch: Partial<CreateProjectMaterialInput>
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  requireAuth();
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) updateData.name = patch.name.trim();
  if (patch.category !== undefined) updateData.category = patch.category ?? null;
  if (patch.quantity !== undefined) updateData.quantity = patch.quantity;
  if (patch.unit !== undefined) updateData.unit = patch.unit;
  if (patch.unitPrice !== undefined) updateData.unitPrice = patch.unitPrice ?? null;
  if (patch.totalPrice !== undefined) {
    updateData.totalPrice = patch.totalPrice ?? null;
  } else if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
    const snap = await getDoc(doc(db, projectMaterialPath(projectId, materialId)));
    if (snap.exists()) {
      const d = snap.data();
      const qty = patch.quantity ?? (typeof d?.quantity === "number" ? d.quantity : 0);
      const price = patch.unitPrice ?? (typeof d?.unitPrice === "number" ? d.unitPrice : undefined);
      if (price != null) updateData.totalPrice = qty * price;
    }
  }
  if (patch.currency !== undefined) updateData.currency = resolveMaterialCurrency({ expenseCurrency: patch.currency });
  if (patch.supplierName !== undefined) updateData.supplierName = patch.supplierName?.trim() ?? null;
  if (patch.receiptUrl !== undefined) updateData.receiptUrl = patch.receiptUrl?.trim() ?? null;
  if (patch.notes !== undefined) updateData.notes = patch.notes?.trim() ?? null;
  if (patch.usedAt !== undefined) updateData.usedAt = Timestamp.fromDate(patch.usedAt);
  await updateDoc(doc(db, projectMaterialPath(projectId, materialId)), updateData);
}

export async function deleteProjectMaterial(projectId: string, materialId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  requireAuth();
  await deleteDoc(doc(db, projectMaterialPath(projectId, materialId)));
}
