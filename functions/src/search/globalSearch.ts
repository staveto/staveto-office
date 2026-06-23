import * as admin from "firebase-admin";
import { z } from "zod";
import { assertWorkspaceAccess, functionsPermissionError, type WorkspaceRole } from "../permissions";
import {
  buildSearchIndexItem,
  matchesSearchQuery,
  type SearchIndexItem,
} from "./buildSearchIndexItem";
import { canViewSearchItem, defaultVisibilityForType } from "./searchPermissions";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const requestSchema = z.object({
  orgId: z.string().min(1),
  workspaceId: z.string().optional(),
  companyId: z.string().optional(),
  query: z.string().max(120),
  limit: z.number().int().min(1).max(40).optional(),
});

export type GlobalSearchResponse = {
  query: string;
  results: SearchIndexItem[];
  /** TODO: AI fallback — when empty, client may offer "Ask Staveto AI". */
  aiFallbackAvailable: boolean;
};

const CONTEXTUAL_ACTIONS: Array<{
  triggers: string[];
  item: Omit<SearchIndexItem, "searchText" | "keywords">;
  searchParts?: string[];
}> = [
  {
    triggers: ["angebot", "angebote", "quote", "offers"],
    item: {
      id: "action-review-quotes",
      type: "action",
      title: "Angebote prüfen",
      subtitle: "Offene Angebote und Entwürfe",
      route: "/app/quotes",
      sourceCollection: "actions",
      sourceId: "review-quotes",
    },
  },
  {
    triggers: ["heute", "today", "plan"],
    item: {
      id: "action-planning-today",
      type: "action",
      title: "Heute planen",
      subtitle: "Einsatzplanung und Teamkapazität",
      route: "/app/planning",
      sourceCollection: "actions",
      sourceId: "planning-today",
    },
  },
  {
    triggers: ["fahrzeug", "fahrzeuge", "vehicle", "sprinter", "transporter"],
    item: {
      id: "action-vehicles",
      type: "action",
      title: "Fahrzeuge anzeigen",
      subtitle: "Verfügbare Fahrzeuge und Fuhrpark",
      route: "/app/equipment",
      sourceCollection: "actions",
      sourceId: "vehicles",
    },
  },
  {
    triggers: ["problem", "meldung", "issue", "störung"],
    item: {
      id: "action-operations",
      type: "action",
      title: "Meldungen & Live-Einsätze",
      subtitle: "Probleme aus dem Feld",
      route: "/app/operations",
      sourceCollection: "actions",
      sourceId: "operations",
    },
  },
  {
    triggers: ["notiz", "notizen", "note", "feld"],
    item: {
      id: "action-field-notes",
      type: "action",
      title: "Notizen aus dem Feld",
      subtitle: "Geteilte Schnellnotizen",
      route: "/app/documents",
      sourceCollection: "actions",
      sourceId: "field-notes",
    },
  },
];

function contextualActions(query: string): SearchIndexItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchIndexItem[] = [];
  for (const row of CONTEXTUAL_ACTIONS) {
    if (row.triggers.some((t) => q.includes(t))) {
      out.push(
        buildSearchIndexItem({
          ...row.item,
          searchParts: row.searchParts ?? row.triggers,
          visibility: { owner: true, manager: true, teamleader: true, employee: true },
        })
      );
    }
  }
  return out;
}

