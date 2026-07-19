/**
 * Quote business logic — create from draft zákazka, sync project lifecycle.
 */
import {
  createQuote as createQuoteDoc,
  dedupeQuotesByProject,
  getQuote,
  listQuotesForProject,
  listQuotesForWorkspace,
  updateQuote,
  updateQuoteStatus,
  deleteQuote,
  hasQuoteAccess as hasQuoteAccessScoped,
  type CreateQuoteInput,
  type UpdateQuoteInput,
  type QuoteDoc,
  type QuoteStatus,
} from "@/lib/quotes";
import {
  hasProjectAccess,
  listProjectsForWorkspace,
  type ProjectDoc,
} from "@/lib/projects";
import { resolveProjectQuoteLineItems, projectHasQuoteDraft } from "@/lib/projectQuoteDraft";
import { parseAiSetupMeta } from "@/components/projects/setup/aiSetupHelpers";
import { defaultVatPercentForCountry, mergeWorkspaceLocale, resolveCountryConfig } from "@/lib/workspace/countryConfig";
import { getFirestoreInstance, doc, getDoc, updateDoc, serverTimestamp } from "@/lib/firebase";
import type { ActiveWorkspace } from "@/types/workspace";
import type { Workspace } from "@/lib/workspace-types";
import { fromLegacyWorkspace } from "@/lib/workspace-types";
import { isNormalizedActiveWorkspace } from "@/lib/projects";
import type {
  ProjectLifecycleStatus,
  ProjectQuoteStatus,
  ProjectSalesStatus,
} from "@/lib/projectLifecycle";

function plainNotesFromProjectDraft(notes?: string | null): string {
  if (!notes?.trim()) return "";
  try {
    const parsed = JSON.parse(notes) as { plainNotes?: string };
    return parsed.plainNotes?.trim() ?? "";
  } catch {
    return notes.trim();
  }
}

async function resolveQuoteCurrencyForWorkspace(workspace: ActiveWorkspace): Promise<string> {
  if (workspace.type !== "company" || !workspace.orgId) {
    return resolveCountryConfig("SK").currency;
  }
  const db = getFirestoreInstance();
  if (!db) return resolveCountryConfig("SK").currency;
  const snap = await getDoc(doc(db, "organizations", workspace.orgId));
  if (!snap.exists()) return resolveCountryConfig("SK").currency;
  const data = snap.data() as { countryCode?: string; country?: string; currency?: string };
  const countryCode = data.countryCode ?? data.country ?? null;
  return mergeWorkspaceLocale(countryCode, {
    currency: data.currency ?? undefined,
  }).currency;
}

function toActiveWorkspace(workspace: Workspace | ActiveWorkspace, uid: string): ActiveWorkspace {
  if (isNormalizedActiveWorkspace(workspace)) return workspace;
  return fromLegacyWorkspace(workspace, uid);
}

