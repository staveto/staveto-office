/**
 * Firestore cenové ponuky (quotes) — workspace-scoped, linked to projects.
 */
import {
  getFirestoreInstance,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "./firebase";
import type { Workspace } from "./workspace-types";
import { fromLegacyWorkspace } from "./workspace-types";
import { isNormalizedActiveWorkspace } from "./projects";
import type { ActiveWorkspace } from "@/types/workspace";
import {
  buildQuoteWorkspaceFieldsForNewQuote,
  countHiddenUnscopedQuotes,
  filterQuotesForActiveWorkspace,
  getActiveQuoteScope,
  quoteBelongsToActiveWorkspace,
  type ActiveQuoteScope,
} from "@/lib/quotes/quoteWorkspaceScope";
import type { ProjectDoc } from "./projects";
import { computeItemTotal, computeEstimateTotals } from "./estimateUtils";
import type { QuoteDraftItemCategory } from "./quoteDraftItems";
import { resolveQuoteCurrency } from "@/lib/workspace/countryConfig";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";

const QUOTE_STATUS_RANK: Record<QuoteStatus, number> = {
  accepted: 3,
  sent: 2,
  draft: 1,
  rejected: 0,
};

function preferQuote(a: QuoteDoc, b: QuoteDoc): QuoteDoc {
  const ra = QUOTE_STATUS_RANK[a.status] ?? 0;
  const rb = QUOTE_STATUS_RANK[b.status] ?? 0;
  if (ra !== rb) return ra > rb ? a : b;
  const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
  const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
  return tb > ta ? b : a;
}

/** One quote per linked project — keeps the most relevant doc when duplicates exist. */
export function dedupeQuotesByProject(quotes: QuoteDoc[]): QuoteDoc[] {
  const byProject = new Map<string, QuoteDoc>();
  const standalone: QuoteDoc[] = [];

  for (const quote of quotes) {
    if (!quote.projectId) {
      standalone.push(quote);
      continue;
    }
    const existing = byProject.get(quote.projectId);
    byProject.set(quote.projectId, existing ? preferQuote(existing, quote) : quote);
  }

  return [...standalone, ...byProject.values()];
}

/** Quantity provenance on quote lines (additive — optional on legacy rows). */
export type QuoteSourceOfQuantity =
  | "symbol_detection"
  | "measured_line"
  | "measured_area"
  | "legend_only"
  | "manual"
  | "estimate_rule"
  | "route_calculation"
  | "imported_dwg";

export type QuoteItemLine = {
  id: string;
  category?: QuoteDraftItemCategory;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  /** How the quantity was obtained — legend_only is never plan-confirmed. */
  sourceOfQuantity?: QuoteSourceOfQuantity;
  /** Number of linked plan evidence bboxes (confirmed symbols). */
  evidenceCount?: number;
  /** takeoff/review status when sourced from takeoff pipeline. */
  takeoffStatus?:
    | "draft"
    | "needs_review"
    | "confirmed"
    | "legend_only"
    | "customer_question"
    | "excluded";
};

export type QuoteDoc = {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  clientName: string;
  clientEmail?: string;
  status: QuoteStatus;
  items: QuoteItemLine[];
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  grandTotal: number;
  currency: string;
  notes?: string;
  ownerId?: string;
  orgId?: string;
  workspaceType?: "personal" | "team";
  workspaceId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type QuoteItemInput = {
  category?: QuoteDraftItemCategory;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  sourceOfQuantity?: QuoteSourceOfQuantity;
  evidenceCount?: number;
  takeoffStatus?: QuoteItemLine["takeoffStatus"];
};

export type CreateQuoteInput = {
  title: string;
  clientName: string;
  clientEmail?: string;
  projectId?: string;
  projectName?: string;
  status?: QuoteStatus;
  items: QuoteItemInput[];
  vatPercent?: number;
  notes?: string;
  currency?: string;
};

export type UpdateQuoteInput = {
  title?: string;
  clientName?: string;
  clientEmail?: string;
  status?: QuoteStatus;
  items?: QuoteItemInput[];
  vatPercent?: number;
  notes?: string;
};

function toStr(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    return (raw as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

const SOURCE_OF_QUANTITY_SET = new Set<QuoteSourceOfQuantity>([
  "symbol_detection",
  "measured_line",
  "measured_area",
  "legend_only",
  "manual",
  "estimate_rule",
  "route_calculation",
  "imported_dwg",
]);

function parseSourceOfQuantity(raw: unknown): QuoteSourceOfQuantity | undefined {
  return typeof raw === "string" && SOURCE_OF_QUANTITY_SET.has(raw as QuoteSourceOfQuantity)
    ? (raw as QuoteSourceOfQuantity)
    : undefined;
}

function parseQuoteItems(raw: unknown): QuoteItemLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const item = row as Record<string, unknown>;
    const qty = typeof item.qty === "number" ? item.qty : 1;
    const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : 0;
    const category =
      item.category === "work" ? "work" : item.category === "material" ? "material" : undefined;
    const takeoffStatusRaw = item.takeoffStatus;
    const takeoffStatus =
      takeoffStatusRaw === "draft" ||
      takeoffStatusRaw === "needs_review" ||
      takeoffStatusRaw === "confirmed" ||
      takeoffStatusRaw === "legend_only" ||
      takeoffStatusRaw === "customer_question" ||
      takeoffStatusRaw === "excluded"
        ? takeoffStatusRaw
        : undefined;
    return {
      id: (item.id as string) || `line_${index}`,
      category,
      name: (item.name as string) ?? "",
      qty,
      unit: (item.unit as string) || "ks",
      unitPrice,
      total:
        typeof item.total === "number"
          ? item.total
          : computeItemTotal(qty, unitPrice),
      sourceOfQuantity: parseSourceOfQuantity(item.sourceOfQuantity),
      evidenceCount:
        typeof item.evidenceCount === "number" && item.evidenceCount >= 0
          ? item.evidenceCount
          : undefined,
      takeoffStatus,
    };
  });
}

export function toQuoteDoc(id: string, data: Record<string, unknown>): QuoteDoc {
  const items = parseQuoteItems(data.items);
  const vatPercent = typeof data.vatPercent === "number" ? data.vatPercent : 0;
  const totals = computeEstimateTotals(items, vatPercent);

  return {
    id,
    title: (data.title as string) ?? "",
    projectId: (data.projectId as string) || undefined,
    projectName: (data.projectName as string) || undefined,
    clientName: (data.clientName as string) ?? "",
    clientEmail: (data.clientEmail as string) || undefined,
    status: (data.status as QuoteStatus) || "draft",
    items,
    subtotal: typeof data.subtotal === "number" ? data.subtotal : totals.subtotal,
    vatPercent,
    vatAmount: typeof data.vatAmount === "number" ? data.vatAmount : totals.vatAmount,
    grandTotal: typeof data.grandTotal === "number" ? data.grandTotal : totals.grandTotal,
    currency: (data.currency as string) || "EUR",
    notes: (data.notes as string) || undefined,
    ownerId: (data.ownerId as string) || undefined,
    orgId: (data.orgId as string) || undefined,
    workspaceType: data.workspaceType as "personal" | "team" | undefined,
    workspaceId: (data.workspaceId as string) || undefined,
    createdBy: (data.createdBy as string) || undefined,
    createdAt: toStr(data.createdAt),
    updatedAt: toStr(data.updatedAt),
  };
}

export function buildQuoteItemLines(inputs: QuoteItemInput[]): QuoteItemLine[] {
  return inputs.map((item, index) => {
    const qty = item.qty > 0 ? item.qty : 1;
    const unitPrice = item.unitPrice >= 0 ? item.unitPrice : 0;
    // Firestore rejects `undefined` in nested maps — only set optional fields when present.
    const line: QuoteItemLine = {
      id: `line_${Date.now()}_${index}`,
      name: item.name.trim(),
      qty,
      unit: (item.unit ?? "").trim() || "ks",
      unitPrice,
      total: computeItemTotal(qty, unitPrice),
    };
    if (item.category) line.category = item.category;
    if (item.sourceOfQuantity) line.sourceOfQuantity = item.sourceOfQuantity;
    if (typeof item.evidenceCount === "number" && item.evidenceCount >= 0) {
      line.evidenceCount = item.evidenceCount;
    }
    if (item.takeoffStatus) line.takeoffStatus = item.takeoffStatus;
    return line;
  });
}

export function computeQuoteTotals(items: QuoteItemLine[], vatPercent: number) {
  return computeEstimateTotals(items, vatPercent);
}

function isQuotesIndexError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "failed-precondition" || (err?.message?.includes("index") ?? false);
}