async function searchIndexCollection(
  orgId: string,
  query: string,
  limit: number
): Promise<SearchIndexItem[]> {
  const ref = db.collection(`organizations/${orgId}/searchIndex`);
  const snap = await ref.limit(500).get();
  if (snap.empty) return [];
  const items: SearchIndexItem[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Partial<SearchIndexItem>;
    const item: SearchIndexItem = {
      id: doc.id,
      type: (data.type as SearchIndexItem["type"]) ?? "project",
      title: String(data.title ?? ""),
      subtitle: data.subtitle,
      status: data.status,
      relatedProjectId: data.relatedProjectId,
      relatedProjectName: data.relatedProjectName,
      relatedCustomerId: data.relatedCustomerId,
      relatedCustomerName: data.relatedCustomerName,
      searchText: String(data.searchText ?? data.title ?? "").toLowerCase(),
      keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
      route: String(data.route ?? "/app"),
      sourceCollection: String(data.sourceCollection ?? ""),
      sourceId: String(data.sourceId ?? doc.id),
      visibility: data.visibility,
    };
    if (item.title && matchesSearchQuery(item, query)) items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

async function searchProjects(orgId: string, uid: string, role: WorkspaceRole): Promise<SearchIndexItem[]> {
  const snap = await db.collection("projects").where("orgId", "==", orgId).limit(80).get();
  const items: SearchIndexItem[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const assigned: string[] = Array.isArray(d.assignedMemberIds) ? d.assignedMemberIds : [];
    const isAssigned = assigned.includes(uid);
    if (role === "worker" && !isAssigned) continue;

    const name = String(d.name ?? "Auftrag");
    const customerName = typeof d.customerName === "string" ? d.customerName : undefined;
    items.push(
      buildSearchIndexItem({
        id: `project-${doc.id}`,
        type: "project",
        title: name,
        subtitle: customerName ?? (d.address as string | undefined),
        status: String(d.lifecycleStatus ?? d.status ?? ""),
        relatedCustomerName: customerName,
        route: `/app/projects/${doc.id}`,
        sourceCollection: "projects",
        sourceId: doc.id,
        searchParts: [customerName, d.address as string, d.internalNote as string],
        visibility: defaultVisibilityForType("project"),
        extraKeywords: isAssigned ? [`assignee:${uid}`, "assigned"] : [],
      })
    );
  }
  return items;
}

async function searchQuotes(orgId: string, role: WorkspaceRole): Promise<SearchIndexItem[]> {
  if (role === "worker" || role === "client") return [];
  const snap = await db.collection("quotes").where("orgId", "==", orgId).limit(60).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const projectId = typeof d.projectId === "string" ? d.projectId : undefined;
    return buildSearchIndexItem({
      id: `offer-${doc.id}`,
      type: "offer",
      title: String(d.title ?? d.name ?? "Angebot"),
      subtitle: typeof d.projectName === "string" ? d.projectName : undefined,
      status: String(d.status ?? d.quoteStatus ?? ""),
      relatedProjectId: projectId,
      relatedProjectName: typeof d.projectName === "string" ? d.projectName : undefined,
      route: projectId ? `/app/quotes/${doc.id}` : "/app/quotes",
      sourceCollection: "quotes",
      sourceId: doc.id,
      searchParts: [d.notes as string, d.customerName as string],
      visibility: defaultVisibilityForType("offer"),
    });
  });
}

async function searchCustomers(orgId: string, role: WorkspaceRole): Promise<SearchIndexItem[]> {
  if (role === "worker" || role === "client") return [];
  const snap = await db.collection("customers").where("orgId", "==", orgId).limit(100).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const name = String(d.name ?? d.companyName ?? "Kunde");
    return buildSearchIndexItem({
      id: `customer-${doc.id}`,
      type: "customer",
      title: name,
      subtitle: typeof d.email === "string" ? d.email : (d.phone as string | undefined),
      route: "/app/projects?filter=active",
      sourceCollection: "customers",
      sourceId: doc.id,
      searchParts: [d.companyName as string, d.email as string, d.phone as string],
      visibility: defaultVisibilityForType("customer"),
    });
  });
}

async function searchMembers(orgId: string): Promise<SearchIndexItem[]> {
  const snap = await db.collection(`organizations/${orgId}/members`).limit(80).get();
  const items: SearchIndexItem[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const status = String(d.status ?? "active");
    if (status === "removed" || status === "invited") continue;
    const name = String(d.displayName ?? d.email ?? doc.id.slice(0, 8));
    items.push(
      buildSearchIndexItem({
        id: `member-${doc.id}`,
        type: "member",
        title: name,
        subtitle: typeof d.email === "string" ? d.email : String(d.role ?? ""),
        status: String(d.role ?? ""),
        route: "/app/members",
        sourceCollection: "organizations/members",
        sourceId: doc.id,
        searchParts: [d.email as string],
        visibility: defaultVisibilityForType("member"),
      })
    );
  }
  return items;
}