/** Derive quote scope from project fields when syncing linked quotes. */
function activeWorkspaceFromProject(
  project: Pick<ProjectDoc, "orgId" | "ownerId">,
  uid: string
): ActiveWorkspace {
  if (project.orgId) {
    return {
      id: project.orgId,
      type: "company",
      name: "Company",
      role: "owner",
      source: "organization",
      orgId: project.orgId,
    };
  }
  return {
    id: "personal",
    type: "personal",
    name: "Personal",
    role: "owner",
    source: "personal",
    ownerId: project.ownerId ?? uid,
  };
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

type ProjectQuoteSyncFields = Pick<
  ProjectDoc,
  "orgId" | "ownerId" | "phase" | "salesStatus" | "quoteStatus" | "lifecycleStatus"
>;

/** Map project lifecycle → top-level quote doc status (inverse of syncProjectFromQuote). */
export function resolveQuoteStatusFromProject(
  project: Pick<ProjectDoc, "phase" | "salesStatus" | "quoteStatus" | "lifecycleStatus">
): QuoteStatus | null {
  const lifecycle = project.lifecycleStatus;
  const sales = project.salesStatus;
  const quote = project.quoteStatus;

  if (lifecycle === "rejected" || sales === "rejected") return "rejected";
  if (sales === "accepted" || project.phase === "delivery") return "accepted";
  if (quote === "accepted" || lifecycle === "accepted") return "accepted";
  if (quote === "sent" || sales === "quote_sent" || lifecycle === "quote_sent") return "sent";
  if (quote === "draft" || sales === "draft" || lifecycle === "quote_drafted") return "draft";
  return null;
}

/** Push project lifecycle onto linked Firestore quote docs (no project write-back). */
export async function syncQuotesFromProjectLifecycle(
  projectId: string,
  project: ProjectQuoteSyncFields
): Promise<void> {
  const targetStatus = resolveQuoteStatusFromProject(project);
  if (!targetStatus) return;

  const uid = project.ownerId?.trim();
  if (!uid) return;

  const active = activeWorkspaceFromProject(project, uid);
  const quotes = await listQuotesForProject(projectId, active, uid);

  await Promise.all(
    quotes
      .filter((q) => q.status !== targetStatus)
      .map((q) => updateQuoteStatus(q.id, targetStatus))
  );
}

/** Retroactive fix — active delivery projects should not leave linked quotes in draft. */
export async function syncQuoteStatusesFromProjects(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<void> {
  const active = toActiveWorkspace(workspace, uid);
  const projects = await listProjectsForWorkspace(active, uid);
  const db = getFirestoreInstance();

  await Promise.all(
    projects.map(async (project) => {
      const target = resolveQuoteStatusFromProject(project);
      if (!target || target === "draft") return;
      try {
        if (
          db &&
          target === "accepted" &&
          project.quoteStatus !== "accepted" &&
          (project.phase === "delivery" || project.salesStatus === "accepted")
        ) {
          await updateDoc(doc(db, "projects", project.id), {
            quoteStatus: "accepted" satisfies ProjectQuoteStatus,
            updatedAt: serverTimestamp(),
          });
        }
        await syncQuotesFromProjectLifecycle(project.id, {
          ...project,
          quoteStatus: target === "accepted" ? "accepted" : project.quoteStatus,
        });
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[quotes] lifecycle sync failed for project", project.id, err);
        }
      }
    })
  );
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
  const lineItems = await resolveProjectQuoteLineItems(project);
  if (lineItems.length === 0) {
    throw new Error("Add at least one material or work line on the draft job first");
  }

  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const active = toActiveWorkspace(workspace, uid);
  const currency = await resolveQuoteCurrencyForWorkspace(active);
  const scopeProject = {
    orgId: project.orgId ?? active.orgId ?? (active.type === "company" ? active.id : undefined),
    ownerId: project.ownerId ?? uid,
    workspaceType: project.workspaceType,
    workspaceId: project.workspaceId,
  };
  const quoteId = await createQuoteDoc(
    active,
    uid,
    {
      title: project.name || "Cenová ponuka",
      clientName:
        project.customerCompanyName?.trim() ||
        project.customerName?.trim() ||
        project.name ||
        "Zákazník",
      clientEmail: project.customerEmail,
      projectId,
      projectName: project.name,
      status: "draft",
      vatPercent: meta?.calculation?.vatPercent ?? project.quoteDraftVatPercent ?? defaultVatPercentForCountry(null),
      notes: plainNotesFromProjectDraft(project.quoteDraftNotes),
      currency,
      items: lineItems,
    },
    scopeProject
  );

  await syncProjectFromQuote(projectId, quoteId, "draft");
  return quoteId;
}

export async function upsertQuoteFromProject(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  projectId: string
): Promise<string> {
  const access = await hasProjectAccess(projectId, uid);
  if (!access.allowed || !access.project) {
    throw new Error("Project not found or access denied");
  }

  const project = access.project;
  const active = toActiveWorkspace(workspace, uid);
  const lineItems = await resolveProjectQuoteLineItems(project);
  if (lineItems.length === 0) {
    throw new Error("Add at least one material or work line on the draft job first");
  }

  const projectQuotes = await listQuotesForProject(projectId, active, uid);
  const existing =
    projectQuotes.find((q) => q.status === "draft") ?? projectQuotes[0];

  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const clientName =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    project.name?.trim() ||
    "Customer";

  const payload = {
    title: project.name?.trim() || "Quote",
    clientName,
    clientEmail: project.customerEmail,
    status: "draft" as const,
    vatPercent: meta?.calculation?.vatPercent ?? project.quoteDraftVatPercent ?? defaultVatPercentForCountry(null),
    notes: plainNotesFromProjectDraft(project.quoteDraftNotes),
    items: lineItems,
  };

  if (existing) {
    await updateQuote(existing.id, payload);
    await syncProjectFromQuote(projectId, existing.id, "draft");
    return existing.id;
  }

  return createQuoteFromProject(workspace, uid, projectId);
}

function isProjectNewerThanQuote(
  project: Pick<ProjectDoc, "updatedAt">,
  quote: Pick<QuoteDoc, "updatedAt">
): boolean {
  const tp = project.updatedAt ? Date.parse(project.updatedAt) : 0;
  const tq = quote.updatedAt ? Date.parse(quote.updatedAt) : 0;
  return tp > tq;
}

/**
 * Refresh an already-linked DRAFT quote from the project's current draft
 * (items, totals, VAT, notes). Sent/accepted/rejected quotes are never
 * touched. Unlike upsertQuoteFromProject this performs no project
 * write-back — bumping project.updatedAt here would make the project look
 * forever newer than the quote and re-trigger the refresh on every load.
 *
 * Returns the refreshed quote, or null when there is nothing to do.
 */
export async function refreshLinkedDraftQuoteFromProject(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  projectId: string,
  opts?: { onlyIfProjectNewer?: boolean }
): Promise<QuoteDoc | null> {
  const access = await hasProjectAccess(projectId, uid);
  if (!access.allowed || !access.project) return null;
  const project = access.project;

  const active = toActiveWorkspace(workspace, uid);
  const projectQuotes = await listQuotesForProject(projectId, active, uid);
  const draftQuote = projectQuotes.find((q) => q.status === "draft");
  if (!draftQuote) return null;

  if (opts?.onlyIfProjectNewer && !isProjectNewerThanQuote(project, draftQuote)) {
    return null;
  }

  const lineItems = await resolveProjectQuoteLineItems(project);
  if (lineItems.length === 0) return null;

  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const clientName =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    project.name?.trim() ||
    "Customer";

  return updateQuote(draftQuote.id, {
    title: project.name?.trim() || draftQuote.title,
    clientName,
    clientEmail: project.customerEmail,
    vatPercent:
      meta?.calculation?.vatPercent ??
      project.quoteDraftVatPercent ??
      draftQuote.vatPercent,
    notes: plainNotesFromProjectDraft(project.quoteDraftNotes),
    items: lineItems,
  });
}

function sortQuotesByUpdatedAt(quotes: QuoteDoc[]): QuoteDoc[] {
  return [...quotes].sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });
}

