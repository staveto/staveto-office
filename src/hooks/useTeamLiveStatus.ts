"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import type { TeamLiveStatusItem } from "@/lib/operationsMetrics";
import { canViewOperationsDashboard } from "@/lib/operationsPermissions";
import { getCompanyIdForCallable } from "@/lib/workspaceStorage";
import {
  fetchTeamLiveStatus,
  subscribeOperationsActiveTimers,
} from "@/services/operations/operationsDashboardService";

export function useTeamLiveStatus(
  workspace: ActiveWorkspace | null | undefined,
  uid: string | undefined,
  role: WorkspaceRole | undefined
) {
  const [teamStatus, setTeamStatus] = useState<TeamLiveStatusItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (activeTimersOverride?: Parameters<typeof fetchTeamLiveStatus>[0]["activeTimersOverride"]) => {
      if (!workspace || !uid || !canViewOperationsDashboard(role)) {
        setTeamStatus([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const items = await fetchTeamLiveStatus({
          workspace,
          uid,
          role,
          activeTimersOverride,
        });
        setTeamStatus(items);
      } catch {
        setTeamStatus([]);
      } finally {
        setLoading(false);
      }
    },
    [workspace, uid, role]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const orgId = workspace ? getCompanyIdForCallable(workspace) : undefined;

  useEffect(() => {
    if (!orgId || !uid || !canViewOperationsDashboard(role)) return;
    const unsubscribe = subscribeOperationsActiveTimers(orgId, [], (timers) => {
      void load(timers);
    });
    return unsubscribe;
  }, [orgId, uid, role, load]);

  const activeWorkers = teamStatus.filter((m) => m.status === "working" || m.status === "paused");

  return { teamStatus, activeWorkers, loading };
}