async function searchEquipment(uid: string): Promise<SearchIndexItem[]> {
  const snap = await db.collection(`users/${uid}/equipment`).limit(80).get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    const category = String(d.category ?? "").toLowerCase();
    const isVehicle = category === "vehicle" || String(d.type ?? "").toLowerCase().includes("vehicle");
    const name = String(d.name ?? d.label ?? "Gerät");
    return buildSearchIndexItem({
      id: `${isVehicle ? "vehicle" : "tool"}-${doc.id}`,
      type: isVehicle ? "vehicle" : "tool",
      title: name,
      subtitle: typeof d.registrationNumber === "string" ? d.registrationNumber : category || undefined,
      status: String(d.status ?? ""),
      route: `/app/equipment/${doc.id}`,
      sourceCollection: "users/equipment",
      sourceId: doc.id,
      searchParts: [d.brand as string, d.model as string, d.registrationNumber as string],
      visibility: defaultVisibilityForType(isVehicle ? "vehicle" : "tool"),
    });
  });
}

async function searchFieldNotes(orgId: string, role: WorkspaceRole): Promise<SearchIndexItem[]> {
  if (role === "client") return [];
  const snap = await db.collection(`organizations/${orgId}/fieldNotes`).limit(80).get();
  const items: SearchIndexItem[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.shareWithManager === false && role === "worker") continue;
    const text = String(d.text ?? "").slice(0, 120);
    if (!text) continue;
    items.push(
      buildSearchIndexItem({
        id: `note-${doc.id}`,
        type: "note",
        title: text.slice(0, 80),
        subtitle: typeof d.createdByName === "string" ? d.createdByName : undefined,
        relatedProjectId: typeof d.projectId === "string" ? d.projectId : undefined,
        relatedProjectName: typeof d.projectName === "string" ? d.projectName : undefined,
        route: "/app",
        sourceCollection: "organizations/fieldNotes",
        sourceId: doc.id,
        searchParts: [d.projectName as string, d.createdByName as string],
        visibility: { owner: true, manager: true, teamleader: true, employee: true },
        extraKeywords: ["shared"],
      })
    );
  }
  return items;
}

async function searchTasksForProjects(
  projectIds: string[],
  projectNames: Map<string, string>,
  uid: string,
  role: WorkspaceRole
): Promise<SearchIndexItem[]> {
  const items: SearchIndexItem[] = [];
  const batch = projectIds.slice(0, 25);
  await Promise.all(
    batch.map(async (projectId) => {
      const snap = await db.collection(`projects/${projectId}/tasks`).limit(40).get();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (String(d.status ?? "").toUpperCase() === "DONE") continue;
        const assigneeId = typeof d.assigneeId === "string" ? d.assigneeId : "";
        if (role === "worker" && assigneeId && assigneeId !== uid) continue;

        const title = String(d.title ?? "Aufgabe");
        items.push(
          buildSearchIndexItem({
            id: `task-${projectId}-${doc.id}`,
            type: "task",
            title,
            subtitle: projectNames.get(projectId),
            status: String(d.status ?? "OPEN"),
            relatedProjectId: projectId,
            relatedProjectName: projectNames.get(projectId),
            route: `/app/projects/${projectId}`,
            sourceCollection: "projects/tasks",
            sourceId: doc.id,
            searchParts: [d.assigneeName as string, d.dueDate as string],
            visibility: defaultVisibilityForType("task"),
            extraKeywords: assigneeId ? [`assignee:${assigneeId}`] : [],
          })
        );
      }
    })
  );
  return items;
}

async function searchIssuesForProjects(
  projectIds: string[],
  projectNames: Map<string, string>,
  role: WorkspaceRole
): Promise<SearchIndexItem[]> {
  if (role === "client") return [];
  const items: SearchIndexItem[] = [];
  const batch = projectIds.slice(0, 20);
  await Promise.all(
    batch.map(async (projectId) => {
      const snap = await db.collection(`projects/${projectId}/problems`).limit(30).get();
      for (const doc of snap.docs) {
        const d = doc.data();
        const status = String(d.status ?? "open");
        if (status === "fixed" || status === "verified") continue;
        items.push(
          buildSearchIndexItem({
            id: `issue-${projectId}-${doc.id}`,
            type: "issue",
            title: String(d.shortDescription ?? d.title ?? "Meldung"),
            subtitle: projectNames.get(projectId),
            status,
            relatedProjectId: projectId,
            relatedProjectName: projectNames.get(projectId),
            route: `/app/projects/${projectId}`,
            sourceCollection: "projects/problems",
            sourceId: doc.id,
            searchParts: [d.detail as string],
            visibility: defaultVisibilityForType("issue"),
          })
        );
      }
    })
  );
  return items;
}

