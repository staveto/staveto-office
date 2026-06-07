"use client";

import { useI18n } from "@/i18n/I18nContext";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DashboardStats } from "@/lib/dashboardStats";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import { useAuth } from "@/context/AuthContext";
import { useEnabledModules } from "@/context/EnabledModulesContext";
import { shouldShowWelcomeGuide } from "@/services/onboarding/welcomeGuideService";
import { BusinessWelcomeGuide } from "@/components/dashboard/BusinessWelcomeGuide";
import { CommandCenterHero } from "@/components/dashboard/command-center/CommandCenterHero";
import { PrimaryActionsRow } from "@/components/dashboard/command-center/PrimaryActionsRow";
import { CompanyTypeActionLauncher } from "@/components/dashboard/command-center/CompanyTypeActionLauncher";
import { BusinessActivityFeed } from "@/components/dashboard/command-center/BusinessActivityFeed";
import { BusinessInsightsSection } from "@/components/dashboard/command-center/BusinessInsightsSection";
import { SetupDashboardChecklist } from "@/components/dashboard/command-center/SetupDashboardChecklist";
import { useCompanyOrgContext } from "@/components/dashboard/command-center/useCompanyOrgContext";
import {
  buildActivityFeed,
  buildSetupChecklist,
  getFirstIncompleteSetupItem,
  getSetupActivityTipKey,
  hasMeaningfulInsights,
  isEmptyCompanyMode,
  isSetupDashboardMode,
  resolveCompanyType,
} from "@/lib/dashboardCommandCenter";

type CompanyDashboardViewProps = {
  activeWorkspace: ActiveWorkspace;
  displayName: string;
  stats: DashboardStats;
  statsLoading: boolean;
};

export function CompanyDashboardView({
  activeWorkspace,
  displayName,
  stats,
  statsLoading,
}: CompanyDashboardViewProps) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { canManage, role } = useWorkspaceProduct();
  const { modules } = useEnabledModules();
  const orgId = activeWorkspace.orgId ?? activeWorkspace.id;
  const { org, profile: orgProfile } = useCompanyOrgContext(orgId);

  const setupMode = isSetupDashboardMode(org, stats);
  const emptyCompany = isEmptyCompanyMode(stats);
  const companyType = resolveCompanyType(org?.companyType);
  const showInsights = !emptyCompany && hasMeaningfulInsights(stats, modules);

  const setupItems = buildSetupChecklist(stats, orgProfile, modules, companyType);
  const firstIncomplete = getFirstIncompleteSetupItem(setupItems);
  const hasActivity = !statsLoading && buildActivityFeed(stats).length > 0;
  const activityTipKey =
    !hasActivity && (setupMode || emptyCompany)
      ? getSetupActivityTipKey(firstIncomplete)
      : null;

  const showWelcomeGuide =
    !setupMode &&
    !emptyCompany &&
    shouldShowWelcomeGuide(profile, {
      isCompanyWorkspace: true,
      role,
    });

  const comingSoonLabel = t("dashboard.comingSoon");

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12 md:space-y-10">
      <CommandCenterHero
        activeWorkspace={activeWorkspace}
        firstName={displayName}
        stats={stats}
        statsLoading={statsLoading}
        modules={modules}
      />

      <PrimaryActionsRow
        modules={modules}
        canManage={canManage}
        comingSoonLabel={comingSoonLabel}
      />

      {setupMode ? (
        <SetupDashboardChecklist
          stats={stats}
          profile={orgProfile}
          modules={modules}
          companyType={companyType}
        />
      ) : null}

      {showWelcomeGuide && orgId ? (
        <BusinessWelcomeGuide orgId={orgId} />
      ) : null}

      {!setupMode && !emptyCompany ? (
        <CompanyTypeActionLauncher companyType={companyType} />
      ) : null}

      {(setupMode || !emptyCompany) ? (
        <BusinessActivityFeed
          stats={stats}
          loading={statsLoading}
          emptyTipKey={activityTipKey}
        />
      ) : null}

      {showInsights ? (
        <BusinessInsightsSection
          stats={stats}
          statsLoading={statsLoading}
          modules={modules}
          comingSoonLabel={comingSoonLabel}
        />
      ) : null}
    </div>
  );
}
