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
  persistLastActiveWorkspaceId,
  persistLastActiveWorkspaceIdOnly,
} from "@/services/workspace/workspaceService";
import { upsertUserProfile } from "@/lib/userProfile";
import { isCompanyWorkspaceType } from "@/types/workspace";
import { toLegacyMemberRole } from "@/permissions/roles";
import type { WorkspaceRole } from "@/types/workspace";
import { getSoloWorkspaceDisplayName } from "@/lib/workspace/workspaceContract";
import { fetchOrgReviewSnapshots } from "@/lib/workspace/orgReviewSnapshots";
import {
  applyDuplicateSuppression,
  logDuplicateSuppressionDev,
} from "@/lib/workspace/workspaceDuplicateSuppression";
import { logWorkspaceSwitcherCompaniesDev } from "@/lib/workspace/workspaceDuplicateReview";
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
          firstName: profile?.firstName,
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

        const companyOrgIds = refreshedList
          .filter((w) => w.type === "company")
          .map((w) => w.orgId ?? w.id);
        const orgReviewHints = {
          lastActiveWorkspaceId: profile?.lastActiveWorkspaceId,
          activeBusinessOrgId: profile?.activeBusinessOrgId,
        };
        const snapshots = await fetchOrgReviewSnapshots(
          user.id,
          companyOrgIds,
          orgReviewHints
        );
        if (cancelled) return;

        const suppression = applyDuplicateSuppression(
          refreshedList,
          snapshots,
          user.id
        );
        const switcherList = suppression.switcherWorkspaces;
        setAvailableWorkspaces(switcherList);

        const remapOrgId = suppression.remapOrgId;
        const persistedIdRaw = readPersistedWorkspaceId();
        const persistedId =
          remapOrgId(persistedIdRaw ?? undefined) ?? persistedIdRaw;
        if (
          persistedIdRaw &&
          persistedId &&
          persistedId !== persistedIdRaw
        ) {
          persistActiveWorkspaceId(persistedId);
        }

        const profileLastActiveRemapped =
          remapOrgId(profile?.lastActiveWorkspaceId) ??
          profile?.lastActiveWorkspaceId;
        const profileBusinessOrgRemapped =
          remapOrgId(profile?.activeBusinessOrgId) ?? profile?.activeBusinessOrgId;
        const profileOnboardingRemapped =
          remapOrgId(profile?.onboarding?.activeWorkspaceId) ??
          profile?.onboarding?.activeWorkspaceId;
        const hiddenDuplicateWasReferenced = [
          profile?.lastActiveWorkspaceId,
          persistedIdRaw,
          profile?.activeBusinessOrgId,
          profile?.onboarding?.activeWorkspaceId,
        ].some(
          (id) =>
            !!id?.trim() &&
            id.trim() !== "personal" &&
            suppression.hiddenOrgIdToCanonical.has(id.trim())
        );

        if (process.env.NODE_ENV === "development") {
          logWorkspaceSwitcherCompaniesDev({
            userId: user.id,
            activeWorkspaceId:
              profileBusinessOrgRemapped?.trim() ||
              persistedId ||
              (profileLastActiveRemapped?.trim() &&
              profileLastActiveRemapped !== "personal"
                ? profileLastActiveRemapped.trim()
                : null),
            companies: snapshots.map((s) => ({
              orgId: s.orgId,
              name: s.name,
              legalName: s.legalName,
              ownerUid: s.ownerUid,
              createdAt: s.createdAt,
              membersCount: s.membersCount,
              projectsCount: s.projectsCount,
              source: s.source,
            })),
            visibleOrgIds: switcherList
              .filter((w) => w.type === "company")
              .map((w) => w.orgId ?? w.id),
            hiddenOrgIds: [...suppression.hiddenOrgIdToCanonical.keys()],
          });
          logDuplicateSuppressionDev(
            user.id,
            suppression,
            profileBusinessOrgRemapped?.trim() ||
              persistedId ||
              profileLastActiveRemapped?.trim() ||
              null
          );
        }

        const companyWorkspace = switcherList.find((w) =>
          isCompanyWorkspaceType(w.type)
        );
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
        const resolveOptions = {
          tenantMode: false as const,
          persistedId,
          profileWorkspaceId: profileOnboardingRemapped,
          profileBusinessOrgId: profileBusinessOrgRemapped,
          profileLastActiveWorkspaceId: profileLastActiveRemapped,
        };
        const { workspace: resolved, reason } = resolveActiveWorkspaceWithReason(
          switcherList,
          resolveOptions
        );
        const activeMatch =
          switcherList.find((w) => w.id === resolved.id) ?? resolved;
        setActiveWorkspaceState(activeMatch);
        persistActiveWorkspaceId(activeMatch.id);
        if (user.id) {
          if (hiddenDuplicateWasReferenced && activeMatch.type === "company") {
            const canonicalId = activeMatch.orgId ?? activeMatch.id;
            void persistLastActiveWorkspaceIdOnly(user.id, canonicalId).catch(
              () => undefined
            );
          } else {
            void persistLastActiveWorkspaceId(user.id, activeMatch).catch(
              () => undefined
            );
          }
        }
        if (activeMatch.type === "company") {
          clearExplicitPersonalWorkspace();
        }
        logWorkspaceResolveDebug({
          available: switcherList,
          active: activeMatch,
          reason,
          persistedId,
        });
      } catch {
        if (cancelled) return;
        const personal = listFallbackPersonal({
          id: user?.id ?? "unknown",
          email: user?.email,
          name: user?.name,
          firstName: profile?.firstName,
        });
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
    profile?.lastActiveWorkspaceId,
    profile?.firstName,
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
      if (user?.id) {
        void persistLastActiveWorkspaceId(user.id, next).catch(() => undefined);
      }
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
  firstName?: string;
}): ActiveWorkspace {
  return {
    id: "personal",
    type: "personal",
    name: getSoloWorkspaceDisplayName(user.firstName ?? user.name?.split(" ")[0]),
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
