/**
 * Workspace bridge service — organizations + personal, no `workspaces/` migration.
 */
import {
  getUserOrgMemberships,
  getOrganization,
  getUserRoleInOrganization,
  isDefaultCompanyRole,
} from "@/lib/organizations";
import type { ProjectDoc } from "@/lib/projects";
import type { ActiveWorkspace, WorkspaceMember, WorkspaceUser } from "@/types/workspace";
import type { WorkspaceRole } from "@/types/workspace";
import {
  mapLegacyOrgRoleToWorkspaceRole,
  personalWorkspaceRole,
} from "@/permissions/roles";

const PERSONAL_WORKSPACE_ID = "personal";
const DEFAULT_PERSONAL_NAME = "Personal";

/** Default company workspace: mobile owner / admin / manager only. */
const DEFAULT_COMPANY_ROLE_PRIORITY: WorkspaceRole[] = ["owner", "admin", "manager"];

export function getPersonalWorkspace(user: WorkspaceUser): ActiveWorkspace {
  const displayName =
    user.name?.trim() ||
    (user.email ? user.email.split("@")[0] : null) ||
    DEFAULT_PERSONAL_NAME;

  return {
    id: PERSONAL_WORKSPACE_ID,
    type: "personal",
    name: displayName === DEFAULT_PERSONAL_NAME ? DEFAULT_PERSONAL_NAME : displayName,
    role: personalWorkspaceRole(),
    source: "personal",
    ownerId: user.id,
    legacyId: PERSONAL_WORKSPACE_ID,
    mobileWorkspaceKind: "personal",
  };
}

export function normalizeOrganizationToWorkspace(
  orgId: string,
  orgName: string,
  memberRole: string,
  options?: { ownerUid?: string; memberUid?: string }
): ActiveWorkspace {
  const isOrgOwner =
    !!options?.ownerUid &&
    !!options?.memberUid &&
    options.ownerUid === options.memberUid;

  return {
    id: orgId,
    type: "company",
    name: orgName,
    role: mapLegacyOrgRoleToWorkspaceRole(memberRole, { isOrgOwner }),
    source: "organization",
    orgId,
    ownerId: options?.ownerUid,
    legacyId: orgId,
    mobileWorkspaceKind: "business",
  };
}

async function enrichCompanyWorkspaceRole(
  workspace: ActiveWorkspace,
  memberUid: string,
  email?: string
): Promise<ActiveWorkspace> {
  return refreshCompanyWorkspaceRole(workspace, memberUid, email);
}

/** Re-read member role from Firestore (authoritative for UI gating). */
export async function refreshCompanyWorkspaceRole(
  workspace: ActiveWorkspace,
  memberUid: string,
  email?: string
): Promise<ActiveWorkspace> {
  if (workspace.type !== "company" || !workspace.orgId) return workspace;

  const freshRole = await getUserRoleInOrganization(workspace.orgId, memberUid, email);
  if (!freshRole) return workspace;

  const org = await getOrganization(workspace.orgId);
  const role = mapLegacyOrgRoleToWorkspaceRole(freshRole, {
    isOrgOwner: org?.ownerUid === memberUid,
  });
  if (role === workspace.role) return workspace;
  return { ...workspace, role };
}

export async function refreshCompanyWorkspaceRoles(
  workspaces: ActiveWorkspace[],
  memberUid: string,
  email?: string
): Promise<ActiveWorkspace[]> {
  return Promise.all(
    workspaces.map((w) => refreshCompanyWorkspaceRole(w, memberUid, email))
  );
}

export async function getOrganizationWorkspaces(
  userId: string,
  orgIdHints?: string[],
  email?: string
): Promise<ActiveWorkspace[]> {
  const memberships = await getUserOrgMemberships(userId, { orgIdHints, email });
  const workspaces: ActiveWorkspace[] = [];

  for (const m of memberships) {
    const org = await getOrganization(m.orgId);
    const workspace = normalizeOrganizationToWorkspace(m.orgId, m.orgName, m.role, {
      ownerUid: org?.ownerUid,
      memberUid: userId,
    });
    workspaces.push(await enrichCompanyWorkspaceRole(workspace, userId, email));
  }

  return workspaces;
}

