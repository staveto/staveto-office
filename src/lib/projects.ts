/**
 * Firestore query layer for Projects, Tasks, Expenses.
 * Same data model as mobile app. Workspace-aware (Personal / Team).
 * Uses indexed queries only; no in-memory fallbacks.
 */
import {
  getFirestoreInstance,
  ensureAuthTokenReady,
  waitForAuthUser,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  addDoc,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "./firebase";
import { legacyPhaseIdFromName } from "@/services/projects/projectPhasesService";
import type { Workspace } from "./workspace-types";
import type { ActiveWorkspace } from "@/types/workspace";
import { getProjectWorkspaceWriteFields } from "@/services/workspace/workspaceService";
import { getProjectOwnershipScope } from "@/lib/projectOwnership";
import { ensureOrgMemberForOwner } from "@/lib/organizations";
import { isProjectAssignedToUser } from "@/lib/projectOwnership";
import { listTeamProjectsViaCallable } from "@/services/projects/teamProjectsListService";
import { ensureProjectOrgLink } from "@/services/projects/businessProjectAssignmentService";
import { fromLegacyWorkspace } from "./workspace-types";
import { dedupeInflight } from "./inflightCache";

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
import { parseQuoteItemSnapshots } from "@/lib/catalog/quoteSnapshots";
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
  /** Engine type: BUILD | TRADE (mobile storage). */
  projectType?: string;
  /** Granular engine work type (NEW_BUILD, REPAIR, SERVICE, …). */
  workType?: string;
  /** UI archetype from new-job wizard (mobile NewJobArchetype). */
  jobArchetype?: string;
  jobWorkflowKind?: string;
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
  customerCompanyName?: string;
  customerContactPersonName?: string;
  customerEmail?: string;
  customerPhone?: string;
  internalNote?: string;
  source?: JobSource;
  convertedAt?: string;
  acceptedQuoteId?: string;
  /** Draft quote prep — optional, ignored by mobile until supported */
  quoteDraftVatPercent?: number;
  quoteDraftNotes?: string;
  /** Set when project was created via AI wizard. */
  createdByAI?: boolean;
  /** AI draft file ids from wizard (workspaces/.../aiDraftFiles). */
  attachedFileIds?: string[];
  /** Storage paths of wizard attachments for backfill into project documents. */
  aiWizardAttachmentPaths?: string[];
  /** Office AI draft id (workspaces/.../projectDrafts) for attachment recovery. */
  aiDraftId?: string;
  /** Estimator session used when creating this project (materials repair). */
  aiEstimatorSessionId?: string;
  /**
   * Visual takeoff / Plan Takeoff Workbench status for proposal review.
   * Computed from drawingOccurrences when absent, except for explicit skipped_manual.
   */
  visualTakeoffStatus?:
    | "not_started"
    | "in_progress"
    | "needs_review"
    | "verified"
    | "skipped_manual";
  /** Mobile: crew assigned to job (read-only on web). */
  assignedMemberIds?: string[];
  /** Mobile project cover — Storage URL (projects/{id}/cover/…). */
  coverImageUrl?: string;
  coverImagePath?: string;
  coverImageUpdatedAt?: number;
};

export type TaskAssignedTool = {
  id: string;
  name: string;
  type?: string | null;
  qrCode?: string | null;
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
  assignedToolIds?: string[];
  assignedTools?: TaskAssignedTool[];
  dueDate?: string;
  plannedStart?: string;
  plannedEnd?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
};

export type {
  ExpenseDoc,
  ExpenseCategory,
  ExpenseSource,
  ExpenseStatus,
  TravelExpenseData,
  CreateExpenseInput,
  UpdateExpenseInput,
} from "./expenses";

