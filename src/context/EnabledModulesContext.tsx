"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isOwnerLikeRole } from "@/lib/workspaceProduct";
import {
  DEFAULT_ENABLED_MODULES,
  type EnabledModulesMap,
  type EnabledModulesPartial,
} from "@/lib/enabledModules";
import {
  loadOrganizationEnabledModules,
  saveOrganizationEnabledModules,
} from "@/services/organization/enabledModulesService";

type EnabledModulesContextValue = {
  modules: EnabledModulesMap;
  loading: boolean;
  isCompanyModulesActive: boolean;
  canEditModules: boolean;
  refreshModules: () => Promise<void>;
  updateModules: (patch: EnabledModulesPartial) => Promise<EnabledModulesMap>;
};

const EnabledModulesContext = createContext<EnabledModulesContextValue | null>(null);

export function EnabledModulesProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace();
  const orgId =
    activeWorkspace?.type === "company"
      ? activeWorkspace.orgId ?? activeWorkspace.id
      : undefined;

  const [modules, setModules] = useState<EnabledModulesMap>(DEFAULT_ENABLED_MODULES);
  const [loading, setLoading] = useState(false);

  const canEditModules =
    activeWorkspace?.type === "company" && isOwnerLikeRole(activeWorkspace.role);

  const refreshModules = useCallback(async () => {
    if (!orgId) {
      setModules(DEFAULT_ENABLED_MODULES);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resolved = await loadOrganizationEnabledModules(orgId);
      setModules(resolved);
    } catch {
      setModules(DEFAULT_ENABLED_MODULES);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refreshModules();
  }, [refreshModules]);

  const updateModules = useCallback(
    async (patch: EnabledModulesPartial) => {
      if (!orgId) throw new Error("No organization workspace");
      const saved = await saveOrganizationEnabledModules(orgId, patch);
      setModules(saved);
      return saved;
    },
    [orgId]
  );

  const value = useMemo(
    (): EnabledModulesContextValue => ({
      modules,
      loading,
      isCompanyModulesActive: !!orgId,
      canEditModules,
      refreshModules,
      updateModules,
    }),
    [modules, loading, orgId, canEditModules, refreshModules, updateModules]
  );

  return (
    <EnabledModulesContext.Provider value={value}>{children}</EnabledModulesContext.Provider>
  );
}

export function useEnabledModules(): EnabledModulesContextValue {
  const ctx = useContext(EnabledModulesContext);
  if (!ctx) {
    return {
      modules: DEFAULT_ENABLED_MODULES,
      loading: false,
      isCompanyModulesActive: false,
      canEditModules: false,
      refreshModules: async () => {},
      updateModules: async () => DEFAULT_ENABLED_MODULES,
    };
  }
  return ctx;
}
