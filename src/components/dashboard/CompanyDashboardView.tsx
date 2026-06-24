"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nContext";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DashboardStats } from "@/lib/dashboardStats";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useAuth } from "@/context/AuthContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCompanyDashboardBootstrap } from "@/hooks/useCompanyDashboardBootstrap";
import { shouldShowWelcomeGuide } from "@/services/onboarding/welcomeGuideService";
import {
  getCompanySetupProgress,
  isSetupChecklistDismissed,
} from "@/services/onboarding/setupChecklistService";
import { BusinessWelcomeGuide } from "@/components/dashboard/BusinessWelcomeGuide";
import { SetupDashboardChecklist } from "@/components/dashboard/command-center/SetupDashboardChecklist";
import { useCompanyOrgContext } from "@/components/dashboard/command-center/useCompanyOrgContext";
import {
  isEmptyCompanyMode,
  resolveCompanyType,
  resolveSetupDashboardState,
} from "@/lib/dashboardCommandCenter";
import { canManageCompanyOperations } from "@/lib/workspaceProduct";
import { MissionControlDashboard } from "@/components/dashboard/mission-control/MissionControlDashboard";
import { CompanyDashboardBootSkeleton } from "@/components/dashboard/CompanyDashboardBootSkeleton";
import { CompanyProfileCompletionCard } from "@/components/settings/CompanyProfileCompletionCard";
import {
  fetchMissionControlData,
  recomputeTeamWithLiveTimers,
  type MissionControlData,
} from "@/lib/missionControlData";
import {
  subscribeOrgLiveTimers,
  type ActiveTimerState,
} from "@/services/operations/teamLiveStatusService";
import { isCompanyWorkspaceType } from "@/types/workspace";

type CompanyDashboardViewProps = {
  activeWorkspace: ActiveWorkspace;
  displayName: string;
  stats: DashboardStats;
  statsLoading: boolean;
  statsLoaded: boolean;
  uid: string;
};

export function CompanyDashboardView({
  activeWorkspace,
  displayName,
  stats,
  statsLoading,
  statsLoaded,
  uid,
}: CompanyDashboardViewProps) {
  const { t } = useI18n();
  const { profile, loading: authLoading } = useAuth();
  const { roleResolving } = useWorkspace();
  const { role } = useWorkspaceProduct();
  const { modules, loading: modulesLoading } = useEnabledModules();
  const orgId = activeWorkspace.orgId ?? activeWorkspace.id;
  const { org, profile: orgProfile, loading: orgLoading } = useCompanyOrgContext(orgId);
  const setupProgress = getCompanySetupProgress(profile, orgId);
  const companyType = resolveCompanyType(org?.companyType);

  const [missionData, setMissionData] = useState<MissionControlData | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [missionLoaded, setMissionLoaded] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [liveTimers, setLiveTimers] = useState<Map<string, ActiveTimerState>>(new Map());

  const workspaceKey = `${activeWorkspace.id}:${activeWorkspace.orgId ?? ""}`;

  const { isBootstrapping, isRefreshing } = useCompanyDashboardBootstrap({
    activeWorkspace,
    authLoading,
    roleResolving,
    statsLoading,
    statsLoaded,
    orgLoading,
    modulesLoading,
    missionLoading,
    missionLoaded,
  });

  const dashboardReady = !isBootstrapping;
  const profileLoaded = !authLoading;
  const roleResolved = !roleResolving && !!role;

  const { setupMode } = resolveSetupDashboardState(
    stats,
    orgProfile,
    modules,
    companyType,
    org,
    org ?? undefined,
    setupProgress
  );
  const emptyCompany = isEmptyCompanyMode(stats);
  const showOperationsHome = roleResolved && canManageCompanyOperations(role);
  const setupChecklistDismissed = isSetupChecklistDismissed(setupProgress);
  const showSetupChecklist =
    dashboardReady && setupMode && !setupChecklistDismissed;

  const showWelcomeGuide =
    dashboardReady &&
    profileLoaded &&
    statsLoaded &&
    !setupMode &&
    !emptyCompany &&
    shouldShowWelcomeGuide(profile, {
      isCompanyWorkspace: true,
      role,
    });

  useEffect(() => {
    setMissionLoaded(false);
    setMissionData(null);
    setMissionLoading(true);
    setMissionError(null);
  }, [workspaceKey]);

  useEffect(() => {
    if (!uid || !activeWorkspace) {
      setMissionLoading(false);
      setMissionLoaded(true);
      return;
    }

    let cancelled = false;
    setMissionError(null);
    setMissionLoading(true);

    void fetchMissionControlData(activeWorkspace, uid)
      .then((data) => {
        if (!cancelled) setMissionData(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setMissionError(e instanceof Error ? e.message : String(e));
          setMissionData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMissionLoading(false);
          setMissionLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uid, workspaceKey, activeWorkspace]);

  useEffect(() => {
    if (!isCompanyWorkspaceType(activeWorkspace.type) || !orgId.trim()) return;

    return subscribeOrgLiveTimers(orgId, (timers) => {
      setLiveTimers(new Map(timers));
    });
  }, [activeWorkspace.type, orgId]);

  useEffect(() => {
    setMissionData((prev) =>
      prev ? { ...prev, team: recomputeTeamWithLiveTimers(prev.planning, liveTimers) } : prev
    );
  }, [liveTimers]);

  useEffect(() => {
    const hasRunning = [...liveTimers.values()].some((timer) => timer.status === "running");
    if (!hasRunning) return;
    const id = window.setInterval(() => {
      setMissionData((prev) =>
        prev ? { ...prev, team: recomputeTeamWithLiveTimers(prev.planning, liveTimers) } : prev
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [liveTimers]);

  if (isBootstrapping) {
    return <CompanyDashboardBootSkeleton />;
  }

  if (setupMode && !showOperationsHome) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 pb-12">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("dashboard.command.setup.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.command.setup.subtitle")}</p>
        </header>
        <SetupDashboardChecklist
          orgId={orgId}
          stats={stats}
          profile={orgProfile}
          modules={modules}
          companyType={companyType}
          org={org ?? undefined}
        />
      </div>
    );
  }

  if (emptyCompany && !showOperationsHome) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-12 text-center">
        <h1 className="text-2xl font-semibold">{t("dashboard.command.setup.title")}</h1>
        <p className="text-muted-foreground">{t("dashboard.command.setupHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CompanyProfileCompletionCard />
      {isRefreshing ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t("dashboard.boot.message")}
        </p>
      ) : null}
      <div className="space-y-6">
        {showSetupChecklist ? (
          <SetupDashboardChecklist
            orgId={orgId}
            stats={stats}
            profile={orgProfile}
            modules={modules}
            companyType={companyType}
            org={org ?? undefined}
          />
        ) : null}
        {showWelcomeGuide && orgId ? <BusinessWelcomeGuide orgId={orgId} /> : null}
        {missionError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {missionError}
          </div>
        ) : null}
        <MissionControlDashboard
          data={missionData}
          loading={missionLoading && !missionData}
          displayName={displayName}
          orgName={activeWorkspace.name}
          workspace={activeWorkspace}
          uid={uid}
        />
      </div>
    </div>
  );
}
