"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2, MapPin, RefreshCw } from "lucide-react";
import type { ActiveWorkspace, WorkspaceRole } from "@/types/workspace";
import {
  canManageCrewAssignments,
  canModerateTimeEntryGps,
} from "@/lib/operationsPermissions";
import { getCompanyIdForCallable } from "@/lib/workspaceStorage";
import { useOperationsView } from "@/hooks/useOperationsView";
import {
  fetchOperationsDashboardData,
  subscribeOperationsActiveTimers,
  type OperationsDashboardData,
  type OperationsTimeWindow,
} from "@/services/operations/operationsDashboardService";
import type { HideGpsPart } from "@/services/attendance/timeEntryGpsModerationService";
import { NotificationsDropdown } from "@/components/layout/NotificationsDropdown";
import { Button } from "@/components/ui/button";
import { LivePresenceBoard } from "./LivePresenceBoard";
import { TodayOperationsHero } from "./TodayOperationsHero";
import { TeamWorkloadPanel } from "./TeamWorkloadPanel";
import { ProjectInvestmentPanel } from "./ProjectInvestmentPanel";
import { AttentionCenter } from "./AttentionCenter";
import { OperationsUnassignedPanel } from "./OperationsUnassignedPanel";
import { OperationsCrewBoard } from "./OperationsCrewBoard";
import { DayTimelineFeed } from "./DayTimelineFeed";
import { OperationsMapPanel } from "./OperationsMapPanel";
import { OperationsMapView } from "./OperationsMapView";
import { HideGpsLocationDialog } from "./HideGpsLocationDialog";
import { cn } from "@/lib/utils";
import type { ActiveTimerState } from "@/services/operations/teamLiveStatusService";
import styles from "./operations.module.css";