export {
  listProjectExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  toExpenseDoc,
} from "./expenses";

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
    workType: data.workType as string | undefined,
    jobArchetype: data.jobArchetype as string | undefined,
    jobWorkflowKind: data.jobWorkflowKind as string | undefined,
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
    customerCompanyName: (data.customerCompanyName as string) || undefined,
    customerContactPersonName: (data.customerContactPersonName as string) || undefined,
    customerEmail: (data.customerEmail as string) || undefined,
    internalNote: (data.internalNote as string) || undefined,
    customerPhone: (data.customerPhone as string) || undefined,
    source: data.source as JobSource | undefined,
    convertedAt: toStr(data.convertedAt),
    acceptedQuoteId: (data.acceptedQuoteId as string) || undefined,
    quoteDraftVatPercent:
      typeof data.quoteDraftVatPercent === "number" ? data.quoteDraftVatPercent : undefined,
    quoteDraftNotes: (data.quoteDraftNotes as string) || undefined,
    createdByAI: data.createdByAI === true || data.creationMethod === "ai",
    attachedFileIds: Array.isArray(data.attachedFileIds)
      ? (data.attachedFileIds as string[]).filter((id) => typeof id === "string" && id.length > 0)
      : undefined,
    aiWizardAttachmentPaths: Array.isArray(data.aiWizardAttachmentPaths)
      ? (data.aiWizardAttachmentPaths as string[]).filter((p) => typeof p === "string" && p.length > 0)
      : undefined,
    aiDraftId: typeof data.aiDraftId === "string" && data.aiDraftId.length > 0
      ? data.aiDraftId
      : undefined,
    aiEstimatorSessionId:
      typeof data.aiEstimatorSessionId === "string" && data.aiEstimatorSessionId.length > 0
        ? data.aiEstimatorSessionId
        : undefined,
    visualTakeoffStatus:
      data.visualTakeoffStatus === "not_started" ||
      data.visualTakeoffStatus === "in_progress" ||
      data.visualTakeoffStatus === "needs_review" ||
      data.visualTakeoffStatus === "verified" ||
      data.visualTakeoffStatus === "skipped_manual"
        ? data.visualTakeoffStatus
        : undefined,
    assignedMemberIds: [
      ...(Array.isArray(data.assignedMemberIds)
        ? (data.assignedMemberIds as string[]).filter((id) => typeof id === "string" && id.length > 0)
        : []),
      ...(Array.isArray(data.assignedUserIds)
        ? (data.assignedUserIds as string[]).filter((id) => typeof id === "string" && id.length > 0)
        : []),
    ].filter((id, index, arr) => arr.indexOf(id) === index),
    coverImageUrl: (data.coverImageUrl as string) || undefined,
    coverImagePath: (data.coverImagePath as string) || undefined,
    coverImageUpdatedAt:
      typeof data.coverImageUpdatedAt === "number" ? data.coverImageUpdatedAt : undefined,
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
  const customerVisible =
    typeof data.customerVisible === "boolean" ? data.customerVisible : undefined;
  const name =
    (typeof data.name === "string" && data.name.trim()
      ? data.name
      : typeof data.title === "string"
        ? data.title
        : "") || "";
  const qty =
    typeof data.qty === "number" && Number.isFinite(data.qty)
      ? data.qty
      : typeof data.quantity === "number" && Number.isFinite(data.quantity)
        ? data.quantity
        : 1;
  const sourceOfQuantity =
    data.sourceOfQuantity === "symbol_detection" ||
    data.sourceOfQuantity === "measured_line" ||
    data.sourceOfQuantity === "measured_area" ||
    data.sourceOfQuantity === "legend_only" ||
    data.sourceOfQuantity === "manual" ||
    data.sourceOfQuantity === "estimate_rule" ||
    data.sourceOfQuantity === "route_calculation" ||
    data.sourceOfQuantity === "imported_dwg"
      ? data.sourceOfQuantity
      : undefined;
  const takeoffStatus =
    data.takeoffStatus === "draft" ||
    data.takeoffStatus === "needs_review" ||
    data.takeoffStatus === "confirmed" ||
    data.takeoffStatus === "legend_only" ||
    data.takeoffStatus === "customer_question" ||
    data.takeoffStatus === "excluded"
      ? data.takeoffStatus
      : undefined;
  return {
    id,
    projectId,
    category,
    name,
    qty,
    unit: (data.unit as string) || "ks",
    unitPrice: typeof data.unitPrice === "number" ? data.unitPrice : 0,
    note:
      (typeof data.note === "string" && data.note) ||
      (typeof data.description === "string" && data.description) ||
      undefined,
    customerVisible,
    sourceOfQuantity,
    evidenceCount:
      typeof data.evidenceCount === "number" && data.evidenceCount >= 0
        ? data.evidenceCount
        : undefined,
    sourceDrawingId:
      typeof data.sourceDrawingId === "string" && data.sourceDrawingId
        ? data.sourceDrawingId
        : undefined,
    takeoffStatus,
    ...parseQuoteItemSnapshots(data),
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
  const legacyPhaseName =
    (typeof data.phaseTitle === "string" && data.phaseTitle.trim()) ||
    (typeof data.phase === "string" && data.phase.trim()) ||
    "";
  const phaseIdRaw = data.phaseId as string | null | undefined;
  const phaseId =
    phaseIdRaw?.trim() ||
    (legacyPhaseName ? legacyPhaseIdFromName(legacyPhaseName) : undefined);
  return {
    id,
    projectId,
    title: (data.title as string) ?? "",
    status: (data.status as string) ?? "OPEN",
    phaseId,
    order: typeof data.order === "number" ? data.order : undefined,
    required: data.required as boolean | undefined,
    assigneeId: (data.assigneeId as string | null) ?? undefined,
    assigneeName: (data.assigneeName as string | null) ?? undefined,
    assignedToolIds: Array.isArray(data.assignedToolIds)
      ? (data.assignedToolIds as string[]).filter((id) => typeof id === "string")
      : undefined,
    assignedTools: Array.isArray(data.assignedTools)
      ? (data.assignedTools as TaskAssignedTool[])
      : undefined,
    dueDate: (data.dueDate as string) || undefined,
    plannedStart: toStr(data.plannedStart) || toStr(data.dueDate),
    plannedEnd: toStr(data.plannedEnd),
    createdAt: toStr(data.createdAt),
    updatedAt: toStr(data.updatedAt),
    isActive: data.isActive !== undefined ? (data.isActive as boolean) : undefined,
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

function sortProjectsByUpdatedAt(projects: ProjectDoc[]): ProjectDoc[] {
  return [...projects].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
}

function projectMatchesTeamOrg(project: ProjectDoc, orgId: string): boolean {
  const linkedOrgId = project.orgId?.trim() || project.workspaceId?.trim() || "";
  if (!linkedOrgId || linkedOrgId !== orgId) return false;
  return getProjectOwnershipScope(project) === "company";
}

function projectMatchesPersonalScope(project: ProjectDoc, uid: string): boolean {
  return getProjectOwnershipScope(project) === "personal" && project.ownerId === uid;
}

async function getQuerySnapshotSmart(q: ReturnType<typeof query>) {
  try {
    const snap = await getDocs(q);
    const fromCache = (snap as { metadata?: { fromCache?: boolean } }).metadata?.fromCache;
    if (snap.size === 0 && fromCache) {
      try {
        return await getDocsFromServer(q);
      } catch (serverErr) {
        if (isFirebasePermissionDenied(serverErr)) throw serverErr;
        return snap;
      }
    }
    return snap;
  } catch (e) {
    if (isFirebasePermissionDenied(e)) throw e;
    try {
      return await getDocsFromServer(q);
    } catch {
      throw e;
    }
  }
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
  const snap = await getQuerySnapshotSmart(q);
  return snap.docs
    .map((d) => toProjectDoc(d.id, d.data() as Record<string, unknown>));
}

async function runWorkspaceIdProjectsQuery(
  projectsRef: ReturnType<typeof collection>,
  orgId: string,
  options?: { withOrderBy?: boolean }
): Promise<ProjectDoc[]> {
  const withOrderBy = options?.withOrderBy !== false;
  const q = withOrderBy
    ? query(
        projectsRef,
        where("workspaceId", "==", orgId),
        orderBy("updatedAt", "desc"),
        limit(50)
      )
    : query(projectsRef, where("workspaceId", "==", orgId), limit(50));
  const snap = await getQuerySnapshotSmart(q);
  return snap.docs.map((d) => toProjectDoc(d.id, d.data() as Record<string, unknown>));
}

function scheduleOwnedProjectOrgLinks(
  projects: Iterable<ProjectDoc>,
  orgId: string,
  uid: string
): void {
  for (const project of projects) {
    if (project.ownerId !== uid) continue;
    const linked = project.orgId?.trim() || project.workspaceId?.trim() || "";
    if (linked) continue;
    void ensureProjectOrgLink({ projectId: project.id, orgId, actorUid: uid }).catch(() => {
      /* best-effort repair for legacy rows */
    });
  }
}

async function runAssignedProjectsQuery(
  projectsRef: ReturnType<typeof collection>,
  uid: string
): Promise<ProjectDoc[]> {
  const q = query(
    projectsRef,
    where("assignedMemberIds", "array-contains", uid),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toProjectDoc(d.id, d.data() as Record<string, unknown>));
}

function projectIdFromMembersDocPath(path: string): string | null {
  const parts = path.split("/");
  const projectsIdx = parts.indexOf("projects");
  if (projectsIdx < 0 || projectsIdx + 1 >= parts.length) return null;
  return parts[projectsIdx + 1] ?? null;
}

async function loadProjectsByIds(projectIds: string[]): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db || projectIds.length === 0) return [];

  const unique = [...new Set(projectIds.filter(Boolean))].slice(0, 50);
  const rows = await Promise.all(
    unique.map(async (projectId) => {
      try {
        const snap = await getDoc(doc(db, "projects", projectId));
        if (!snap.exists()) return null;
        return toProjectDoc(snap.id, snap.data() as Record<string, unknown>);
      } catch {
        return null;
      }
    })
  );
  return rows.filter((row): row is ProjectDoc => row != null);
}

