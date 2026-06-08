"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  isCompanyWorkspaceMode,
  canManageCompanyOperations,
  isOwnerLikeRole,
  shouldShowWorkerDashboard,
} from "@/lib/workspaceProduct";
import { getCompanyRoleLabelKey } from "@/lib/companyRoles";

export function useWorkspaceProduct() {
  const { activeWorkspace, availableWorkspaces } = useWorkspace();

  return useMemo(() => {
    const isCompany = isCompanyWorkspaceMode(activeWorkspace);
    const role = activeWorkspace?.role;
    const canManage = canManageCompanyOperations(role);
    const isOwner = isOwnerLikeRole(role);
    const isField = shouldShowWorkerDashboard(role);
    const hasCompanyWorkspace = availableWorkspaces.some(
      (w) => w.type === "company"
    );
    const roleLabelKey =
      isCompany && role
        ? getCompanyRoleLabelKey(role)
        : !isCompany
          ? "header.context.personalLabel"
          : null;

    return {
      activeWorkspace,
      isCompany,
      isPersonal: !isCompany,
      role,
      roleLabelKey,
      canManage,
      isOwner,
      isField,
      hasCompanyWorkspace,
      companyName: isCompany ? activeWorkspace?.name : undefined,
    };
  }, [activeWorkspace, availableWorkspaces]);
}