async function searchDocumentsForProjects(
  projectIds: string[],
  projectNames: Map<string, string>,
  role: WorkspaceRole
): Promise<SearchIndexItem[]> {
  if (role === "client") return [];
  const items: SearchIndexItem[] = [];
  const batch = projectIds.slice(0, 15);
  await Promise.all(
    batch.map(async (projectId) => {
      const snap = await db.collection(`projects/${projectId}/documents`).limit(30).get();
      for (const doc of snap.docs) {
        const d = doc.data();
        const fileName = String(d.fileName ?? d.name ?? "Dokument");
        const mime = String(d.mimeType ?? "");
        const isPhoto = mime.toLowerCase().startsWith("image/");
        items.push(
          buildSearchIndexItem({
            id: `${isPhoto ? "photo" : "document"}-${projectId}-${doc.id}`,
            type: isPhoto ? "photo" : "document",
            title: fileName,
            subtitle: projectNames.get(projectId),
            relatedProjectId: projectId,
            relatedProjectName: projectNames.get(projectId),
            route: isPhoto ? "/app/documents/photos" : "/app/documents",
            sourceCollection: "projects/documents",
            sourceId: doc.id,
            searchParts: [mime],
            visibility: defaultVisibilityForType(isPhoto ? "photo" : "document"),
          })
        );
      }
    })
  );
  return items;
}

async function searchFallback(
  orgId: string,
  uid: string,
  role: WorkspaceRole,
  query: string,
  limit: number
): Promise<SearchIndexItem[]> {
  const [projects, quotes, customers, members, equipment, notes] = await Promise.all([
    searchProjects(orgId, uid, role),
    searchQuotes(orgId, role),
    searchCustomers(orgId, role),
    searchMembers(orgId),
    searchEquipment(uid),
    searchFieldNotes(orgId, role),
  ]);

  const projectMap = new Map<string, string>();
  for (const p of projects) {
    if (p.sourceId) projectMap.set(p.sourceId, p.title);
  }
  const projectIds = [...projectMap.keys()];

  const [tasks, issues, documents] = await Promise.all([
    searchTasksForProjects(projectIds, projectMap, uid, role),
    searchIssuesForProjects(projectIds, projectMap, role),
    searchDocumentsForProjects(projectIds, projectMap, role),
  ]);

  const pool = [
    ...contextualActions(query),
    ...projects,
    ...quotes,
    ...customers,
    ...members,
    ...equipment,
    ...notes,
    ...tasks,
    ...issues,
    ...documents,
  ];

  const filtered = pool.filter((item) => matchesSearchQuery(item, query));
  const deduped = new Map<string, SearchIndexItem>();
  for (const item of filtered) {
    deduped.set(`${item.type}:${item.sourceId}`, item);
  }
  return [...deduped.values()].slice(0, limit);
}

export async function handleGlobalSearch(
  authUid: string | undefined,
  data: unknown
): Promise<GlobalSearchResponse> {
  if (!authUid) {
    throw new functionsPermissionError("Authentication required.");
  }

  const input = requestSchema.parse(data);
  const orgId = input.orgId.trim();
  const query = input.query.trim();
  const limit = input.limit ?? 24;

  if (!query) {
    return { query, results: [], aiFallbackAvailable: true };
  }

  const access = await assertWorkspaceAccess(
    db,
    authUid,
    input.workspaceId?.trim() || orgId,
    input.companyId?.trim() || orgId
  );

  if (!access.isPersonal && access.orgId !== orgId) {
    throw new functionsPermissionError("Organization mismatch.");
  }

  const effectiveOrgId = access.isPersonal ? authUid : orgId;

  let results: SearchIndexItem[] = [];
  try {
    results = await searchIndexCollection(effectiveOrgId, query, limit);
  } catch {
    results = [];
  }

  if (results.length === 0) {
    results = await searchFallback(effectiveOrgId, authUid, access.role, query, limit);
  } else {
    const actions = contextualActions(query);
    results = [...actions, ...results].slice(0, limit);
  }

  results = results.filter((item) => canViewSearchItem(access.role, item, authUid));

  return {
    query,
    results,
    aiFallbackAvailable: true,
  };
}