/**
 * Projects visible to a worker/viewer: assignedMemberIds, active members subcollection,
 * and projectRefs (mobile-aligned fallbacks).
 */
export async function listProjectsAssignedToUser(
  uid: string,
  options?: { orgId?: string | null }
): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db || !uid.trim()) return [];

  await waitForAuthUser();
  await ensureAuthTokenReady();

  const orgId = options?.orgId?.trim() || null;
  const byId = new Map<string, ProjectDoc>();
  const memberAccessIds = new Set<string>();

  const includeProject = (project: ProjectDoc | null): void => {
    if (!project || project.archivedAt) return;
    if (orgId && project.orgId?.trim() && project.orgId !== orgId) return;
    if (
      project.ownerId === uid ||
      isProjectAssignedToUser(project, uid) ||
      memberAccessIds.has(project.id)
    ) {
      byId.set(project.id, project);
    }
  };

  try {
    const memberSnap = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", uid), limit(100))
    );
    const projectIds: string[] = [];
    for (const memberDoc of memberSnap.docs) {
      const projectId = projectIdFromMembersDocPath(memberDoc.ref.path);
      if (!projectId) continue;
      const data = memberDoc.data() as Record<string, unknown>;
      const status = (data.status as string) || "active";
      if (status === "removed" || status === "invited") continue;
      memberAccessIds.add(projectId);
      projectIds.push(projectId);
    }
    const fromMembers = await loadProjectsByIds([...new Set(projectIds)]);
    fromMembers.forEach(includeProject);
  } catch {
    /* rules / index */
  }

  try {
    const assigned = await runAssignedProjectsQuery(collection(db, "projects"), uid);
    assigned.forEach(includeProject);
  } catch {
    /* rules / index */
  }

  try {
    const fromRefs = await listProjectsViaProjectRefs(uid);
    fromRefs.forEach(includeProject);
  } catch {
    /* rules */
  }

  return [...byId.values()].sort((a, b) => {
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
}

/** Mobile parity: users/{uid}/projectRefs + per-doc reads (works when orgId list queries fail). */
async function listProjectsViaProjectRefs(uid: string): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const refsQuery = collection(db, "users", uid, "projectRefs");
  const refsSnap = await getQuerySnapshotSmart(query(refsQuery));
  const ids = refsSnap.docs.map((refDoc) => {
    const raw = refDoc.data() as Record<string, unknown>;
    const fromField =
      typeof raw.projectId === "string" && raw.projectId.trim()
        ? raw.projectId.trim()
        : "";
    return fromField || refDoc.id;
  });
  return loadProjectsByIds(ids);
}

