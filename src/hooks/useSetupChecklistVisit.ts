"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  getCompanySetupProgress,
  markSetupChecklistStepVisited,
  type SoftSetupChecklistStepId,
} from "@/services/onboarding/setupChecklistService";

/**
 * Marks an optional setup checklist step complete when the user opens the page.
 * Idempotent — skips if already visited or not in company workspace.
 */
export function useSetupChecklistVisit(stepId: SoftSetupChecklistStepId): void {
  const { user, profile, refreshUser } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const markedRef = useRef(false);

  useEffect(() => {
    if (markedRef.current) return;
    if (!user?.id || !activeWorkspace || !isCompanyWorkspaceType(activeWorkspace.type)) return;

    const orgId = activeWorkspace.orgId?.trim() || activeWorkspace.id?.trim();
    if (!orgId) return;

    const progress = getCompanySetupProgress(profile, orgId);
    if (progress[stepId]) return;

    markedRef.current = true;
    void markSetupChecklistStepVisited(user.id, orgId, stepId)
      .then(() => refreshUser())
      .catch(() => {
        markedRef.current = false;
      });
  }, [user?.id, activeWorkspace, profile, stepId, refreshUser]);
}
