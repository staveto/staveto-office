/**
 * Firestore query layer for Projects, Tasks, Expenses.
 * Same data model as mobile app. Workspace-aware (Personal / Team).
 * Uses indexed queries only; no in-memory fallbacks.
 */
import {
  getFirestoreInstance,
  doc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "./firebase";
import type { Workspace } from "./workspace-types";
import type { ActiveWorkspace } from "@/types/workspace";
import { getProjectWorkspaceWriteFields } from "@/services/workspace/workspaceService";
import { ensureOrgMemberForOwner } from "@/lib/organizations";
import { fromLegacyWorkspace } from "./workspace-types";

/** Thrown when a Firestore index is required but missing. */
export class FirestoreIndexError extends Error {
  constructor(
    message: string,
    public readonly indexFields: string
  ) {
    super(message);
    this.name = "FirestoreIndexError";
  }
}

import type {
  ProjectPhase,
  ProjectLifecycleStatus,
  ProjectSalesStatus,
  ProjectQuoteStatus,
  JobSource,
} from "./projectLifecycle";
import type { WorkType } from "./workTypes";
export type { WorkType } from "./workTypes";
export { getProjectWorkType, isWorkType } from "./workTypes";
import { isDraftJob } from "./projectLifecycle";
import type {
  QuoteDraftItemCategory,
  QuoteDraftItemDoc,
  QuoteDraftItemInput,
} from "./quoteDraftItems";
export type {
  QuoteDraftItemCategory,
  QuoteDraftItemDoc,
  QuoteDraftItemInput,
} from "./quoteDraftItems";

export type {
  ProjectPhase,
  ProjectLifecycleStatus,
  ProjectSalesStatus,
  ProjectQuoteStatus,
  JobSource,
} from "./projectLifecycle";

export type ProjectDoc = {
  id: string;
  name: string;
  /** Mobile-aligned work type enum (see `workTypes.ts`). */
  projectType?: string;
  /** Optional alias; prefer `projectType` on write. */
  workType?: WorkType;
  addressText?: string;
  city?: string;
  countryCode?: string;
  ownerId?: string;
  orgId?: string;
  workspaceType?: "personal" | "team";
  workspaceId?: string;
  archivedAt?: unknown;
  createdAt?: string;
  updatedAt?: string;
  sharedWithCount?: number;
  isSharedToMe?: boolean;
  phase?: ProjectPhase;
  lifecycleStatus?: ProjectLifecycleStatus;
  salesStatus?: ProjectSalesStatus;
  quoteStatus?: ProjectQuoteStatus;
  customerId?: string;
  customerRequest?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  internalNote?: string;
  source?: JobSource;
  convertedAt?: string;
  acceptedQuoteId?: string;
  /** Draft quote prep — optional, ignored by mobile until supported */
  quoteDraftVatPercent?: number;
  quoteDraftNotes?: string;
};

export type TaskDoc = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  phaseId?: string | null;
  order?: number;
  required?: boolean;
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
};

export type ExpenseCategory = "MATERIAL" | "WORK" | "OTHER" | "TRAVEL";

export type ExpenseDoc = {
  id: string;
  projectId: string;
  title: string;
  amount: number | null;
  currency: string;
  date: string;
  note?: string;
  category?: ExpenseCategory;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function toProjectDoc(id: string, data: Record<string, unknown>): ProjectDoc {
  const toStr = (raw: unknown): string | undefined => {
    if (!raw) return undefined;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null && "toDate" in raw) {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    }
    return undefined;
  };
  return {
    id,
    name: (data.name as string) ?? "",
    projectType: data.projectType as string | undefined,
    workType: data.workType as WorkType | undefined,
    addressText: (data.addressText as string) || undefined,
    city: (data.city as string) || undefined,
    countryCode: (data.countryCode as string) || undefined,
    ownerId: (data.ownerId as string) || undefined,
    orgId: (data.orgId as string) || undefined,
    workspaceType: data.workspaceType as "personal" | "team" | undefined,
    workspaceId: (data.workspaceId as string) || undefined,
    archivedAt: data.archivedAt,
    createdAt: toStr(data.createdAt),
    updatedAt: toStr(data.updatedAt),
    sharedWithCount: typeof data.sharedWithCount === "number" ? data.sharedWithCount : undefined,
    isSharedToMe: !!data.isSharedToMe,
    phase: data.phase as ProjectPhase | undefined,
    lifecycleStatus: data.lifecycleStatus as ProjectLifecycleStatus | undefined,
    salesStatus: data.salesStatus as ProjectSalesStatus | undefined,
    quoteStatus: data.quoteStatus as ProjectQuoteStatus | undefined,
    customerId: (data.customerId as string) || undefined,
    customerRequest: (data.customerRequest as string) || undefined,
    customerName: (data.customerName as string) || undefined,
    customerEmail: (data.customerEmail as string) || undefined,
    internalNote: (data.internalNote as string) || undefined,
    customerPhone: (data.customerPhone as string) || undefined,
    source: data.source as JobSource | undefined,
    convertedAt: toStr(data.convertedAt),
    acceptedQuoteId: (data.acceptedQuoteId as string) || undefined,
    quoteDraftVatPercent:
      typeof data.quoteDraftVatPercent === "number" ? data.quoteDraftVatPercent : undefined,
    quoteDraftNotes: (data.quoteDraftNotes as string) || undefined,
  };
}

