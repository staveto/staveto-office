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
} from "@/services/workspace/workspaceService";
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

        const list = await loadAvailableWorkspaces({
          id: user.id,
          email: user.email,
          name: user.name,
          orgIdHints: [profileOrgHint, onboardingOrgHint].filter(
            (id): id is string => !!id
          ),
        });

        if (cancelled) return;

        setAvailableWorkspaces(list);

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
            setTenant({
              mode: "tenant",
              slug: hostTenant.slug,
              status: "resolved",
              organizationName: resolution.organization?.name,
            });
            setActiveWorkspaceState(resolution.workspace);
            persistActiveWorkspaceId(resolution.workspace.id);
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
          list,
          resolveOptions
        );
        setActiveWorkspaceState(resolved);
        persistActiveWorkspaceId(resolved.id);
        if (resolved.type === "company") {
          clearExplicitPersonalWorkspace();
        }
        logWorkspaceResolveDebug({
          available: list,
          active: resolved,
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
        : fromLegacyWorkspace(ws, user?.id ?? "", activeWorkspace?.role ?? "manager");

      setActiveWorkspaceState(next);
      persistActiveWorkspaceId(next.id);
      if (next.type === "personal") {
        markExplicitPersonalWorkspace();
      } else {
        clearExplicitPersonalWorkspace();
      }
    },
    [user?.id, activeWorkspace?.role, tenant]
  );

  const value: WorkspaceContextValue = {
    activeWorkspace,
    availableWorkspaces,
    workspaces: legacyWorkspaces,
    legacyActiveWorkspace,
    memberRole,
    workspaceRole,
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