function sortQuotesByUpdatedAt(quotes: QuoteDoc[]): QuoteDoc[] {
  return [...quotes].sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });
}

async function runScopedQuotesQuery(
  quotesRef: ReturnType<typeof collection>,
  field: "orgId" | "ownerId" | "workspaceId",
  value: string,
  options?: { withOrderBy?: boolean; workspaceType?: string }
): Promise<QuoteDoc[]> {
  const withOrderBy = options?.withOrderBy !== false;
  let q;
  if (options?.workspaceType) {
    q = query(
      quotesRef,
      where("workspaceId", "==", value),
      where("workspaceType", "==", options.workspaceType),
      limit(50)
    );
  } else if (withOrderBy) {
    q = query(quotesRef, where(field, "==", value), orderBy("updatedAt", "desc"), limit(50));
  } else {
    q = query(quotesRef, where(field, "==", value), limit(50));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => toQuoteDoc(d.id, d.data() as Record<string, unknown>));
}

function toActiveWorkspaceForQuotes(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): ActiveWorkspace | null {
  if (isNormalizedActiveWorkspace(workspace)) return workspace;
  return fromLegacyWorkspace(workspace, uid);
}

async function queryQuotesForScope(scope: ActiveQuoteScope): Promise<QuoteDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const quotesRef = collection(db, "quotes");
  const found = new Map<string, QuoteDoc>();

  const merge = (rows: QuoteDoc[]) => {
    for (const row of rows) found.set(row.id, row);
  };

  if (scope.activeWorkspaceType === "company") {
    try {
      merge(await runScopedQuotesQuery(quotesRef, "orgId", scope.activeWorkspaceId));
    } catch (e) {
      if (!isQuotesIndexError(e) && !isFirestorePermissionError(e)) throw e;
      merge(
        await runScopedQuotesQuery(quotesRef, "orgId", scope.activeWorkspaceId, {
          withOrderBy: false,
        })
      );
    }
    try {
      merge(
        await runScopedQuotesQuery(quotesRef, "workspaceId", scope.activeWorkspaceId, {
          withOrderBy: false,
          workspaceType: "team",
        })
      );
    } catch (e) {
      if (!isQuotesIndexError(e) && !isFirestorePermissionError(e)) throw e;
    }
  } else {
    try {
      merge(await runScopedQuotesQuery(quotesRef, "ownerId", scope.userId));
    } catch (e) {
      if (!isQuotesIndexError(e) && !isFirestorePermissionError(e)) throw e;
      merge(
        await runScopedQuotesQuery(quotesRef, "ownerId", scope.userId, { withOrderBy: false })
      );
    }
  }

  return [...found.values()];
}

