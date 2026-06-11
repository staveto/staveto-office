"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import type { WorkspaceRole } from "@/types/workspace";

/** All active org members may open team chat (workers read/write per Firestore isOrgChatWriter). */
const CHAT_ACCESS_ROLES: WorkspaceRole[] = [
  "owner",
  "admin",
  "manager",
  "accountant",
  "worker",
];

/** Matches Firestore `isOrgChatWriter` (owner/admin/manager/worker — not viewer/client). */
const CHAT_WRITE_ROLES: WorkspaceRole[] = ["owner", "admin", "manager", "worker"];

export function useBusinessChatAccess() {
  const { activeWorkspace } = useWorkspace();
  const { isCompany, role } = useWorkspaceProduct();

  return useMemo(() => {
    const orgId =
      isCompany && activeWorkspace?.type === "company"
        ? (activeWorkspace.orgId ?? activeWorkspace.id)
        : null;

    const canAccessBusinessChat =
      !!orgId && !!role && isCompany && CHAT_ACCESS_ROLES.includes(role);

    const isViewer = role === "client";

    const canWriteChat =
      canAccessBusinessChat &&
      !isViewer &&
      !!role &&
      CHAT_WRITE_ROLES.includes(role);

    return {
      orgId,
      canAccessBusinessChat,
      canWriteChat,
      isViewer,
    };
  }, [activeWorkspace, isCompany, role]);
}