type Props = {
  workspace: ActiveWorkspace;
  uid: string;
  role?: WorkspaceRole;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function OperationsDashboard({ workspace, uid, role, t }: Props) {
  const { view, setView, ready: viewReady } = useOperationsView();
  const [window, setWindow] = useState<OperationsTimeWindow>("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OperationsDashboardData | null>(null);
  const [liveTimers, setLiveTimers] = useState<Map<string, ActiveTimerState>>(new Map());
  const [hideGpsOpen, setHideGpsOpen] = useState(false);
  const [hideGpsRequest, setHideGpsRequest] = useState<{
    entryId: string;
    part: HideGpsPart;
  } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(
    async (opts?: { background?: boolean; timersOverride?: Map<string, ActiveTimerState> }) => {
      if (!opts?.background) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const next = await fetchOperationsDashboardData({
          workspace,
          uid,
          role,
          window,
          activeTimersOverride: opts?.timersOverride,
        });
        setData(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspace, uid, role, window]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const orgId = getCompanyIdForCallable(workspace);
    const unsubscribe = subscribeOperationsActiveTimers(orgId, [], (timers) => {
      setLiveTimers(timers);
      void load({ background: true, timersOverride: timers });
    });
    return unsubscribe;
  }, [data?.todayIso, workspace, load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const manageCrew = canManageCrewAssignments(role);
  const canModerateGps = canModerateTimeEntryGps(role);

  const handleRequestHideGps = useCallback((input: { entryId: string; part: HideGpsPart }) => {
    setHideGpsRequest(input);
    setHideGpsOpen(true);
  }, []);

  const memberRows = useMemo(
    () =>
      data?.teamStatus.map((m) => ({
        uid: m.uid,
        userId: m.uid,
        status: "active" as const,
        role: "worker" as const,
        email: m.email,
        displayName: m.name,
      })) ?? [],
    [data?.teamStatus]
  );

  const periodButtons = useMemo(
    () => [
      { id: "today" as const, label: t("operations.controls.today") },
      { id: "week" as const, label: t("operations.controls.week") },
      { id: "month" as const, label: t("operations.controls.month") },
    ],
    [t]
  );

  const viewButtons = useMemo(
    () => [
      { id: "overview" as const, label: t("operations.controls.overview"), icon: LayoutGrid },
      { id: "map" as const, label: t("operations.controls.map"), icon: MapPin },
    ],
    [t]
  );

  if ((loading && !data) || !viewReady) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#1D376A]" aria-label={t("common.loading")} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        <p>{error || t("operations.loadError")}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
          {t("common.refresh")}
        </Button>
      </div>
    );
  }

  const todayEntries = data.timeEntries.filter(
    (e) => (e.date ?? e.startedAt).slice(0, 10) === data.todayIso
  );

  const gpsModerationProps = {
    canModerateGps,
    onRequestHideGps: canModerateGps ? handleRequestHideGps : undefined,
  };

  return (
    <div className={cn(styles.shell, "mx-auto max-w-[90rem] space-y-5 pb-12")}>
      <header className={styles.opsPageHeader}>
        <div className={styles.opsPageHeaderTitle}>
          <h1 className="text-2xl font-bold tracking-tight text-[#1D376A] dark:text-slate-100">
            {t("operations.centerTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("operations.centerSubtitle")}</p>
        </div>

        <div className={styles.opsHeaderControls}>
          <div className={styles.opsControlGroup}>
            <span className={styles.opsControlLabel}>{t("operations.controls.viewLabel")}</span>
            <div className={cn(styles.opsSegmentTrack, styles.opsSegmentTrackView)} role="group">
              {viewButtons.map((v) => {
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setView(v.id)}
                    className={cn(
                      styles.opsSegmentBtn,
                      view === v.id && styles.opsSegmentBtnViewActive
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.opsControlGroup}>
            <span className={styles.opsControlLabel}>{t("operations.controls.periodLabel")}</span>
            <div className={styles.opsSegmentTrack} role="group">
              {periodButtons.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWindow(w.id)}
                  className={cn(
                    styles.opsSegmentBtn,
                    window === w.id && styles.opsSegmentBtnPeriodActive
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.opsHeaderActions}>
            <NotificationsDropdown />
            <Button
              type="button"
              variant="outline"
              className={styles.opsRefreshBtn}
              disabled={refreshing}
              onClick={() => void load({ background: true })}
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
              {t("operations.controls.refresh")}
            </Button>
          </div>
        </div>
      </header>

      {toast ? (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-[100] max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-lg",
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          )}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      <HideGpsLocationDialog
        open={hideGpsOpen}
        onOpenChange={setHideGpsOpen}
        entryId={hideGpsRequest?.entryId ?? null}
        part={hideGpsRequest?.part ?? null}
        hiddenByUid={uid}
        t={t}
        onSuccess={() => {
          setToast({ type: "success", message: t("operations.gps.hideSuccess") });
          void load({ background: true });
        }}
        onError={(message) => {
          setToast({
            type: "error",
            message: message.includes("permission-denied")
              ? t("operations.gps.hideErrorPermission")
              : t("operations.gps.hideError"),
          });
        }}
      />

      {view === "map" ? (
        <OperationsMapView
          data={data}
          liveTimers={liveTimers}
          t={t}
          {...gpsModerationProps}
        />
      ) : (
        <div className={styles.opsDashboard}>
          <div className={cn(styles.opsRowSplit, styles.opsRow40_60)}>
            <div className={styles.opsColHero}>
              <TodayOperationsHero metrics={data.todayOverview} t={t} />
            </div>
            <div className={styles.opsColLive}>
              <LivePresenceBoard members={data.teamStatus} t={t} dominant />
            </div>
          </div>

          <div className={cn(styles.opsRowSplit, styles.opsRow50_50)}>
            <div className={styles.opsColHalf}>
              <AttentionCenter alerts={data.alerts} t={t} />
            </div>
            <div className={styles.opsColHalf}>
              <OperationsUnassignedPanel groups={data.unassigned} t={t} />
            </div>
          </div>

          <div className={cn(styles.opsRowSplit, styles.opsRow50_50)}>
            <div className={styles.opsColHalf}>
              <ProjectInvestmentPanel projects={data.projectInvestments} t={t} />
            </div>
            <div className={styles.opsColHalf}>
              <TeamWorkloadPanel
                weekRows={data.workloadWeek}
                monthRows={data.workloadMonth}
                t={t}
              />
            </div>
          </div>

          <div className={styles.opsRowFull}>
            <OperationsMapPanel todayEntries={todayEntries} t={t} {...gpsModerationProps} />
          </div>

          <div className={styles.opsRowFull}>
            <OperationsCrewBoard
              projects={data.projects}
              members={memberRows}
              canManage={manageCrew}
              onChanged={() => void load({ background: true })}
              t={t}
            />
          </div>

          <div className={styles.opsRowFull}>
            <DayTimelineFeed events={data.timeline} t={t} />
          </div>
        </div>
      )}
    </div>
  );
}