export async function listQuotesForWorkspace(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<QuoteDoc[]> {
  const active = toActiveWorkspaceForQuotes(workspace, uid);
  const scope = getActiveQuoteScope({ workspace: active, userId: uid });
  if (!scope) return [];

  let raw: QuoteDoc[] = [];
  try {
    raw = await queryQuotesForScope(scope);
  } catch {
    return [];
  }

  const hiddenUnscoped = countHiddenUnscopedQuotes(raw);
  if (process.env.NODE_ENV === "development" && hiddenUnscoped > 0) {
    console.warn(`[quotes] hidden unscoped quote count: ${hiddenUnscoped}`);
  }

  const visible = filterQuotesForActiveWorkspace(raw, scope);
  return sortQuotesByUpdatedAt(visible).slice(0, 50);
}

export async function listQuotesForProject(
  projectId: string,
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<QuoteDoc[]> {
  const active = toActiveWorkspaceForQuotes(workspace, uid);
  const scope = getActiveQuoteScope({ workspace: active, userId: uid });
  if (!scope) return [];

  const db = getFirestoreInstance();
  if (!db) return [];

  const quotesRef = collection(db, "quotes");
  const found = new Map<string, QuoteDoc>();

  const runScoped = async (field: "orgId" | "ownerId", value: string) => {
    try {
      const q = query(
        quotesRef,
        where(field, "==", value),
        where("projectId", "==", projectId)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        found.set(d.id, toQuoteDoc(d.id, d.data() as Record<string, unknown>));
      }
    } catch (e) {
      if (!isFirestorePermissionError(e) && !isQuotesIndexError(e)) throw e;
    }
  };

  if (scope.activeWorkspaceType === "company") {
    await runScoped("orgId", scope.activeWorkspaceId);
  } else {
    await runScoped("ownerId", scope.userId);
  }

  return filterQuotesForActiveWorkspace([...found.values()], scope);
}

function isFirestorePermissionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  const message = String((err as { message?: string })?.message ?? "").toLowerCase();
  return (
    code === "permission-denied" ||
    code === "firestore/permission-denied" ||
    message.includes("missing or insufficient permissions")
  );
}

export async function getQuote(quoteId: string): Promise<QuoteDoc | null> {
  const db = getFirestoreInstance();
  if (!db) return null;

  const snap = await getDoc(doc(db, "quotes", quoteId));
  if (!snap.exists()) return null;
  return toQuoteDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function hasQuoteAccess(
  quoteId: string,
  uid: string,
  workspace: Workspace | ActiveWorkspace | null | undefined
): Promise<{ allowed: boolean; quote?: QuoteDoc }> {
  const active = workspace ? toActiveWorkspaceForQuotes(workspace, uid) : null;
  const scope = getActiveQuoteScope({ workspace: active, userId: uid });
  if (!scope) return { allowed: false };

  const quote = await getQuote(quoteId);
  if (!quote) return { allowed: false };
  if (!quoteBelongsToActiveWorkspace(quote, scope)) return { allowed: false, quote };
  return { allowed: true, quote };
}

export async function createQuote(
  workspace: ActiveWorkspace,
  uid: string,
  input: CreateQuoteInput,
  scopeProject?: Pick<ProjectDoc, "orgId" | "ownerId" | "workspaceType" | "workspaceId">
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const title = input.title?.trim();
  const clientName = input.clientName?.trim();
  if (!title) throw new Error("Quote title is required");
  if (!clientName) throw new Error("Client name is required");

  const validItems = input.items.filter((i) => i.name?.trim());
  if (validItems.length === 0) throw new Error("At least one line item is required");

  const items = buildQuoteItemLines(validItems);
  const vatPercent = input.vatPercent ?? 20;
  const totals = computeQuoteTotals(items, vatPercent);

  const scope = getActiveQuoteScope({ workspace, userId: uid });
  if (!scope) throw new Error("QUOTE_SCOPE_MISSING");

  if (scopeProject) {
    const projectScoped = quoteBelongsToActiveWorkspace(
      {
        orgId: scopeProject.orgId,
        ownerId: scopeProject.ownerId,
        workspaceId: scopeProject.workspaceId,
        workspaceType: scopeProject.workspaceType,
      },
      scope
    );
    if (!projectScoped) throw new Error("QUOTE_PROJECT_OUT_OF_SCOPE");
  }

  const workspaceFields = buildQuoteWorkspaceFieldsForNewQuote(scope);

  const payload: Record<string, unknown> = {
    title,
    clientName,
    clientEmail: input.clientEmail?.trim() || null,
    projectId: input.projectId || null,
    projectName: input.projectName?.trim() || null,
    status: input.status ?? "draft",
    items,
    subtotal: totals.subtotal,
    vatPercent,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grandTotal,
    currency: resolveQuoteCurrency({ currency: input.currency }),
    notes: input.notes?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...workspaceFields,
  };

  const ref = await addDoc(collection(db, "quotes"), payload);
  return ref.id;
}

export async function updateQuote(
  quoteId: string,
  input: UpdateQuoteInput
): Promise<QuoteDoc> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, "quotes", quoteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Quote not found");

  const existing = toQuoteDoc(snap.id, snap.data() as Record<string, unknown>);
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (input.title !== undefined) update.title = input.title.trim();
  if (input.clientName !== undefined) update.clientName = input.clientName.trim();
  if (input.clientEmail !== undefined) {
    update.clientEmail = (input.clientEmail ?? "").trim() || null;
  }
  if (input.notes !== undefined) update.notes = (input.notes ?? "").trim() || null;
  if (input.status !== undefined) update.status = input.status;

  const vatPercent = input.vatPercent ?? existing.vatPercent;
  let items = existing.items;

  if (input.items !== undefined) {
    const validItems = input.items.filter((i) => i.name?.trim());
    if (validItems.length === 0) throw new Error("At least one line item is required");
    items = buildQuoteItemLines(validItems);
    update.items = items;
  }

  if (input.vatPercent !== undefined || input.items !== undefined) {
    const totals = computeQuoteTotals(items, vatPercent);
    update.vatPercent = vatPercent;
    update.subtotal = totals.subtotal;
    update.vatAmount = totals.vatAmount;
    update.grandTotal = totals.grandTotal;
  }

  await updateDoc(ref, update);

  const updated = await getDoc(ref);
  return toQuoteDoc(quoteId, updated.data() as Record<string, unknown>);
}

export async function updateQuoteStatus(
  quoteId: string,
  status: QuoteStatus
): Promise<QuoteDoc> {
  return updateQuote(quoteId, { status });
}

export async function deleteQuote(quoteId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await deleteDoc(doc(db, "quotes", quoteId));
}
