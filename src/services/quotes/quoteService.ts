/**
 * Quote business logic — create from draft zákazka, sync project lifecycle.
 */
import {
  createQuote as createQuoteDoc,
  getQuote,
  listQuotesForProject,
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
import {
  hasProjectAccess,
  listProjectQuoteDraftItems,
  listProjectTasks,
  listProjectsForWorkspace,
  type ProjectDoc,
} from "@/lib/projects";
import {
  buildProjectQuoteDisplayLines,
  projectHasQuoteDraft,
  resolveProjectQuoteLineItems,
} from "@/lib/projectQuoteDraft";
import { buildQuoteDocFromProjectDraft } from "@/lib/projectQuotePrint";
import { listMaterialSuggestions } from "@/services/materials/projectMaterialsService";
import { parseAiSetupMeta } from "@/components/projects/setup/aiSetupHelpers";
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

function plainNotesFromProjectDraft(notes?: string | null): string {
  if (!notes?.trim()) return "";
  try {
    const parsed = JSON.parse(notes) as { plainNotes?: string };
    return parsed.plainNotes?.trim() ?? "";
  } catch {
    return notes.trim();
  }
}

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
  const lineItems = await resolveProjectQuoteLineItems(project);
  if (lineItems.length === 0) {
    throw new Error("Add at least one material or work line on the draft job first");
  }

  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const active = toActiveWorkspace(workspace, uid);
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
      vatPercent: meta?.calculation.vatPercent ?? project.quoteDraftVatPercent ?? 8.1,
      notes: plainNotesFromProjectDraft(project.quoteDraftNotes),
      currency: "CHF",
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

  const quoteScope = {
    orgId: project.orgId ?? active.orgId ?? (active.type === "company" ? active.id : null),
    ownerId: project.ownerId ?? uid,
  };

  const projectQuotes = await listQuotesForProject(projectId, quoteScope);
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
    vatPercent: meta?.calculation.vatPercent ?? project.quoteDraftVatPercent ?? 8.1,
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

function sortQuotesByUpdatedAt(quotes: QuoteDoc[]): QuoteDoc[] {
  return [...quotes].sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });
}

async function buildVirtualQuotesFromProjects(
  projects: ProjectDoc[],
  linkedProjectIds: Set<string>
): Promise<QuoteDoc[]> {
  const virtual: QuoteDoc[] = [];

  await Promise.all(
    projects.map(async (project) => {
      if (linkedProjectIds.has(project.id)) return;
      if (!projectHasQuoteDraft(project)) return;

      try {
        const [quoteItems, tasks, suggestions] = await Promise.all([
          listProjectQuoteDraftItems(project.id),
          listProjectTasks(project.id).catch(() => []),
          listMaterialSuggestions(project.id).catch(() => []),
        ]);
        const lines = buildProjectQuoteDisplayLines(project, quoteItems, tasks, suggestions);
        if (lines.length === 0 && (project.quoteStatus ?? "none") === "none") return;

        virtual.push(
          buildQuoteDocFromProjectDraft(project, quoteItems, tasks, "CHF", suggestions)
        );
      } catch {
        // Skip unreadable project drafts.
      }
    })
  );

  return virtual;
}

/** Create missing top-level quote docs for projects that already have draft quote items. */
export async function syncMissingQuotesFromProjects(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<void> {
  const active = toActiveWorkspace(workspace, uid);
  const legacy = toLegacyWorkspace(active);
  const [quotes, projects] = await Promise.all([
    listQuotesForWorkspace(legacy, uid),
    listProjectsForWorkspace(active, uid),
  ]);

  const linkedProjectIds = new Set(
    quotes.map((q) => q.projectId).filter((id): id is string => !!id)
  );

  for (const project of projects) {
    if (linkedProjectIds.has(project.id)) continue;
    if (!projectHasQuoteDraft(project)) continue;

    try {
      await upsertQuoteFromProject(active, uid, project.id);
      linkedProjectIds.add(project.id);
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[quotes] sync failed for project", project.id, err);
      }
    }
  }
}

export async function listQuotesForWorkspaceEnsured(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<QuoteDoc[]> {
  const active = toActiveWorkspace(workspace, uid);
  const legacy = toLegacyWorkspace(active);

  try {
    await syncMissingQuotesFromProjects(active, uid);
  } catch {
    // Continue with virtual project drafts if Firestore sync fails.
  }

  const [firestoreQuotes, projects] = await Promise.all([
    listQuotesForWorkspace(legacy, uid),
    listProjectsForWorkspace(active, uid),
  ]);

  const linkedProjectIds = new Set(
    firestoreQuotes.map((q) => q.projectId).filter((id): id is string => !!id)
  );
  const virtualQuotes = await buildVirtualQuotesFromProjects(projects, linkedProjectIds);

  return sortQuotesByUpdatedAt([...firestoreQuotes, ...virtualQuotes]).slice(0, 50);
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
