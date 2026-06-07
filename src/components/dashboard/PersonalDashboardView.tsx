"use client";

import type { ReactNode } from "react";
import {
  FolderKanban,
  FileText,
  Wallet,
  Upload,
  Flag,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSection } from "./DashboardSection";
import { CompanyMetricCard } from "./CompanyMetricCard";
import { ActiveJobsList } from "./ActiveJobsList";
import { CompactActionButton } from "./CompactActionButton";
import { RecommendedNextStep } from "./RecommendedNextStep";
import { EmptyState } from "./EmptyState";
import { DashboardWorkspaceHero } from "./DashboardWorkspaceHero";
import { useI18n } from "@/i18n/I18nContext";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DashboardStats } from "@/lib/dashboardStats";
import { getDashboardNextStep } from "@/lib/workspaceProduct";
import { BUSINESS_CREATE_ROUTE } from "@/services/onboarding";

type PersonalDashboardViewProps = {
  activeWorkspace: ActiveWorkspace;
  displayName: string;
  stats: DashboardStats;
  statsLoading: boolean;
  showCreateCompany: boolean;
  companySwitchPrompt?: ReactNode;
};

export function PersonalDashboardView({
  activeWorkspace,
  displayName,
  stats,
  statsLoading,
  showCreateCompany,
  companySwitchPrompt,
}: PersonalDashboardViewProps) {
  const { t } = useI18n();
  const comingSoonLabel = t("dashboard.comingSoon");

  const stepInput = {
    activeJobsCount: stats.activeJobsCount,
    draftJobsCount: stats.draftJobsCount,
    waitingCustomerCount: stats.waitingCustomerCount,
    quotesAwaitingCount: stats.quotesAwaitingCount,
    delayedJobsCount: 0,
  };

  const nextStep = getDashboardNextStep(stepInput, false);
  const jobsForList =
    stats.activeJobs.length > 0 ? stats.activeJobs : stats.recentJobs;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <DashboardWorkspaceHero
        activeWorkspace={activeWorkspace}
        firstName={displayName}
        projectsCount={stats.projectsCount}
        estimatesCount={stats.quotesCount ?? stats.estimatesCount}
        statsLoading={statsLoading}
      />

      {companySwitchPrompt}

      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
        role="region"
        aria-label={t("dashboard.stats")}
      >
        <CompanyMetricCard
          title={t("dashboard.metric.activeJobs")}
          value={stats.projectsCount}
          icon={FolderKanban}
          loading={statsLoading}
        />
        <CompanyMetricCard
          title={t("dashboard.stat.quotes")}
          value={stats.quotesCount ?? stats.estimatesCount}
          icon={FileText}
          loading={statsLoading}
        />
        <CompanyMetricCard
          title={t("dashboard.stat.expensesMonth")}
          value={null}
          icon={Wallet}
          comingSoon
          comingSoonLabel={comingSoonLabel}
        />
      </div>

      <ActiveJobsList
        title={t("dashboard.activeJobs.title")}
        jobs={jobsForList}
        loading={statsLoading}
        viewAllLabel={t("dashboard.activeJobs.viewAll")}
        viewAllHref="/app/projects"
        emptyMessage={t("dashboard.activeJobs.empty")}
        emptyCtaLabel={t("dashboard.activeJobs.createFirst")}
        emptyCtaHref="/app/projects/new"
      />

      <DashboardSection title={t("dashboard.quickActions")}>
        <div className="flex flex-wrap gap-2">
          <CompactActionButton
            label={t("dashboard.primaryNewJob")}
            icon={FolderKanban}
            href="/app/projects/new"
          />
          <CompactActionButton
            label={t("dashboard.secondaryNewQuote")}
            icon={FileText}
            href="/app/quotes/new"
          />
          {showCreateCompany ? (
            <CompactActionButton
              label={t("dashboard.hero.createCompany")}
              icon={Building2}
              href={BUSINESS_CREATE_ROUTE}
            />
          ) : null}
          <CompactActionButton
            label={t("dashboard.quick.addExpense")}
            icon={Wallet}
            disabled
            comingSoonLabel={comingSoonLabel}
          />
          <CompactActionButton
            label={t("dashboard.quick.uploadDoc")}
            icon={Upload}
            disabled
            comingSoonLabel={comingSoonLabel}
          />
          <CompactActionButton
            label={t("dashboard.quick.reportIssue")}
            icon={Flag}
            disabled
            comingSoonLabel={comingSoonLabel}
          />
        </div>
      </DashboardSection>

      <RecommendedNextStep
        message={t(nextStep.messageKey)}
        ctaLabel={t(nextStep.ctaKey)}
        ctaHref={nextStep.ctaHref}
      />

      <Card className="bg-card shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold">
            {t("dashboard.recentActivity")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <EmptyState message={t("dashboard.empty.noActivity")} className="py-3" />
        </CardContent>
      </Card>
    </div>
  );
}
