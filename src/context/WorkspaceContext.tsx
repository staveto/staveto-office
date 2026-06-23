"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import type { ActiveWorkspace } from "@/types/workspace";
import type { Workspace, WorkspaceMember } from "@/lib/workspace-types";
import { toLegacyWorkspace, fromLegacyWorkspace } from "@/lib/workspace-types";
import { useAuth } from "@/context/AuthContext";
import {
  loadAvailableWorkspaces,
  persistActiveWorkspaceId,
  readPersistedWorkspaceId,
  resolveActiveWorkspaceWithReason,
  markExplicitPersonalWorkspace,
  clearExplicitPersonalWorkspace,
  logWorkspaceResolveDebug,
  refreshCompanyWorkspaceRole,
  refreshCompanyWorkspaceRoles,
} from "@/services/workspace/workspaceService";
import { upsertUserProfile } from "@/lib/userProfile";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { toLegacyMemberRole } from "@/permissions/roles";
import type { WorkspaceRole } from "@/types/workspace";
import {
  getTenantFromWindow,
  resolveTenantWorkspace,
  type TenantFromHostname,
  type TenantResolveStatus,
} from "@/services/tenant/tenantResolver";

export type WorkspaceTenantState = {
  mode: TenantFromHostname["mode"];
  slug?: string;
  status: TenantResolveStatus;
  organizationName?: string;
};

