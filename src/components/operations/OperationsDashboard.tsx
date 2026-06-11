"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import { canManageCrewAssignments } from "@/lib/operationsPermissions";
import {
  fetchOperationsDashboardData,
  subscribeOperationsActiveTimers,
  type OperationsDashboardData,
  type OperationsTimeWindow,
} from "@/services/operations/operationsDashboardService";
import { AttentionPanel } from "./AttentionPanel";
import { TodayOverviewCards } from "./TodayOverviewCards";
import { TeamLiveStatusPanel } from "./TeamLiveStatusPanel";
import { ProjectCrewBoard } from "./ProjectCrewBoard";
import { UnassignedWorkPanel } from "./UnassignedWorkPanel";
import { TimeInvestmentPanel } from "./TimeInvestmentPanel";
import { TaskProgressBoard } from "./TaskProgressBoard";
import { Button } from "@/components/ui/button";

type Props = {
  workspace: ActiveWorkspace;
  uid: string;
  role?: WorkspaceRole;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function OperationsDashboard({ workspace, uid, role, t }: Props) {
  const [window, setWindow] = useState<OperationsTimeWindow>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OperationsDashboardData | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchOperationsDashboardData({
        workspace,
        uid,
        role,
        window,
      });
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, workspace.orgId, uid, role, window]);

  useEffect(() => {
    const timer = setInterval(() => {
      void load();
    }, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id, workspace.orgId, uid, role, window]);

  useEffect(() => {
    if (!data) return;
    const memberIds = data.teamStatus.map((m) => m.uid);
    if (memberIds.length === 0) return;
    const unsubscribe = subscribeOperationsActiveTimers(memberIds, () => {
      void load();
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.todayIso, window, workspace.id]);

  const manageCrew = canManageCrewAssignments(role);

  const windowButtons = useMemo(
    () => [
      { id: "today" as const, label: t("operations.window.today") },
      { id: "week" as const, label: t("operations.window.week") },
      { id: "month" as const, label: t("operations.window.month") },
    ],
    [t]
  );

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <p>{error || "Unable to load operations dashboard"}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          {t("common.refresh")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{t("operations.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("operations.subtitle")}</p>
        </div>
        <div className="inline-flex gap-1 rounded-lg border border-border p-0.5">
          {windowButtons.map((w) => (
            <Button
              key={w.id}
              size="sm"
              variant={window === w.id ? "secondary" : "ghost"}
              onClick={() => setWindow(w.id)}
            >
              {w.label}
            </Button>
          ))}
        </div>
      </header>

      <AttentionPanel alerts={data.alerts} t={t} />
      <TodayOverviewCards metrics={data.todayOverview} t={t} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProjectCrewBoard
            projects={data.projects}
            members={data.teamStatus.map((m) => ({
              uid: m.uid,
              status: "active",
              role: "member",
              email: m.email,
              displayName: m.name,
            }))}
            canManage={manageCrew}
            onChanged={load}
            t={t}
          />
        </div>
        <TeamLiveStatusPanel members={data.teamStatus} t={t} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <UnassignedWorkPanel groups={data.unassigned} t={t} />
        <TimeInvestmentPanel
          byProject={data.timeByProject}
          byTask={data.timeByTask}
          byEmployee={data.timeByEmployee}
          t={t}
        />
      </div>

      <TaskProgressBoard items={data.taskProgress} t={t} />
    </div>
  );
}