/** Project membership via collectionGroup — paths filtered to projects members only. */
async function listProjectIdsViaMembersCollectionGroup(uid: string): Promise<string[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const snap = await getDocs(
    query(collectionGroup(db, "members"), where("userId", "==", uid), limit(100))
  );
  const ids = new Set<string>();
  for (const memberDoc of snap.docs) {
    const projectId = projectIdFromMembersDocPath(memberDoc.ref.path);
    if (projectId) ids.add(projectId);
  }
  return [...ids];
}

async function listTeamProjectsWithFallback(
  projectsRef: ReturnType<typeof collection>,
  orgId: string,
  uid: string,
  indexHint: string
): Promise<ProjectDoc[]> {
  await ensureOrgMemberForOwner(orgId, uid);

  const merged = new Map<string, ProjectDoc>();

  const mergeRows = (rows: ProjectDoc[]) => {
    for (const project of rows) {
      if (!projectMatchesTeamOrg(project, orgId)) continue;
      merged.set(project.id, project);
    }
  };

  const collectCore = async (loader: () => Promise<ProjectDoc[]>) => {
    try {
      mergeRows(await loader());
    } catch (e) {
      if (!isFirebasePermissionDenied(e)) {
        wrapIndexError(e, indexHint);
      }
    }
  };

  const collectOptional = async (loader: () => Promise<ProjectDoc[]>) => {
    try {
      mergeRows(await loader());
    } catch (e) {
      if (!isFirebasePermissionDenied(e)) {
        wrapIndexError(e, indexHint);
      }
    }
  };

  const teamScope = { mode: "team" as const, orgId };

  let callableError: string | undefined;

  await Promise.all([
    (async () => {
      const callableResult = await listTeamProjectsViaCallable(orgId);
      if (callableResult.errorMessage) {
        callableError = callableResult.errorMessage;
      }
      if (callableResult.projects?.length) mergeRows(callableResult.projects);
    })(),
    collectOptional(() => listProjectsViaProjectRefs(uid)),
    collectOptional(async () => {
      const ids = await listProjectIdsViaMembersCollectionGroup(uid);
      return loadProjectsByIds(ids);
    }),
    collectOptional(() => runAssignedProjectsQuery(projectsRef, uid)),
  ]);

  await collectCore(() => runProjectsQuery(projectsRef, teamScope, { withOrderBy: true }));
  await collectCore(() => runProjectsQuery(projectsRef, teamScope, { withOrderBy: false }));
  await collectOptional(() => runWorkspaceIdProjectsQuery(projectsRef, orgId, { withOrderBy: false }));

  const result = sortProjectsByUpdatedAt([...merged.values()]).slice(0, 50);
  scheduleOwnedProjectOrgLinks(result, orgId, uid);
  if (result.length === 0 && callableError && process.env.NODE_ENV === "development") {
    console.warn("[projects] team list empty; callable error:", callableError);
  }
  return result;
}

