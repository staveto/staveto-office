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

export type ProjectDoc = {
  id: string;
  name: string;
  projectType?: string;
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

function toProjectDoc(id: string, data: Record<string, unknown>): ProjectDoc {
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
  };
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

/**
 * List projects for the active workspace.
 * Uses indexed query: ownerId/orgId + orderBy(updatedAt desc) + limit(50).
 */
export async function listProjectsForWorkspace(
  workspace: Workspace,
  uid: string
): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const projectsRef = collection(db, "projects");
  let q;

  try {
    if (workspace.type === "personal") {
      q = query(
        projectsRef,
        where("ownerId", "==", uid),
        orderBy("updatedAt", "desc"),
        limit(50)
      );
    } else {
      q = query(
        projectsRef,
        where("orgId", "==", workspace.id),
        orderBy("updatedAt", "desc"),
        limit(50)
      );
    }
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => toProjectDoc(d.id, d.data() as Record<string, unknown>))
      .filter((p) => !p.archivedAt);
  } catch (e) {
    wrapIndexError(
      e,
      workspace.type === "personal"
        ? "projects: ownerId (Asc), updatedAt (Desc)"
        : "projects: orgId (Asc), updatedAt (Desc)"
    );
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
export async function createProject(
  workspace: Workspace,
  uid: string,
  data: { name: string; addressText?: string; city?: string }
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const name = data.name?.trim();
  if (!name) throw new Error("Project name is required");

  const projectData: Record<string, unknown> = {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (workspace.type === "personal") {
    projectData.ownerId = uid;
    projectData.workspaceType = "personal";
    projectData.workspaceId = uid;
  } else {
    projectData.orgId = workspace.id;
    projectData.workspaceType = "team";
    projectData.workspaceId = workspace.id;
  }

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
    const memberRef = doc(db, "organizations", project.orgId, "members", uid);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) {
      const member = memberSnap.data() as { status?: string };
      if (member.status === "active") return { allowed: true, project };
    }
  }

  return { allowed: false, project };
}

/** Back-compat: list projects for personal workspace (ownerId). */
export async function listMyProjects(uid: string): Promise<ProjectDoc[]> {
  return listProjectsForWorkspace({ id: "personal", name: "Personal", type: "personal" }, uid);
}
