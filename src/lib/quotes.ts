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
import type { ActiveWorkspace } from "@/types/workspace";
import { getProjectWorkspaceWriteFields } from "@/services/workspace/workspaceService";
import { computeItemTotal, computeEstimateTotals } from "./estimateUtils";
import type { QuoteDraftItemCategory } from "./quoteDraftItems";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected";

export type QuoteItemLine = {
  id: string;
  category?: QuoteDraftItemCategory;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
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
  createdAt?: string;
  updatedAt?: string;
};

export type QuoteItemInput = {
  category?: QuoteDraftItemCategory;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
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

function parseQuoteItems(raw: unknown): QuoteItemLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const item = row as Record<string, unknown>;
    const qty = typeof item.qty === "number" ? item.qty : 1;
    const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : 0;
    const category =
      item.category === "work" ? "work" : item.category === "material" ? "material" : undefined;
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
    createdAt: toStr(data.createdAt),
    updatedAt: toStr(data.updatedAt),
  };
}

export function buildQuoteItemLines(inputs: QuoteItemInput[]): QuoteItemLine[] {
  return inputs.map((item, index) => {
    const qty = item.qty > 0 ? item.qty : 1;
    const unitPrice = item.unitPrice >= 0 ? item.unitPrice : 0;
    return {
      id: `line_${Date.now()}_${index}`,
      category: item.category,
      name: item.name.trim(),
      qty,
      unit: item.unit.trim() || "ks",
      unitPrice,
      total: computeItemTotal(qty, unitPrice),
    };
  });
}

export function computeQuoteTotals(items: QuoteItemLine[], vatPercent: number) {
  return computeEstimateTotals(items, vatPercent);
}

export async function listQuotesForWorkspace(
  workspace: Workspace,
  uid: string
): Promise<QuoteDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const quotesRef = collection(db, "quotes");
  let q;
  try {
    if (workspace.type === "personal") {
      q = query(
        quotesRef,
        where("ownerId", "==", uid),
        orderBy("updatedAt", "desc"),
        limit(50)
      );
    } else {
      q = query(
        quotesRef,
        where("orgId", "==", workspace.id),
        orderBy("updatedAt", "desc"),
        limit(50)
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => toQuoteDoc(d.id, d.data() as Record<string, unknown>));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "failed-precondition" || err?.message?.includes("index")) {
      throw new Error(
        `Index required. Add Firestore index: quotes ${
          workspace.type === "personal"
            ? "ownerId (Asc), updatedAt (Desc)"
            : "orgId (Asc), updatedAt (Desc)"
        }`
      );
    }
    throw e;
  }
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
  uid: string
): Promise<{ allowed: boolean; quote?: QuoteDoc }> {
  const quote = await getQuote(quoteId);
  if (!quote) return { allowed: false };

  if (quote.ownerId === uid) return { allowed: true, quote };

  if (quote.orgId) {
    const db = getFirestoreInstance();
    if (!db) return { allowed: false, quote };
    const memberRef = doc(db, "organizations", quote.orgId, "members", uid);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) {
      const member = memberSnap.data() as { status?: string };
      if (member.status === "active") return { allowed: true, quote };
    }
  }

  return { allowed: false, quote };
}

export async function createQuote(
  workspace: ActiveWorkspace,
  uid: string,
  input: CreateQuoteInput
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

  const ref = await addDoc(collection(db, "quotes"), {
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
    currency: "EUR",
    notes: input.notes?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...getProjectWorkspaceWriteFields(workspace, uid),
  });

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
  if (input.clientEmail !== undefined) update.clientEmail = input.clientEmail.trim() || null;
  if (input.notes !== undefined) update.notes = input.notes.trim() || null;
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
