/**
 * Project expenses — types, CRUD, and workspace aggregation aligned with mobile.
 * Firestore path: projects/{projectId}/expenses
 */
import {
  getFirestoreInstance,
  doc,
  getDocs,
  addDoc,
  collection,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "@/lib/firebase";
import type { ProjectDoc } from "@/lib/projects";
import {
  hasProjectAccess,
  listProjectsForWorkspace,
  isNormalizedActiveWorkspace,
} from "@/lib/projects";
import type { Workspace } from "@/lib/workspace-types";
import type { ActiveWorkspace } from "@/types/workspace";
import { fromLegacyWorkspace } from "@/lib/workspace-types";
import type { WorkspaceRole } from "@/types/workspace";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";

export type ExpenseSource = "MANUAL" | "DOCUMENT";
export type ExpenseStatus = "PROCESSING" | "READY" | "FAILED";
export type ExpenseCategory = "MATERIAL" | "WORK" | "OTHER" | "TRAVEL";
export type OcrStatus = "success" | "done" | "failed" | "limit" | "cancelled" | "pending";
export type UploadStatus = "pending" | "uploaded" | "failed";

export type TravelExpenseData = {
  fromAddress: string;
  toAddress: string;
  distanceKm: number;
  ratePerKm: number;
  roundTrip: boolean;
  billableToClient?: boolean;
};

export type ExpenseDoc = {
  id: string;
  projectId: string;
  title: string;
  amount: number | null;
  currency: string;
  date: string;
  note?: string;
  taskId?: string | null;
  phaseId?: string | null;
  attachmentId?: string | null;
  source?: ExpenseSource;
  status?: ExpenseStatus;
  category?: ExpenseCategory;
  supplierName?: string;
  supplierIco?: string;
  uploadStatus?: UploadStatus;
  filePath?: string;
  mimeType?: string;
  ocrStatus?: OcrStatus;
  ocrParsedAt?: string;
  ocrSupplierName?: string;
  ocrInvoiceNumber?: string;
  ocrIssueDate?: string;
  ocrTotalAmount?: number | null;
  ocrVatAmount?: number | null;
  ocrCurrency?: string;
  ocrAuditSnapshot?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  travel?: TravelExpenseData;
  ownerId?: string;
};

export type ExpenseRangeKey = "today" | "7d" | "30d" | "month";
export type ExpenseProjectFilter = "all" | "mine" | "shared";

export type ProjectExpensesBundle = {
  project: ProjectDoc;
  expenses: ExpenseDoc[];
};

export type ExpenseExportRow = {
  projectName: string;
  date: string;
  title: string;
  amount: number | null;
  currency: string;
  supplierName?: string;
  category?: string;
  note?: string;
};

export type CreateExpenseInput = {
  title: string;
  amount: number;
  currency?: string;
  date: string;
  category?: ExpenseCategory;
  note?: string;
  supplierName?: string;
  supplierIco?: string;
  travel?: TravelExpenseData | null;
  /** Provenance — defaults to MANUAL; set to DOCUMENT for OCR/invoice-scanned expenses. */
  source?: ExpenseSource;
  /** OCR audit fields (only persisted for DOCUMENT source). */
  ocrInvoiceNumber?: string | null;
  ocrIssueDate?: string | null;
  ocrTotalAmount?: number | null;
  ocrVatAmount?: number | null;
  ocrCurrency?: string | null;
  ocrSupplierName?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
};

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

/** Thrown when a Firestore index is required but missing. */
export class FirestoreIndexError extends Error {
  constructor(
    message: string,
    public readonly indexFields?: string
  ) {
    super(message);
    this.name = "FirestoreIndexError";
  }
}

function wrapIndexError(e: unknown, indexFields: string): never {
  const err = e as { code?: string; message?: string };
  if (err?.code === "failed-precondition" || err?.message?.includes("index")) {
    throw new FirestoreIndexError(
      `Firestore index required for ${indexFields}. Create the index in Firebase Console.`,
      indexFields
    );
  }
  throw e;
}

function firestoreValueToIsoString(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
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

function parseTravel(t: unknown): TravelExpenseData | undefined {
  if (!t || typeof t !== "object" || Array.isArray(t)) return undefined;
  const o = t as Record<string, unknown>;
  const from = o.fromAddress as string;
  const to = o.toAddress as string;
  const km = o.distanceKm as number;
  const rate = o.ratePerKm as number;
  const round = o.roundTrip as boolean;
  if (typeof from !== "string" || typeof to !== "string" || typeof km !== "number") return undefined;
  return {
    fromAddress: from,
    toAddress: to,
    distanceKm: km,
    ratePerKm: typeof rate === "number" ? rate : 0.2,
    roundTrip: !!round,
    billableToClient: typeof o.billableToClient === "boolean" ? o.billableToClient : undefined,
  };
}

export function toExpenseDoc(id: string, projectId: string, data: Record<string, unknown>): ExpenseDoc {
  const statusRaw = data.status as string | undefined;
  const status: ExpenseStatus | undefined =
    statusRaw === "PROCESSING" || statusRaw === "READY" || statusRaw === "FAILED"
      ? statusRaw
      : statusRaw
        ? (statusRaw as ExpenseStatus)
        : "READY";

  const sourceRaw = data.source as string | undefined;
  const source: ExpenseSource | undefined =
    sourceRaw === "MANUAL" || sourceRaw === "DOCUMENT" ? sourceRaw : "MANUAL";

  const supplierName =
    typeof data.supplierName === "string"
      ? data.supplierName
      : typeof data.ocrSupplierName === "string"
        ? data.ocrSupplierName
        : undefined;

  return {
    id,
    projectId,
    title: (data.title as string) ?? "",
    amount: typeof data.amount === "number" ? data.amount : data.amount === null ? null : null,
    currency: (data.currency as string) ?? "EUR",
    date: firestoreValueToIsoString(data.date) ?? new Date().toISOString(),
    note: typeof data.note === "string" ? data.note : undefined,
    taskId: (data.taskId as string | null) ?? undefined,
    phaseId: (data.phaseId as string | null) ?? undefined,
    attachmentId: (data.attachmentId as string | null) ?? undefined,
    source,
    status,
    category: data.category as ExpenseCategory | undefined,
    supplierName,
    supplierIco: typeof data.supplierIco === "string" ? data.supplierIco : undefined,
    uploadStatus: data.uploadStatus as UploadStatus | undefined,
    filePath: typeof data.filePath === "string" ? data.filePath : undefined,
    mimeType: typeof data.mimeType === "string" ? data.mimeType : undefined,
    ocrStatus: data.ocrStatus as OcrStatus | undefined,
    ocrParsedAt: firestoreValueToIsoString(data.ocrParsedAt),
    ocrSupplierName: typeof data.ocrSupplierName === "string" ? data.ocrSupplierName : undefined,
    ocrInvoiceNumber: typeof data.ocrInvoiceNumber === "string" ? data.ocrInvoiceNumber : undefined,
    ocrIssueDate: typeof data.ocrIssueDate === "string" ? data.ocrIssueDate : undefined,
    ocrTotalAmount:
      typeof data.ocrTotalAmount === "number"
        ? data.ocrTotalAmount
        : data.ocrTotalAmount === null
          ? null
          : undefined,
    ocrVatAmount:
      typeof data.ocrVatAmount === "number"
        ? data.ocrVatAmount
        : data.ocrVatAmount === null
          ? null
          : undefined,
    ocrCurrency: typeof data.ocrCurrency === "string" ? data.ocrCurrency : undefined,
    ocrAuditSnapshot:
      data.ocrAuditSnapshot != null &&
      typeof data.ocrAuditSnapshot === "object" &&
      !Array.isArray(data.ocrAuditSnapshot)
        ? (data.ocrAuditSnapshot as Record<string, unknown>)
        : undefined,
    createdAt: firestoreValueToIsoString(data.createdAt),
    updatedAt: firestoreValueToIsoString(data.updatedAt),
    travel: parseTravel(data.travel),
    ownerId: typeof data.ownerId === "string" ? data.ownerId : undefined,
  };
}

function sortExpensesByDateDesc(expenses: ExpenseDoc[]): ExpenseDoc[] {
  return [...expenses].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
}

async function updateProjectUpdatedAt(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;
  await updateDoc(doc(db, "projects", projectId), { updatedAt: serverTimestamp() });
}

/** List expenses for a project (ordered by date desc, with unordered fallback). */
export async function listProjectExpenses(projectId: string): Promise<ExpenseDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const expensesRef = collection(db, "projects", projectId, "expenses");
  try {
    const q = query(expensesRef, orderBy("date", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => toExpenseDoc(d.id, projectId, d.data() as Record<string, unknown>));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "failed-precondition" || err?.message?.includes("index")) {
      try {
        const snap = await getDocs(expensesRef);
        const items = snap.docs.map((d) =>
          toExpenseDoc(d.id, projectId, d.data() as Record<string, unknown>)
        );
        return sortExpensesByDateDesc(items);
      } catch (fallbackErr) {
        wrapIndexError(fallbackErr, "projects/{projectId}/expenses: date (Desc)");
      }
    }
    throw e;
  }
}

/** Create a manual expense (source MANUAL, status READY). */
export async function createExpense(
  projectId: string,
  uid: string,
  data: CreateExpenseInput
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const title = data.title?.trim() || "";
  if (!title) throw new Error("Expense title is required");
  const amount = typeof data.amount === "number" ? data.amount : 0;
  const dateStr = data.date || new Date().toISOString().slice(0, 10);
  const dateTimestamp = Timestamp.fromDate(new Date(dateStr));

  const payload: Record<string, unknown> = {
    ownerId: uid,
    projectId,
    title,
    amount,
    currency: data.currency ?? "EUR",
    date: dateTimestamp,
    category: data.category ?? null,
    note: data.note?.trim() ?? null,
    source: data.source ?? "MANUAL",
    status: "READY",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (data.supplierName?.trim()) payload.supplierName = data.supplierName.trim();
  if (data.supplierIco?.trim()) payload.supplierIco = data.supplierIco.trim();

  if (data.source === "DOCUMENT") {
    if (data.filePath?.trim()) payload.filePath = data.filePath.trim();
    if (data.mimeType?.trim()) payload.mimeType = data.mimeType.trim();
    if (data.ocrInvoiceNumber?.trim()) payload.ocrInvoiceNumber = data.ocrInvoiceNumber.trim();
    if (data.ocrIssueDate?.trim()) payload.ocrIssueDate = data.ocrIssueDate.trim();
    if (typeof data.ocrTotalAmount === "number") payload.ocrTotalAmount = data.ocrTotalAmount;
    if (typeof data.ocrVatAmount === "number") payload.ocrVatAmount = data.ocrVatAmount;
    if (data.ocrCurrency?.trim()) payload.ocrCurrency = data.ocrCurrency.trim();
    if (data.ocrSupplierName?.trim()) payload.ocrSupplierName = data.ocrSupplierName.trim();
    payload.ocrStatus = "success";
  }
  if (data.category === "TRAVEL" && data.travel) {
    payload.travel = {
      fromAddress: data.travel.fromAddress.trim(),
      toAddress: data.travel.toAddress.trim(),
      distanceKm: data.travel.distanceKm,
      ratePerKm: data.travel.ratePerKm,
      roundTrip: data.travel.roundTrip,
      billableToClient: data.travel.billableToClient ?? false,
    };
  }

  const ref = await addDoc(collection(db, "projects", projectId, "expenses"), payload);
  await updateProjectUpdatedAt(projectId);
  return ref.id;
}

/** Update an expense. */
export async function updateExpense(
  projectId: string,
  expenseId: string,
  data: UpdateExpenseInput
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
  if (data.supplierName !== undefined) update.supplierName = data.supplierName.trim() || null;
  if (data.supplierIco !== undefined) update.supplierIco = data.supplierIco.trim() || null;
  if (data.travel !== undefined) {
    if (data.travel) {
      update.travel = {
        fromAddress: data.travel.fromAddress.trim(),
        toAddress: data.travel.toAddress.trim(),
        distanceKm: data.travel.distanceKm,
        ratePerKm: data.travel.ratePerKm,
        roundTrip: data.travel.roundTrip,
        billableToClient: data.travel.billableToClient ?? false,
      };
    } else {
      update.travel = null;
    }
  }

  await updateDoc(ref, update);
  await updateProjectUpdatedAt(projectId);
}

/** Delete an expense. */
export async function deleteExpense(projectId: string, expenseId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  await deleteDoc(doc(db, "projects", projectId, "expenses", expenseId));
  await updateProjectUpdatedAt(projectId);
}

export function getExpenseRangeBounds(rangeKey: ExpenseRangeKey): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  let from: Date;

  switch (rangeKey) {
    case "today":
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from = new Date(now);
      from.setDate(from.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      break;
    case "30d":
      from = new Date(now);
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      break;
    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      from.setHours(0, 0, 0, 0);
      break;
    default:
      from = new Date(now);
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

/** Only READY expenses with amount in range — mirrors mobile ExpensesKpiScreen. */
export function filterExpensesByRange(expenses: ExpenseDoc[], rangeKey: ExpenseRangeKey): ExpenseDoc[] {
  const { from, to } = getExpenseRangeBounds(rangeKey);
  return expenses.filter((exp) => {
    if (!exp.date || exp.status !== "READY" || exp.amount == null) return false;
    const d = new Date(exp.date);
    return d >= from && d <= to;
  });
}

export function isReadyExpense(exp: ExpenseDoc): boolean {
  return exp.status === "READY" && exp.amount != null;
}

export function sumReadyExpenses(expenses: ExpenseDoc[]): number {
  return expenses.filter(isReadyExpense).reduce((sum, e) => sum + (e.amount ?? 0), 0);
}

export function sumTravelExpenses(expenses: ExpenseDoc[]): number {
  return expenses
    .filter((e) => isReadyExpense(e) && e.category === "TRAVEL")
    .reduce((sum, e) => sum + (e.amount ?? 0), 0);
}

export function computeTravelAmount(travel: TravelExpenseData): number {
  const multiplier = travel.roundTrip ? 2 : 1;
  return Math.round(travel.distanceKm * travel.ratePerKm * multiplier * 100) / 100;
}

function escapeCsv(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildExpensesKpiCsv(rows: ExpenseExportRow[], rangeLabel: string): string {
  const lines: string[] = [];
  lines.push(`Výdavky - ${escapeCsv(rangeLabel)}`);
  lines.push(`Exportované: ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("Projekt,Dátum,Názov,Suma,Mena,Dodávateľ,Kategória,Poznámka");
  for (const e of rows) {
    lines.push(
      [
        escapeCsv(e.projectName),
        escapeCsv(e.date),
        escapeCsv(e.title),
        escapeCsv(e.amount ?? ""),
        escapeCsv(e.currency ?? "EUR"),
        escapeCsv(e.supplierName ?? ""),
        escapeCsv(e.category ?? ""),
        escapeCsv(e.note ?? ""),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCsvFile(csv: string, fileName: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function toActiveWorkspace(workspace: Workspace | ActiveWorkspace, uid: string): ActiveWorkspace {
  if (isNormalizedActiveWorkspace(workspace)) return workspace;
  return fromLegacyWorkspace(workspace, uid);
}

export async function listExpensesForWorkspace(
  workspace: Workspace | ActiveWorkspace,
  userId: string
): Promise<ProjectExpensesBundle[]> {
  const active = toActiveWorkspace(workspace, userId);
  const projects = await listProjectsForWorkspace(active, userId);
  const bundles: ProjectExpensesBundle[] = [];

  for (const project of projects) {
    const { allowed } = await hasProjectAccess(project.id, userId);
    if (!allowed) continue;
    try {
      const expenses = await listProjectExpenses(project.id);
      bundles.push({ project, expenses });
    } catch {
      // skip projects without read access or load errors
    }
  }

  return bundles;
}

export function canWriteExpenses(role: WorkspaceRole | undefined): boolean {
  return canManageCompanyOperations(role);
}

export function canEditProjectExpenses(
  project: ProjectDoc,
  userId: string,
  role: WorkspaceRole | undefined
): boolean {
  if (project.ownerId === userId) return true;
  if (project.orgId && canManageCompanyOperations(role)) return true;
  return false;
}

export function getRangeLabelKey(rangeKey: ExpenseRangeKey): string {
  switch (rangeKey) {
    case "today":
      return "expensesKpi.today";
    case "7d":
      return "expensesKpi.days7";
    case "30d":
      return "expensesKpi.days30";
    case "month":
      return "expensesKpi.thisMonth";
    default:
      return "expensesKpi.days30";
  }
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["MATERIAL", "WORK", "OTHER", "TRAVEL"];

export function expenseSupplierLabel(exp: ExpenseDoc): string | undefined {
  return exp.supplierName || exp.ocrSupplierName;
}

export function formatExpenseDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}