/**
 * List projects for the active workspace.
 * Uses indexed query: ownerId/orgId + orderBy(updatedAt desc) + limit(50).
 */
export function listProjectsForWorkspace(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<ProjectDoc[]> {
  const wsKey =
    "orgId" in workspace && workspace.orgId
      ? `org:${workspace.orgId}`
      : `${workspace.type}:${workspace.id}`;
  // Merge concurrent identical project-list reads (dashboard fires several).
  return dedupeInflight(`projects:${uid}:${wsKey}`, () =>
    listProjectsForWorkspaceUncached(workspace, uid)
  );
}

async function listProjectsForWorkspaceUncached(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<ProjectDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  await waitForAuthUser();
  await ensureAuthTokenReady();

  const scope = resolveListScope(workspace, uid);
  const projectsRef = collection(db, "projects");

  const indexHint =
    scope.mode === "personal"
      ? "projects: ownerId (Asc), updatedAt (Desc)"
      : "projects: orgId (Asc), updatedAt (Desc)";

  if (scope.mode === "team") {
    let rows = await listTeamProjectsWithFallback(projectsRef, scope.orgId, uid, indexHint);
    if (rows.length === 0) {
      await ensureAuthTokenReady(true);
      rows = await listTeamProjectsWithFallback(projectsRef, scope.orgId, uid, indexHint);
    }
    return rows;
  }

  try {
    const rows = await runProjectsQuery(
      projectsRef,
      { mode: "personal", uid },
      { withOrderBy: true }
    );
    return rows.filter((project) => projectMatchesPersonalScope(project, uid));
  } catch (e) {
    if (isFirebasePermissionDenied(e)) {
      try {
        const fallbackRows = await runProjectsQuery(
          projectsRef,
          { mode: "personal", uid },
          { withOrderBy: false }
        );
        return fallbackRows.filter((project) => projectMatchesPersonalScope(project, uid));
      } catch (fallbackErr) {
        if (isFirebasePermissionDenied(fallbackErr)) {
          throw new Error(
            "Missing or insufficient permissions. Deploy Firestore rules from mobile/firestore.rules (see docs/FIRESTORE_RULES_NOTES.md)."
          );
        }
        wrapIndexError(fallbackErr, indexHint);
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
  title: string,
  options?: {
    phaseId?: string;
    assigneeId?: string;
    assigneeName?: string;
    plannedDate?: string;
  }
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const trimmed = title?.trim();
  if (!trimmed) throw new Error("Task title is required");

  const planned = options?.plannedDate?.trim().slice(0, 10);
  const hasPlan = planned && /^\d{4}-\d{2}-\d{2}$/.test(planned);

  const ref = await addDoc(collection(db, "projects", projectId, "tasks"), {
    title: trimmed,
    status: "OPEN",
    ...(options?.phaseId ? { phaseId: options.phaseId } : {}),
    ...(options?.assigneeId ? { assigneeId: options.assigneeId } : {}),
    ...(options?.assigneeName ? { assigneeName: options.assigneeName } : {}),
    ...(hasPlan ? { dueDate: planned, plannedStart: planned } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    order: 0,
  });
  return ref.id;
}

async function updateProjectUpdatedAt(projectId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;
  const ref = doc(db, "projects", projectId);
  await updateDoc(ref, { updatedAt: serverTimestamp() });
}

/** Update task due date (YYYY-MM-DD). Mobile-compatible field. */
export async function updateTaskDueDate(
  projectId: string,
  taskId: string,
  dueDate: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const trimmed = dueDate?.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Invalid due date");
  }

  const ref = doc(db, "projects", projectId, "tasks", taskId);
  await updateDoc(ref, {
    dueDate: trimmed,
    updatedAt: serverTimestamp(),
  });
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
    customerVisible: input.customerVisible === false ? false : true,
    ...(input.sourceOfQuantity ? { sourceOfQuantity: input.sourceOfQuantity } : {}),
    ...(typeof input.evidenceCount === "number" ? { evidenceCount: input.evidenceCount } : {}),
    ...(input.sourceDrawingId ? { sourceDrawingId: input.sourceDrawingId } : {}),
    ...(input.takeoffStatus ? { takeoffStatus: input.takeoffStatus } : {}),
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
  if (data.customerVisible !== undefined) update.customerVisible = data.customerVisible;
  if (typeof data.evidenceCount === "number") {
    update.evidenceCount = data.evidenceCount >= 0 ? data.evidenceCount : 0;
  }
  if (data.sourceOfQuantity !== undefined) {
    update.sourceOfQuantity = data.sourceOfQuantity;
  }
  if (data.sourceDrawingId !== undefined) {
    update.sourceDrawingId = data.sourceDrawingId || null;
  }
  if (data.takeoffStatus !== undefined) {
    update.takeoffStatus = data.takeoffStatus || null;
  }

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