export async function loadAvailableWorkspaces(user: WorkspaceUser): Promise<ActiveWorkspace[]> {
  const personal = getPersonalWorkspace(user);
  let organizations: ActiveWorkspace[] = [];

  try {
    organizations = await getOrganizationWorkspaces(user.id, user.orgIdHints, user.email);
  } catch {
    organizations = [];
  }

  return [personal, ...organizations];
}

export type ResolveWorkspaceOptions = {
  /** When on a company subdomain, force this organization workspace. */
  tenantOrgId?: string | null;
  tenantMode?: boolean;
  /** sessionStorage workspace id */
  persistedId?: string | null;
  /** Profile onboarding hint (lower priority than explicit session personal). */
  profileWorkspaceId?: string | null;
  /** Mobile-style hint on users/{uid} if present */
  profileBusinessOrgId?: string | null;
};

export type WorkspaceResolveReason =
  | "tenant"
  | "persisted-valid"
  | "preferred-business"
  | "explicit-personal"
  | "profile-org"
  | "profile-business-org"
  | "fallback-personal";

export type ResolvedWorkspace = {
  workspace: ActiveWorkspace;
  reason: WorkspaceResolveReason;
};

function findWorkspaceById(
  available: ActiveWorkspace[],
  id: string | null | undefined
): ActiveWorkspace | undefined {
  if (!id) return undefined;
  return available.find(
    (w) =>
      w.id === id ||
      w.legacyId === id ||
      (w.type === "company" && w.orgId === id)
  );
}

export function pickDefaultCompanyWorkspace(
  available: ActiveWorkspace[]
): ActiveWorkspace | null {
  const companies = available.filter((w) => w.type === "company");
  if (companies.length === 0) return null;

  for (const role of DEFAULT_COMPANY_ROLE_PRIORITY) {
    const match = companies.find((w) => w.role === role);
    if (match) return match;
  }

  const managerial = companies.filter((w) => isDefaultCompanyRole(w.role));
  return managerial[0] ?? null;
}

export function hasCompanyWorkspaces(available: ActiveWorkspace[]): boolean {
  return available.some((w) => w.type === "company");
}

export function resolveActiveWorkspace(
  available: ActiveWorkspace[],
  preferredWorkspaceId?: string | null,
  options?: ResolveWorkspaceOptions
): ActiveWorkspace {
  return resolveActiveWorkspaceWithReason(available, {
    ...options,
    persistedId: preferredWorkspaceId ?? options?.persistedId,
  }).workspace;
}

export function resolveActiveWorkspaceWithReason(
  available: ActiveWorkspace[],
  options?: ResolveWorkspaceOptions
): ResolvedWorkspace {
  const personal =
    available.find((w) => w.type === "personal") ?? available[0] ?? getPersonalWorkspace({ id: "unknown" });

  if (options?.tenantMode && options.tenantOrgId) {
    const tenantMatch = findWorkspaceById(available, options.tenantOrgId);
    if (tenantMatch) return { workspace: tenantMatch, reason: "tenant" };
  }

  const defaultCompany = pickDefaultCompanyWorkspace(available);
  const persisted = findWorkspaceById(available, options?.persistedId);
  const explicitPersonal = hasExplicitPersonalWorkspace();

  if (persisted) {
    if (persisted.type === "personal") {
      if (explicitPersonal) {
        return { workspace: persisted, reason: "explicit-personal" };
      }
      if (defaultCompany) {
        return { workspace: defaultCompany, reason: "preferred-business" };
      }
      return { workspace: persisted, reason: "persisted-valid" };
    }
    return { workspace: persisted, reason: "persisted-valid" };
  }

  const profileOrg = findWorkspaceById(available, options?.profileWorkspaceId);
  if (profileOrg?.type === "company") {
    return { workspace: profileOrg, reason: "profile-org" };
  }

  const businessOrg = findWorkspaceById(available, options?.profileBusinessOrgId);
  if (businessOrg?.type === "company") {
    return { workspace: businessOrg, reason: "profile-business-org" };
  }

  if (defaultCompany) {
    return { workspace: defaultCompany, reason: "preferred-business" };
  }

  if (profileOrg) {
    return { workspace: profileOrg, reason: "profile-org" };
  }

  return { workspace: personal, reason: "fallback-personal" };
}