/**
 * Keep top-level quote docs in step with project drafts:
 *  - create missing quotes for projects that already have draft quote items
 *  - refresh linked DRAFT quotes whose project changed after the quote,
 *    so the quotes list always shows the current draft items and totals
 */
export async function syncMissingQuotesFromProjects(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<void> {
  const active = toActiveWorkspace(workspace, uid);
  const [quotes, projects] = await Promise.all([
    listQuotesForWorkspace(active, uid),
    listProjectsForWorkspace(active, uid),
  ]);

  const linkedDraftByProjectId = new Map<string, QuoteDoc>();
  const linkedProjectIds = new Set<string>();
  for (const q of quotes) {
    if (!q.projectId) continue;
    linkedProjectIds.add(q.projectId);
    if (q.status === "draft" && !linkedDraftByProjectId.has(q.projectId)) {
      linkedDraftByProjectId.set(q.projectId, q);
    }
  }

  for (const project of projects) {
    try {
      if (!linkedProjectIds.has(project.id)) {
        if (!projectHasQuoteDraft(project)) continue;
        await upsertQuoteFromProject(active, uid, project.id);
        linkedProjectIds.add(project.id);
        continue;
      }

      const linkedDraft = linkedDraftByProjectId.get(project.id);
      if (linkedDraft && isProjectNewerThanQuote(project, linkedDraft)) {
        await refreshLinkedDraftQuoteFromProject(active, uid, project.id);
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[quotes] sync failed for project", project.id, err);
      }
    }
  }
}

/** Scoped quote list — Firestore quote documents only (never projects). */
export async function listQuotesForWorkspaceEnsured(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<QuoteDoc[]> {
  const active = toActiveWorkspace(workspace, uid);

  try {
    await syncMissingQuotesFromProjects(active, uid);
    await syncQuoteStatusesFromProjects(active, uid);
  } catch {
    // Continue with scoped Firestore reads if sync fails.
  }

  const firestoreQuotesRaw = await listQuotesForWorkspace(active, uid);
  const firestoreQuotes = dedupeQuotesByProject(firestoreQuotesRaw);

  return sortQuotesByUpdatedAt(firestoreQuotes).slice(0, 50);
}

export async function hasQuoteAccess(
  quoteId: string,
  uid: string,
  workspace: Workspace | ActiveWorkspace | null | undefined
) {
  return hasQuoteAccessScoped(quoteId, uid, workspace);
}

export async function saveQuote(
  quoteId: string,
  uid: string,
  input: UpdateQuoteInput,
  workspace: Workspace | ActiveWorkspace
): Promise<QuoteDoc> {
  const access = await hasQuoteAccess(quoteId, uid, workspace);
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
  status: QuoteStatus,
  workspace: Workspace | ActiveWorkspace
): Promise<QuoteDoc> {
  const access = await hasQuoteAccess(quoteId, uid, workspace);
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

export async function removeQuote(
  quoteId: string,
  uid: string,
  workspace: Workspace | ActiveWorkspace
): Promise<void> {
  const access = await hasQuoteAccess(quoteId, uid, workspace);
  if (!access.allowed) throw new Error("Access denied");
  await deleteQuote(quoteId);
}

export {
  listQuotesForWorkspace,
  getQuote,
  type QuoteDoc,
  type QuoteStatus,
  type CreateQuoteInput,
  type UpdateQuoteInput,
};
