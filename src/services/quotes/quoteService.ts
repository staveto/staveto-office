/**
 * Quote business logic — create from draft zákazka, sync project lifecycle.
 */
import {
  createQuote as createQuoteDoc,
  getQuote,
  listQuotesForWorkspace,
  updateQuote,
  updateQuoteStatus,
  deleteQuote,
  hasQuoteAccess,
  type CreateQuoteInput,
  type UpdateQuoteInput,
  type QuoteDoc,
  type QuoteStatus,
} from "@/lib/quotes";
import { hasProjectAccess, listProjectQuoteDraftItems } from "@/lib/projects";
import { getFirestoreInstance, doc, updateDoc, serverTimestamp } from "@/lib/firebase";
import type { ActiveWorkspace } from "@/types/workspace";
import type { Workspace } from "@/lib/workspace-types";
import { toLegacyWorkspace, fromLegacyWorkspace } from "@/lib/workspace-types";
import { isNormalizedActiveWorkspace } from "@/lib/projects";
import type {
  ProjectLifecycleStatus,
  ProjectQuoteStatus,
  ProjectSalesStatus,
} from "@/lib/projectLifecycle";

function toActiveWorkspace(workspace: Workspace | ActiveWorkspace, uid: string): ActiveWorkspace {
  if (isNormalizedActiveWorkspace(workspace)) return workspace;
  return fromLegacyWorkspace(workspace, uid);
}

async function syncProjectFromQuote(
  projectId: string,
  quoteId: string,
  status: QuoteStatus
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;

  const projectRef = doc(db, "projects", projectId);
  const update: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  const quoteStatusMap: Record<QuoteStatus, ProjectQuoteStatus> = {
    draft: "draft",
    sent: "sent",
    accepted: "accepted",
    rejected: "rejected",
  };

  const lifecycleMap: Record<QuoteStatus, ProjectLifecycleStatus> = {
    draft: "quote_drafted",
    sent: "quote_sent",
    accepted: "accepted",
    rejected: "rejected",
  };

  const salesMap: Record<QuoteStatus, ProjectSalesStatus | undefined> = {
    draft: "draft",
    sent: "quote_sent",
    accepted: "accepted",
    rejected: "rejected",
  };

  update.quoteStatus = quoteStatusMap[status];
  update.lifecycleStatus = lifecycleMap[status];
  const sales = salesMap[status];
  if (sales) update.salesStatus = sales;
  if (status === "accepted") update.acceptedQuoteId = quoteId;

  await updateDoc(projectRef, update);
}

export async function createQuoteFromProject(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  projectId: string
): Promise<string> {
  const access = await hasProjectAccess(projectId, uid);
  if (!access.allowed || !access.project) {
    throw new Error("Project not found or access denied");
  }

  const project = access.project;
  const draftItems = await listProjectQuoteDraftItems(projectId);
  if (draftItems.length === 0) {
    throw new Error("Add at least one material or work line on the draft job first");
  }

  const active = toActiveWorkspace(workspace, uid);
  const quoteId = await createQuoteDoc(active, uid, {
    title: project.name || "Cenová ponuka",
    clientName: project.customerName || project.name || "Zákazník",
    clientEmail: project.customerEmail,
    projectId,
    projectName: project.name,
    status: "draft",
    vatPercent: project.quoteDraftVatPercent ?? 20,
    notes: project.quoteDraftNotes,
    items: draftItems.map((row) => ({
      category: row.category,
      name: row.name,
      qty: row.qty,
      unit: row.unit,
      unitPrice: row.unitPrice,
    })),
  });

  await syncProjectFromQuote(projectId, quoteId, "draft");
  return quoteId;
}

export async function saveQuote(
  quoteId: string,
  uid: string,
  input: UpdateQuoteInput
): Promise<QuoteDoc> {
  const access = await hasQuoteAccess(quoteId, uid);
  if (!access.allowed) throw new Error("Access denied");

  const updated = await updateQuote(quoteId, input);
  if (input.status && updated.projectId) {
    await syncProjectFromQuote(updated.projectId, quoteId, input.status);
  }
  return updated;
}

export async function setQuoteStatus(
  quoteId: string,
  uid: string,
  status: QuoteStatus
): Promise<QuoteDoc> {
  const access = await hasQuoteAccess(quoteId, uid);
  if (!access.allowed) throw new Error("Access denied");

  const updated = await updateQuoteStatus(quoteId, status);
  if (updated.projectId) {
    await syncProjectFromQuote(updated.projectId, quoteId, status);
  }
  return updated;
}

export async function createStandaloneQuote(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  input: CreateQuoteInput
): Promise<string> {
  const active = toActiveWorkspace(workspace, uid);
  return createQuoteDoc(active, uid, input);
}

export async function removeQuote(quoteId: string, uid: string): Promise<void> {
  const access = await hasQuoteAccess(quoteId, uid);
  if (!access.allowed) throw new Error("Access denied");
  await deleteQuote(quoteId);
}

export {
  listQuotesForWorkspace,
  getQuote,
  hasQuoteAccess,
  toLegacyWorkspace,
  type QuoteDoc,
  type QuoteStatus,
  type CreateQuoteInput,
  type UpdateQuoteInput,
};
