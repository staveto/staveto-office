"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nContext";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DashboardStats } from "@/lib/dashboardStats";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useAuth } from "@/context/AuthContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
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
import {
  fetchMissionControlData,
  type MissionControlData,
} from "@/lib/missionControlData";

type CompanyDashboardViewProps = {
  activeWorkspace: ActiveWorkspace;
  displayName: string;
  stats: DashboardStats;
  statsLoading: boolean;
  uid: string;
};

export function CompanyDashboardView({
  activeWorkspace,
  displayName,
  stats,
  statsLoading,
  uid,
}: CompanyDashboardViewProps) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { role } = useWorkspaceProduct();
  const { modules } = useEnabledModules();
  const orgId = activeWorkspace.orgId ?? activeWorkspace.id;
  const { org, profile: orgProfile } = useCompanyOrgContext(orgId);
  const setupProgress = getCompanySetupProgress(profile, orgId);
  const companyType = resolveCompanyType(org?.companyType);

  const [missionData, setMissionData] = useState<MissionControlData | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [missionError, setMissionError] = useState<string | null>(null);

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
  const showOperationsHome = canManageCompanyOperations(role);
  const setupChecklistDismissed = isSetupChecklistDismissed(setupProgress);
  const showSetupChecklist = setupMode && !setupChecklistDismissed;

  const showWelcomeGuide =
    !setupMode &&
    !emptyCompany &&
    shouldShowWelcomeGuide(profile, {
      isCompanyWorkspace: true,
      role,
    });

  useEffect(() => {
    if (!uid || !activeWorkspace) {
      setMissionLoading(false);
      return;
    }

    let cancelled = false;
    setMissionLoading(true);
    setMissionError(null);

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
        if (!cancelled) setMissionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, activeWorkspace?.id, activeWorkspace?.orgId, activeWorkspace?.type]);

  if (statsLoading) {
    return (
      <div className="space-y-5 animate-pulse max-w-6xl">
        <div className="h-10 w-56 rounded-lg bg-muted" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 min-w-[9.5rem] flex-1 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-32 rounded-xl bg-muted" />
          <div className="h-48 rounded-xl bg-muted" />
        </div>
      </div>
    );
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
        loading={missionLoading}
        displayName={displayName}
        orgName={activeWorkspace.name}
        workspace={activeWorkspace}
        uid={uid}
      />
    </div>
  );
}
