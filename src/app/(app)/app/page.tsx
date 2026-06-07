"use client";



import { useEffect, useState } from "react";

import {

  DashboardHeroSkeleton,

  CompanyDashboardView,

  PersonalDashboardView,

} from "@/components/dashboard";

import { CompanyWorkspaceSwitchPrompt } from "@/components/dashboard/CompanyWorkspaceSwitchPrompt";
import { useI18n } from "@/i18n/I18nContext";

import { useAuth } from "@/context/AuthContext";

import { useWorkspace } from "@/context/WorkspaceContext";

import { isCompanyWorkspaceMode } from "@/lib/workspaceProduct";

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



export default function OverviewPage() {

  const { t } = useI18n();

  const { user, profile } = useAuth();

  const { activeWorkspace, availableWorkspaces } = useWorkspace();

  const [statsLoading, setStatsLoading] = useState(true);

  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);



  useEffect(() => {

    if (!user?.id || !activeWorkspace) return;



    let cancelled = false;



    void (async () => {

      setStatsLoading(true);

      try {

        const data = await fetchDashboardStats(activeWorkspace, user.id);

        if (cancelled) return;

        setStats(data);

      } finally {

        if (!cancelled) setStatsLoading(false);

      }

    })();



    return () => {

      cancelled = true;

    };

  }, [user?.id, activeWorkspace]);



  const displayName =

    profile?.firstName?.trim() ||

    user?.firstName?.trim() ||

    user?.name?.split(" ")[0]?.trim() ||

    t("nav.account");



  const isCompany = isCompanyWorkspaceMode(activeWorkspace);

  const hasCompanyWorkspace = availableWorkspaces.some((w) =>
    isCompanyWorkspaceType(w.type)
  );



  if (!user || !activeWorkspace) {

    return <DashboardSkeleton />;

  }



  if (isCompany) {

    return (

      <CompanyDashboardView

        activeWorkspace={activeWorkspace}

        displayName={displayName}

        stats={stats}

        statsLoading={statsLoading}

      />

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