type WorkspaceContextValue = {
  activeWorkspace: ActiveWorkspace | null;
  availableWorkspaces: ActiveWorkspace[];
  workspaces: Workspace[];
  legacyActiveWorkspace: Workspace | null;
  memberRole: WorkspaceMember["role"] | null;
  workspaceRole: WorkspaceRole | null;
  /** Company member role still loading from Firestore. */
  roleResolving: boolean;
  tenant: WorkspaceTenantState | null;
  setActiveWorkspace: (ws: Workspace | ActiveWorkspace | null) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function isActiveWorkspace(ws: Workspace | ActiveWorkspace): ws is ActiveWorkspace {
  return ws.type === "personal" || ws.type === "company";
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [availableWorkspaces, setAvailableWorkspaces] = useState<ActiveWorkspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<ActiveWorkspace | null>(null);
  const [roleResolving, setRoleResolving] = useState(false);
  const [tenant, setTenant] = useState<WorkspaceTenantState | null>(null);
  const [hostTenant] = useState<TenantFromHostname>(() =>
    typeof window !== "undefined"
      ? getTenantFromWindow()
      : { mode: "app", hostname: "localhost" }
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!user?.id) {
        if (cancelled) return;
        setAvailableWorkspaces([]);
        setActiveWorkspaceState(null);
        if (hostTenant.mode === "tenant" && hostTenant.slug) {
          setTenant({ mode: "tenant", slug: hostTenant.slug, status: "app" });
        } else {
          setTenant({ mode: "app", status: "app" });
        }
        return;
      }

      try {
        const profileOrgHint = profile?.activeBusinessOrgId?.trim();
        const onboardingOrgHint =
          profile?.onboarding?.activeWorkspaceId &&
          profile.onboarding.activeWorkspaceId !== "personal"
            ? profile.onboarding.activeWorkspaceId.trim()
            : undefined;
        const persistedOrgHint = (() => {
          const persisted = readPersistedWorkspaceId();
          return persisted && persisted !== "personal" ? persisted.trim() : undefined;
        })();

        const list = await loadAvailableWorkspaces({
          id: user.id,
          email: user.email,
          name: user.name,
          orgIdHints: [profileOrgHint, onboardingOrgHint, persistedOrgHint].filter(
            (id): id is string => !!id
          ),
        });

        if (cancelled) return;

        setRoleResolving(list.some((w) => w.type === "company"));
        const refreshedList = await refreshCompanyWorkspaceRoles(
          list,
          user.id,
          user.email
        );

        if (cancelled) return;

        setAvailableWorkspaces(refreshedList);

        const companyWorkspace = refreshedList.find((w) => isCompanyWorkspaceType(w.type));
        if (companyWorkspace?.orgId && !profile?.activeBusinessOrgId?.trim()) {
          void upsertUserProfile(user.id, {
            activeBusinessOrgId: companyWorkspace.orgId,
          }).catch(() => undefined);
        }

        if (hostTenant.mode === "tenant" && hostTenant.slug) {
          const resolution = await resolveTenantWorkspace(hostTenant.hostname, user.id);

          if (cancelled) return;

          if (resolution.status === "not_found") {
            setTenant({
              mode: "tenant",
              slug: hostTenant.slug,
              status: "not_found",
            });
            setActiveWorkspaceState(null);
            return;
          }

          if (resolution.status === "access_denied") {
            setTenant({
              mode: "tenant",
              slug: hostTenant.slug,
              status: "access_denied",
              organizationName: resolution.organization?.name,
            });
            setActiveWorkspaceState(null);
            return;
          }

          if (resolution.status === "resolved" && resolution.workspace) {
            setRoleResolving(true);
            const refreshedTenantWorkspace = await refreshCompanyWorkspaceRole(
              resolution.workspace,
              user.id,
              user.email
            );
            if (cancelled) return;

            setTenant({
              mode: "tenant",
              slug: hostTenant.slug,
              status: "resolved",
              organizationName: resolution.organization?.name,
            });
            setActiveWorkspaceState(refreshedTenantWorkspace);
            persistActiveWorkspaceId(refreshedTenantWorkspace.id);
            return;
          }
        }

        setTenant({ mode: "app", status: "app" });
        const persistedId = readPersistedWorkspaceId();
        const resolveOptions = {
          tenantMode: false as const,
          persistedId,
          profileWorkspaceId: profile?.onboarding?.activeWorkspaceId,
          profileBusinessOrgId: profile?.activeBusinessOrgId,
        };
        const { workspace: resolved, reason } = resolveActiveWorkspaceWithReason(
          refreshedList,
          resolveOptions
        );
        const activeMatch =
          refreshedList.find((w) => w.id === resolved.id) ?? resolved;
        setActiveWorkspaceState(activeMatch);
        persistActiveWorkspaceId(activeMatch.id);
        if (activeMatch.type === "company") {
          clearExplicitPersonalWorkspace();
        }
        logWorkspaceResolveDebug({
          available: refreshedList,
          active: activeMatch,
          reason,
          persistedId,
        });
      } catch {
        if (cancelled) return;
        const personal = listFallbackPersonal(user);
        setAvailableWorkspaces([personal]);
        setActiveWorkspaceState(personal);
        setTenant(
          hostTenant.mode === "tenant" && hostTenant.slug
            ? { mode: "tenant", slug: hostTenant.slug, status: "not_found" }
            : { mode: "app", status: "app" }
        );
      } finally {
        if (!cancelled) {
          setRoleResolving(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.email,
    user?.name,
    profile?.onboarding?.activeWorkspaceId,
    profile?.activeBusinessOrgId,
    hostTenant.mode,
    hostTenant.slug,
    hostTenant.hostname,
  ]);

  const legacyWorkspaces = useMemo(
    () => availableWorkspaces.map(toLegacyWorkspace),
    [availableWorkspaces]
  );

  const legacyActiveWorkspace = useMemo(
    () => (activeWorkspace ? toLegacyWorkspace(activeWorkspace) : null),
    [activeWorkspace]
  );

  const workspaceRole = activeWorkspace?.role ?? null;

  const memberRole: WorkspaceMember["role"] | null = workspaceRole
    ? toLegacyMemberRole(workspaceRole)
    : activeWorkspace?.type === "personal"
      ? "admin"
      : "member";

  const setActiveWorkspace = useCallback(
    (ws: Workspace | ActiveWorkspace | null) => {
      if (tenant?.mode === "tenant" && tenant.status === "resolved") {
        return;
      }
      if (!ws) {
        setActiveWorkspaceState(null);
        return;
      }

      const next = isActiveWorkspace(ws)
        ? ws
        : fromLegacyWorkspace(
            ws,
            user?.id ?? "",
            availableWorkspaces.find(
              (w) =>
                w.id === ws.id ||
                w.legacyId === ws.id ||
                (w.type === "company" && w.orgId === ws.id)
            )?.role ??
              activeWorkspace?.role ??
              "worker"
          );

      setActiveWorkspaceState(next);
      persistActiveWorkspaceId(next.id);
      if (next.type === "personal") {
        markExplicitPersonalWorkspace();
      } else {
        clearExplicitPersonalWorkspace();
        if (user?.id && next.orgId) {
          setRoleResolving(true);
          void refreshCompanyWorkspaceRole(next, user.id, user.email).then((refreshed) => {
            setActiveWorkspaceState(refreshed);
            setAvailableWorkspaces((prev) =>
              prev.map((w) => (w.id === refreshed.id ? refreshed : w))
            );
            setRoleResolving(false);
          });
        }
      }
    },
    [user?.id, user?.email, activeWorkspace?.role, tenant, availableWorkspaces]
  );

  const value: WorkspaceContextValue = {
    activeWorkspace,
    availableWorkspaces,
    workspaces: legacyWorkspaces,
    legacyActiveWorkspace,
    memberRole,
    workspaceRole,
    roleResolving,
    tenant,
    setActiveWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

function listFallbackPersonal(user: {
  id: string;
  email?: string;
  name?: string;
}): ActiveWorkspace {
  return {
    id: "personal",
    type: "personal",
    name: user.name?.trim() || "Personal",
    role: "owner",
    source: "personal",
    ownerId: user.id,
    legacyId: "personal",
  };
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
