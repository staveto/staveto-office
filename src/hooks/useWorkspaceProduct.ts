"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  isCompanyWorkspaceMode,
  canManageCompanyOperations,
  isOwnerLikeRole,
  isFieldRole,
} from "@/lib/workspaceProduct";

export function useWorkspaceProduct() {
  const { activeWorkspace, availableWorkspaces } = useWorkspace();

  return useMemo(() => {
    const isCompany = isCompanyWorkspaceMode(activeWorkspace);
    const role = activeWorkspace?.role;
    const canManage = canManageCompanyOperations(role);
    const isOwner = isOwnerLikeRole(role);
    const isField = isFieldRole(role);
    const hasCompanyWorkspace = availableWorkspaces.some(
      (w) => w.type === "company"
    );

    return {
      activeWorkspace,
      isCompany,
      isPersonal: !isCompany,
      role,
      canManage,
      isOwner,
      isField,
      hasCompanyWorkspace,
      companyName: isCompany ? activeWorkspace?.name : undefined,
    };
  }, [activeWorkspace, availableWorkspaces]);
}