function toQuoteDraftItemDoc(
  id: string,
  projectId: string,
  data: Record<string, unknown>
): QuoteDraftItemDoc {
  const toStr = (raw: unknown): string | undefined => {
    if (!raw) return undefined;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null && "toDate" in raw) {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    }
    return undefined;
  };
  const category = data.category === "work" ? "work" : "material";
  return {
    id,
    projectId,
    category,
    name: (data.name as string) ?? "",
    qty: typeof data.qty === "number" ? data.qty : 1,
    unit: (data.unit as string) || "ks",
    unitPrice: typeof data.unitPrice === "number" ? data.unitPrice : 0,
    note: (data.note as string) || undefined,
    createdAt: toStr(data.createdAt),
    updatedAt: toStr(data.updatedAt),
  };
}

async function assertDraftJobForQuoteItems(projectId: string): Promise<ProjectDoc> {
  const project = await getProject(projectId);
  if (!project || !isDraftJob(project)) {
    throw new Error("Quote items can only be edited on draft jobs");
  }
  return project;
}

async function touchQuoteDraftProjectMeta(projectId: string, itemCount: number): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;
  const update: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    quoteStatus: "draft",
  };
  if (itemCount > 0) {
    update.lifecycleStatus = "quote_drafted";
  }
  await updateDoc(doc(db, "projects", projectId), update);
}

function toTaskDoc(id: string, projectId: string, data: Record<string, unknown>): TaskDoc {
  const toStr = (raw: unknown): string | undefined => {
    if (!raw) return undefined;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null && "toDate" in raw) {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    }
    return undefined;
  };
  return {
    id,
    projectId,
    title: (data.title as string) ?? "",
    status: (data.status as string) ?? "OPEN",
    phaseId: (data.phaseId as string | null | undefined) ?? undefined,
    order: typeof data.order === "number" ? data.order : undefined,
    required: data.required as boolean | undefined,
    assigneeId: (data.assigneeId as string | null) ?? undefined,
    assigneeName: (data.assigneeName as string | null) ?? undefined,
    dueDate: (data.dueDate as string) || undefined,
    createdAt: toStr(data.createdAt),
    updatedAt: toStr(data.updatedAt),
    isActive: data.isActive !== undefined ? (data.isActive as boolean) : undefined,
  };
}

function toExpenseDoc(id: string, projectId: string, data: Record<string, unknown>): ExpenseDoc {
  const toStr = (raw: unknown): string | undefined => {
    if (!raw) return undefined;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null && "toDate" in raw) {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    }
    return undefined;
  };
  return {
    id,
    projectId,
    title: (data.title as string) ?? "",
    amount: (data.amount as number | null) ?? null,
    currency: (data.currency as string) ?? "EUR",
    date: toStr(data.date) ?? new Date().toISOString(),
    note: (data.note as string) || undefined,
    category: data.category as ExpenseCategory | undefined,
    status: (data.status as string) || undefined,
    createdAt: toStr(data.createdAt),
    updatedAt: toStr(data.updatedAt),
  };
}

function wrapIndexError(e: unknown, indexFields: string): never {
  const err = e as { code?: string; message?: string };
  if (err?.code === "failed-precondition" || err?.message?.includes("index")) {
    throw new FirestoreIndexError(
      `Index required. Please add Firestore index: ${indexFields}`,
      indexFields
    );
  }
  throw e;
}

