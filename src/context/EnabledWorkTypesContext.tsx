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
  DEFAULT_ENABLED_WORK_TYPES,
  listEnabledWorkTypes,
  type EnabledWorkTypesMap,
  type EnabledWorkTypesPartial,
} from "@/lib/enabledWorkTypes";
import type { WorkType } from "@/lib/workTypes";
import {
  loadOrganizationEnabledWorkTypes,
  saveOrganizationEnabledWorkTypes,
} from "@/services/organization/enabledWorkTypesService";

type EnabledWorkTypesContextValue = {
  workTypes: EnabledWorkTypesMap;
  visibleWorkTypes: WorkType[];
  loading: boolean;
  isCompanyWorkTypesActive: boolean;
  canEditWorkTypes: boolean;
  refreshWorkTypes: () => Promise<void>;
  updateWorkTypes: (patch: EnabledWorkTypesPartial) => Promise<EnabledWorkTypesMap>;
};

const EnabledWorkTypesContext = createContext<EnabledWorkTypesContextValue | null>(null);

export function EnabledWorkTypesProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspace } = useWorkspace();
  const orgId =
    activeWorkspace?.type === "company"
      ? activeWorkspace.orgId ?? activeWorkspace.id
      : undefined;

  const [workTypes, setWorkTypes] = useState<EnabledWorkTypesMap>(DEFAULT_ENABLED_WORK_TYPES);
  const [loading, setLoading] = useState(false);

  const canEditWorkTypes =
    activeWorkspace?.type === "company" && isOwnerLikeRole(activeWorkspace.role);

  const refreshWorkTypes = useCallback(async () => {
    if (!orgId) {
      setWorkTypes(DEFAULT_ENABLED_WORK_TYPES);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resolved = await loadOrganizationEnabledWorkTypes(orgId);
      setWorkTypes(resolved);
    } catch {
      setWorkTypes(DEFAULT_ENABLED_WORK_TYPES);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refreshWorkTypes();
  }, [refreshWorkTypes]);

  const updateWorkTypes = useCallback(
    async (patch: EnabledWorkTypesPartial) => {
      if (!orgId) throw new Error("No organization workspace");
      const saved = await saveOrganizationEnabledWorkTypes(orgId, patch);
      setWorkTypes(saved);
      return saved;
    },
    [orgId]
  );

  const visibleWorkTypes = useMemo(() => listEnabledWorkTypes(workTypes), [workTypes]);

  const value = useMemo(
    (): EnabledWorkTypesContextValue => ({
      workTypes,
      visibleWorkTypes,
      loading,
      isCompanyWorkTypesActive: !!orgId,
      canEditWorkTypes,
      refreshWorkTypes,
      updateWorkTypes,
    }),
    [
      workTypes,
      visibleWorkTypes,
      loading,
      orgId,
      canEditWorkTypes,
      refreshWorkTypes,
      updateWorkTypes,
    ]
  );

  return (
    <EnabledWorkTypesContext.Provider value={value}>{children}</EnabledWorkTypesContext.Provider>
  );
}

export function useEnabledWorkTypes(): EnabledWorkTypesContextValue {
  const ctx = useContext(EnabledWorkTypesContext);
  if (!ctx) {
    return {
      workTypes: DEFAULT_ENABLED_WORK_TYPES,
      visibleWorkTypes: listEnabledWorkTypes(DEFAULT_ENABLED_WORK_TYPES),
      loading: false,
      isCompanyWorkTypesActive: false,
      canEditWorkTypes: false,
      refreshWorkTypes: async () => {},
      updateWorkTypes: async () => DEFAULT_ENABLED_WORK_TYPES,
    };
  }
  return ctx;
}