export function getWorkspaceDisplayName(workspace: ActiveWorkspace): string {
  if (workspace.type === "personal") {
    return workspace.name || DEFAULT_PERSONAL_NAME;
  }
  return workspace.name || "Team";
}

/**
 * Firestore fields for new/updated projects (additive; mobile-compatible).
 * Keeps `ownerId` / `orgId` and legacy `workspaceType` values `personal` | `team`.
 */
export function getProjectWorkspaceWriteFields(
  workspace: ActiveWorkspace,
  uid: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    source: "web",
  };

  if (workspace.type === "personal") {
    return {
      ...base,
      ownerId: uid,
      workspaceType: "personal",
      workspaceId: uid,
    };
  }

  const orgId = workspace.orgId ?? workspace.id;
  return {
    ...base,
    ownerId: uid,
    orgId,
    workspaceType: "team",
    workspaceId: orgId,
  };
}

/** Stamp quotes with the same workspace scope as the linked project document. */
export function getQuoteWorkspaceWriteFieldsFromProject(
  project: Pick<ProjectDoc, "orgId" | "ownerId" | "workspaceType" | "workspaceId">,
  fallbackWorkspace: ActiveWorkspace,
  uid: string
): Record<string, unknown> {
  if (project.orgId) {
    return {
      source: "web",
      orgId: project.orgId,
      workspaceType: project.workspaceType ?? "team",
      workspaceId: project.workspaceId ?? project.orgId,
    };
  }
  if (project.ownerId) {
    return {
      source: "web",
      ownerId: project.ownerId,
      workspaceType: project.workspaceType ?? "personal",
      workspaceId: project.workspaceId ?? project.ownerId,
    };
  }
  return getProjectWorkspaceWriteFields(fallbackWorkspace, uid);
}

/** Match legacy context workspace id for persistence in sessionStorage. */
export const WORKSPACE_STORAGE_KEY = "staveto.activeWorkspaceId";

/** User explicitly chose personal workspace in this browser session. */
export const WORKSPACE_EXPLICIT_PERSONAL_KEY = "staveto.explicitPersonalWorkspace";

export function persistActiveWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  } catch {
    // ignore quota / private mode
  }
}

export function readPersistedWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function markExplicitPersonalWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WORKSPACE_EXPLICIT_PERSONAL_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearExplicitPersonalWorkspace(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(WORKSPACE_EXPLICIT_PERSONAL_KEY);
  } catch {
    // ignore
  }
}

export function hasExplicitPersonalWorkspace(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(WORKSPACE_EXPLICIT_PERSONAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function logWorkspaceResolveDebug(payload: {
  available: ActiveWorkspace[];
  active: ActiveWorkspace;
  reason: WorkspaceResolveReason;
  persistedId: string | null;
}): void {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[staveto workspace]", {
    selectedReason: payload.reason,
    activeWorkspace: {
      id: payload.active.id,
      type: payload.active.type,
      name: payload.active.name,
      role: payload.active.role,
      mobileWorkspaceKind: payload.active.mobileWorkspaceKind,
    },
    persistedId: payload.persistedId,
    availableWorkspaces: payload.available.map((w) => ({
      id: w.id,
      type: w.type,
      name: w.name,
      role: w.role,
      mobileWorkspaceKind: w.mobileWorkspaceKind,
    })),
  });
}

export type { WorkspaceMember };
