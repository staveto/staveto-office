"use client";

import { Suspense, useEffect, useState } from "react";
import {
  DashboardHeroSkeleton,
  CompanyDashboardView,
  PersonalDashboardView,
  WorkerDashboardView,
} from "@/components/dashboard";
import { StavetoFlyoverIntro } from "@/components/dashboard/flyover/StavetoFlyoverIntro";
import { CompanyWorkspaceSwitchPrompt } from "@/components/dashboard/CompanyWorkspaceSwitchPrompt";
import { CompanyProfileCompletionCard } from "@/components/settings/CompanyProfileCompletionCard";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useStavetoIntroPreference } from "@/hooks/useStavetoIntroPreference";
import {
  isCompanyWorkspaceMode,
  shouldShowWorkerDashboard,
} from "@/lib/workspaceProduct";
import { isCompanyWorkspaceType } from "@/types/workspace";
import {
  fetchDashboardStats,
  type DashboardStats,
} from "@/lib/dashboardStats";

const EMPTY_STATS: DashboardStats = {
  projectsCount: null,
  estimatesCount: null,
  recentJobs: [],
  activeJobsCount: 0,
  draftJobsCount: 0,
  waitingCustomerCount: 0,
  activeJobs: [],
  draftJobs: [],
  quotesCount: null,
  quotesAwaitingCount: 0,
  quotesAwaiting: [],
  teamCount: null,
  delayedJobsCount: 0,
  delayedJobs: [],
  quotesRecent: [],
};

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse max-w-6xl">
      <DashboardHeroSkeleton />
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

function useForceIntroFromUrl(): boolean {
  const [forceIntro, setForceIntro] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setForceIntro(params.get("intro") === "1");
  }, []);

  return forceIntro;
}

function OverviewPageContent() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const forceIntro = useForceIntroFromUrl();
  const { activeWorkspace, availableWorkspaces } = useWorkspace();
  const intro = useStavetoIntroPreference({ forceIntro });
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);

  const isCompany = isCompanyWorkspaceMode(activeWorkspace);
  const isWorkerHome =
    isCompany && shouldShowWorkerDashboard(activeWorkspace?.role);
  const workspaceKey = activeWorkspace
    ? `${activeWorkspace.id}:${activeWorkspace.orgId ?? ""}`
    : "";

  useEffect(() => {
    if (!user?.id || !activeWorkspace || isWorkerHome) {
      setStatsLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setStatsLoading(true);
      try {
        const data = await Promise.race([
          fetchDashboardStats(activeWorkspace, user.id),
          new Promise<DashboardStats>((resolve) =>
            window.setTimeout(() => resolve(EMPTY_STATS), 12_000)
          ),
        ]);
        if (cancelled) return;
        setStats(data);
      } catch {
        if (!cancelled) setStats(EMPTY_STATS);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, workspaceKey, isWorkerHome]);

  const displayName =
    profile?.firstName?.trim() ||
    user?.firstName?.trim() ||
    user?.name?.split(" ")[0]?.trim() ||
    t("nav.account");

  const hasCompanyWorkspace = availableWorkspaces.some((w) =>
    isCompanyWorkspaceType(w.type)
  );

  const showFlyover =
    intro.ready &&
    intro.visible &&
    isCompany &&
    !isWorkerHome &&
    !!user?.id &&
    !!activeWorkspace;

  if (!user || !activeWorkspace) {
    return (
      <>
        {showFlyover ? (
          <StavetoFlyoverIntro
            open
            onDismiss={intro.dismiss}
            onDisableAutoShow={intro.disableAutoShow}
            workspace={activeWorkspace!}
            uid={user?.id ?? ""}
            displayName={displayName}
            role={activeWorkspace?.role}
            stats={stats}
            statsLoading={statsLoading}
          />
        ) : null}
        <DashboardSkeleton />
      </>
    );
  }

  if (isWorkerHome) {
    return (
      <WorkerDashboardView
        activeWorkspace={activeWorkspace}
        displayName={displayName}
        uid={user.id}
      />
    );
  }

  if (isCompany) {
    return (
      <>
        {showFlyover ? (
          <StavetoFlyoverIntro
            open
            onDismiss={intro.dismiss}
            onDisableAutoShow={intro.disableAutoShow}
            workspace={activeWorkspace}
            uid={user.id}
            displayName={displayName}
            role={activeWorkspace.role}
            stats={stats}
            statsLoading={statsLoading}
          />
        ) : null}
        <div className="space-y-4">
          <CompanyProfileCompletionCard />
          <CompanyDashboardView
            activeWorkspace={activeWorkspace}
            displayName={displayName}
            stats={stats}
            statsLoading={statsLoading}
            uid={user.id}
          />
        </div>
      </>
    );
  }

  return (
    <PersonalDashboardView
      activeWorkspace={activeWorkspace}
      displayName={displayName}
      stats={stats}
      statsLoading={statsLoading}
      showCreateCompany={!hasCompanyWorkspace}
      companySwitchPrompt={
        hasCompanyWorkspace ? <CompanyWorkspaceSwitchPrompt variant="banner" /> : null
      }
    />
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <OverviewPageContent />
    </Suspense>
  );
}