export function isFirebasePermissionDenied(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return (
    err?.code === "permission-denied" ||
    (typeof err?.message === "string" &&
      err.message.toLowerCase().includes("insufficient permissions"))
  );
}

function resolveListScope(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): { mode: "personal" } | { mode: "team"; orgId: string } {
  if (isNormalizedActiveWorkspace(workspace)) {
    if (workspace.type === "personal") return { mode: "personal" };
    return { mode: "team", orgId: workspace.orgId ?? workspace.id };
  }
  if (workspace.type === "personal") return { mode: "personal" };
  return { mode: "team", orgId: workspace.id };
}

async function runProjectsQuery(
  projectsRef: ReturnType<typeof collection>,
  scope: { mode: "personal"; uid: string } | { mode: "team"; orgId: string },
  options?: { withOrderBy?: boolean }
): Promise<ProjectDoc[]> {
  const withOrderBy = options?.withOrderBy !== false;
  let q;
  if (scope.mode === "personal") {
    q = withOrderBy
      ? query(
          projectsRef,
          where("ownerId", "==", scope.uid),
          orderBy("updatedAt", "desc"),
          limit(50)
        )
      : query(projectsRef, where("ownerId", "==", scope.uid), limit(50));
  } else {
    q = withOrderBy
      ? query(
          projectsRef,
          where("orgId", "==", scope.orgId),
          orderBy("updatedAt", "desc"),
          limit(50)
        )
      : query(projectsRef, where("orgId", "==", scope.orgId), limit(50));
  }
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toProjectDoc(d.id, d.data() as Record<string, unknown>))
    .filter((p) => !p.archivedAt);
}

/**
 * List projects for the active workspace.
 * Uses indexed query: ownerId/orgId + orderBy(updatedAt desc) + limit(50).
 */
export async function listProjectsForWorkspace(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const scope = resolveListScope(workspace, uid);
  const projectsRef = collection(db, "projects");

  if (scope.mode === "team") {
    await ensureOrgMemberForOwner(scope.orgId, uid);
  }

  const queryScope =
    scope.mode === "personal"
      ? ({ mode: "personal" as const, uid })
      : ({ mode: "team" as const, orgId: scope.orgId });

  const indexHint =
    scope.mode === "personal"
      ? "projects: ownerId (Asc), updatedAt (Desc)"
      : "projects: orgId (Asc), updatedAt (Desc)";

  try {
    return await runProjectsQuery(projectsRef, queryScope, { withOrderBy: true });
  } catch (e) {
    if (isFirebasePermissionDenied(e) && scope.mode === "team") {
      await ensureOrgMemberForOwner(scope.orgId, uid);
      try {
        return await runProjectsQuery(projectsRef, queryScope, { withOrderBy: true });
      } catch (retryErr) {
        if (!isFirebasePermissionDenied(retryErr)) {
          wrapIndexError(retryErr, indexHint);
        }
        try {
          return await runProjectsQuery(projectsRef, queryScope, { withOrderBy: false });
        } catch (fallbackErr) {
          if (isFirebasePermissionDenied(fallbackErr)) {
            throw new Error(
              "Missing or insufficient permissions. Deploy Firestore rules from firestore.rules (see docs/FIRESTORE_RULES_NOTES.md)."
            );
          }
          wrapIndexError(fallbackErr, indexHint);
        }
      }
    }
    wrapIndexError(e, indexHint);
  }
}

