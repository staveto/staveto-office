"use client";

import { useMemo } from "react";
import type { ActiveWorkspace } from "@/types/workspace";
import { isCompanyWorkspaceMode } from "@/lib/workspaceProduct";

export type CompanyDashboardBootstrapInput = {
  activeWorkspace: ActiveWorkspace | null;
  authLoading: boolean;
  roleResolving: boolean;
  statsLoading: boolean;
  statsLoaded: boolean;
  orgLoading: boolean;
  modulesLoading: boolean;
  missionLoading: boolean;
  missionLoaded: boolean;
};

export type CompanyDashboardBootstrapState = {
  isBootstrapping: boolean;
  isRefreshing: boolean;
};

export function useCompanyDashboardBootstrap({
  activeWorkspace,
  authLoading,
  roleResolving,
  statsLoading,
  statsLoaded,
  orgLoading,
  modulesLoading,
  missionLoading,
  missionLoaded,
}: CompanyDashboardBootstrapInput): CompanyDashboardBootstrapState {
  const isCompany = isCompanyWorkspaceMode(activeWorkspace);
  const orgId =
    isCompany && activeWorkspace
      ? (activeWorkspace.orgId ?? activeWorkspace.id)
      : undefined;

  const orgLoaded = !orgId || !orgLoading;
  const modulesLoaded = !isCompany || !modulesLoading;

  const isBootstrapping = useMemo(() => {
    if (!isCompany || !activeWorkspace) return authLoading;
    return (
      authLoading ||
      roleResolving ||
      !statsLoaded ||
      statsLoading ||
      !orgLoaded ||
      !modulesLoaded ||
      !missionLoaded ||
      missionLoading
    );
  }, [
    activeWorkspace,
    authLoading,
    isCompany,
    missionLoaded,
    missionLoading,
    modulesLoaded,
    orgLoaded,
    roleResolving,
    statsLoaded,
    statsLoading,
  ]);

  const isRefreshing = useMemo(() => {
    if (isBootstrapping) return false;
    return statsLoading || missionLoading || orgLoading || modulesLoading;
  }, [
    isBootstrapping,
    missionLoading,
    modulesLoading,
    orgLoading,
    statsLoading,
  ]);

  return {
    isBootstrapping,
    isRefreshing,
  };
}