/** Get a single project by ID. */
export async function getProject(projectId: string): Promise<ProjectDoc | null> {
  const db = getFirestoreInstance();
  if (!db) return null;

  const ref = doc(db, "projects", projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  return toProjectDoc(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Create a new project.
 * Personal: ownerId=uid, workspaceType=personal, workspaceId=uid
 * Team: orgId=activeOrgId, workspaceType=team, workspaceId=orgId
 */
export function isNormalizedActiveWorkspace(
  workspace: Workspace | ActiveWorkspace
): workspace is ActiveWorkspace {
  return (
    "source" in workspace &&
    (workspace.source === "personal" || workspace.source === "organization")
  );
}

function toActiveWorkspaceForWrite(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): ActiveWorkspace {
  if (isNormalizedActiveWorkspace(workspace)) {
    return workspace;
  }
  return fromLegacyWorkspace(workspace, uid);
}

export async function createProject(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  data: { name: string; addressText?: string; city?: string }
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const name = data.name?.trim();
  if (!name) throw new Error("Project name is required");

  const active = toActiveWorkspaceForWrite(workspace, uid);
  const projectData: Record<string, unknown> = {
    name,
    phase: "delivery",
    lifecycleStatus: "in_progress",
    quoteStatus: "none",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...getProjectWorkspaceWriteFields(active, uid),
  };

  if (data.addressText?.trim()) projectData.addressText = data.addressText.trim();
  if (data.city?.trim()) projectData.city = data.city.trim();

  const ref = await addDoc(collection(db, "projects"), projectData);
  return ref.id;
}

/**
 * List tasks for a project.
 * Uses orderBy(createdAt, "desc"), limit(100).
 */
export async function listProjectTasks(projectId: string): Promise<TaskDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const tasksRef = collection(db, "projects", projectId, "tasks");
  try {
    const q = query(
      tasksRef,
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => toTaskDoc(d.id, projectId, d.data() as Record<string, unknown>))
      .filter((t) => t.isActive !== false)
      .reverse(); // Show oldest first (newest at bottom for quick add)
  } catch (e) {
    wrapIndexError(e, "projects/{projectId}/tasks: createdAt (Desc)");
  }
}

/**
 * Create a new task in a project.
 */
export async function createTask(
  projectId: string,
  title: string
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const trimmed = title?.trim();
  if (!trimmed) throw new Error("Task title is required");

  const ref = await addDoc(collection(db, "projects", projectId, "tasks"), {
    title: trimmed,
    status: "OPEN",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    order: 0,
  });
  return ref.id;
}

/**
 * List expenses for a project.
 * Uses orderBy(date, "desc").
 */
export async function listProjectExpenses(projectId: string): Promise<ExpenseDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const expensesRef = collection(db, "projects", projectId, "expenses");
  try {
    const q = query(expensesRef, orderBy("date", "desc"));

    const snap = await getDocs(q);
    return snap.docs.map((d) =>
      toExpenseDoc(d.id, projectId, d.data() as Record<string, unknown>)
    );
  } catch (e) {
    wrapIndexError(e, "projects/{projectId}/expenses: date (Desc)");
  }
}

async function updateProjectUpdatedAt(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;
  const ref = doc(db, "projects", projectId);
  await updateDoc(ref, { updatedAt: serverTimestamp() });
}

/**
 * Create an expense in a project.
 */
export async function createExpense(
  projectId: string,
  uid: string,
  data: {
    title: string;
    amount: number;
    currency?: string;
    date: string;
    category?: ExpenseCategory;
    note?: string;
  }
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const title = data.title?.trim() || "";
  if (!title) throw new Error("Expense title is required");
  const amount = typeof data.amount === "number" ? data.amount : 0;
  const dateStr = data.date || new Date().toISOString().slice(0, 10);
  const dateTimestamp = Timestamp.fromDate(new Date(dateStr));

  const ref = await addDoc(collection(db, "projects", projectId, "expenses"), {
    ownerId: uid,
    projectId,
    title,
    amount,
    currency: data.currency ?? "EUR",
    date: dateTimestamp,
    category: data.category ?? null,
    note: data.note?.trim() ?? null,
    source: "MANUAL",
    status: "READY",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateProjectUpdatedAt(projectId);
  return ref.id;
}

/**
 * Update an expense.
 */
export async function updateExpense(
  projectId: string,
  expenseId: string,
  data: Partial<{
    title: string;
    amount: number;
    currency: string;
    date: string;
    category: ExpenseCategory;
    note: string;
  }>
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "projects", projectId, "expenses", expenseId);
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.title !== undefined) update.title = data.title.trim();
  if (data.amount !== undefined) update.amount = data.amount;
  if (data.currency !== undefined) update.currency = data.currency;
  if (data.date !== undefined) update.date = Timestamp.fromDate(new Date(data.date));
  if (data.category !== undefined) update.category = data.category;
  if (data.note !== undefined) update.note = data.note.trim() || null;

  await updateDoc(ref, update);
  await updateProjectUpdatedAt(projectId);
}

/**
 * Delete an expense.
 */
export async function deleteExpense(projectId: string, expenseId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "projects", projectId, "expenses", expenseId);
  await deleteDoc(ref);
  await updateProjectUpdatedAt(projectId);
}

/** Toggle task status between DONE and OPEN. */
export async function updateTaskStatus(
  projectId: string,
  taskId: string,
  status: "DONE" | "OPEN"
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "projects", projectId, "tasks", taskId);
  await updateDoc(ref, {
    status,
    updatedAt: serverTimestamp(),
    ...(status === "DONE" ? { doneAt: serverTimestamp() } : { doneAt: null }),
  });
}

/**
 * List quote draft line items (materials + work) for a draft zákazka.
 * No composite index — sorted in memory.
 */
export async function listProjectQuoteDraftItems(
  projectId: string
): Promise<QuoteDraftItemDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const itemsRef = collection(db, "projects", projectId, "quoteItems");
  const snap = await getDocs(itemsRef);
  const categoryOrder: Record<QuoteDraftItemCategory, number> = { material: 0, work: 1 };
  return snap.docs
    .map((d) => toQuoteDraftItemDoc(d.id, projectId, d.data() as Record<string, unknown>))
    .sort((a, b) => {
      const cat = categoryOrder[a.category] - categoryOrder[b.category];
      if (cat !== 0) return cat;
      const ta = a.createdAt ?? "";
      const tb = b.createdAt ?? "";
      return ta.localeCompare(tb);
    });
}

export async function createQuoteDraftItem(
  projectId: string,
  input: QuoteDraftItemInput
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  await assertDraftJobForQuoteItems(projectId);

  const name = input.name?.trim();
  if (!name) throw new Error("Item name is required");

  const qty = typeof input.qty === "number" && input.qty > 0 ? input.qty : 1;
  const unitPrice = typeof input.unitPrice === "number" && input.unitPrice >= 0 ? input.unitPrice : 0;
  const unit = input.unit?.trim() || "ks";
  const category: QuoteDraftItemCategory = input.category === "work" ? "work" : "material";

  const ref = await addDoc(collection(db, "projects", projectId, "quoteItems"), {
    category,
    name,
    qty,
    unit,
    unitPrice,
    note: input.note?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const items = await listProjectQuoteDraftItems(projectId);
  await touchQuoteDraftProjectMeta(projectId, items.length);
  return ref.id;
}

export async function updateQuoteDraftItem(
  projectId: string,
  itemId: string,
  data: Partial<QuoteDraftItemInput>
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  await assertDraftJobForQuoteItems(projectId);

  const ref = doc(db, "projects", projectId, "quoteItems", itemId);
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error("Item name is required");
    update.name = trimmed;
  }
  if (data.qty !== undefined) update.qty = data.qty > 0 ? data.qty : 1;
  if (data.unit !== undefined) update.unit = data.unit.trim() || "ks";
  if (data.unitPrice !== undefined) update.unitPrice = data.unitPrice >= 0 ? data.unitPrice : 0;
  if (data.category !== undefined) {
    update.category = data.category === "work" ? "work" : "material";
  }
  if (data.note !== undefined) update.note = data.note.trim() || null;

  await updateDoc(ref, update);
  await updateProjectUpdatedAt(projectId);
}

export async function deleteQuoteDraftItem(
  projectId: string,
  itemId: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  await assertDraftJobForQuoteItems(projectId);

  await deleteDoc(doc(db, "projects", projectId, "quoteItems", itemId));
  const items = await listProjectQuoteDraftItems(projectId);
  await touchQuoteDraftProjectMeta(projectId, items.length);
  await updateProjectUpdatedAt(projectId);
}

/**
 * Check if user has access to project.
 * Personal: ownerId == uid
 * Team: project.orgId set and organizations/{orgId}/members/{uid} exists
 */
export async function hasProjectAccess(
  projectId: string,
  uid: string
): Promise<{ allowed: boolean; project?: ProjectDoc }> {
  const project = await getProject(projectId);
  if (!project) return { allowed: false };

  if (project.ownerId === uid) return { allowed: true, project };

  if (project.orgId) {
    const db = getFirestoreInstance();
    if (!db) return { allowed: false, project };
    const orgSnap = await getDoc(doc(db, "organizations", project.orgId));
    if (orgSnap.exists()) {
      const org = orgSnap.data() as { ownerUid?: string };
      if (org.ownerUid === uid) return { allowed: true, project };
    }
    const memberRef = doc(db, "organizations", project.orgId, "members", uid);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) {
      const member = memberSnap.data() as { status?: string };
      if (!member.status || member.status === "active") return { allowed: true, project };
    }
  }

  return { allowed: false, project };
}

/** Back-compat: list projects for personal workspace (ownerId). */
export async function listMyProjects(uid: string): Promise<ProjectDoc[]> {
  return listProjectsForWorkspace({ id: "personal", name: "Personal", type: "personal" }, uid);
}
