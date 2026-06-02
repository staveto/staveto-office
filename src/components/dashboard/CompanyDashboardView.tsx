"use client";

import {
  FolderKanban,
  FileText,
  Wallet,
  AlertTriangle,
  Upload,
  Flag,
  UserPlus,
  ClipboardList,
  Users,
  Calendar,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSection } from "./DashboardSection";
import { CompanyMetricCard } from "./CompanyMetricCard";
import { AttentionPanel } from "./AttentionPanel";
import { ActiveJobsList } from "./ActiveJobsList";
import { DashboardQuotesList } from "./DashboardQuotesList";
import { CompactActionButton } from "./CompactActionButton";
import { RecommendedNextStep } from "./RecommendedNextStep";
import { EmptyState } from "./EmptyState";
import { DashboardWorkspaceHero } from "./DashboardWorkspaceHero";
import { TeamSnapshotCard } from "./TeamSnapshotCard";
import { useI18n } from "@/i18n/I18nContext";
import type { ActiveWorkspace } from "@/types/workspace";
import type { DashboardStats } from "@/lib/dashboardStats";
import {
  buildAttentionAlerts,
  getDashboardNextStep,
} from "@/lib/workspaceProduct";
import { useWorkspaceProduct } from "@/hooks/useWorkspaceProduct";
import type { QuoteStatus } from "@/lib/quotes";

type CompanyDashboardViewProps = {
  activeWorkspace: ActiveWorkspace;
  displayName: string;
  stats: DashboardStats;
  statsLoading: boolean;
};

function TodayMiniCard({ title, message }: { title: string; message: string }) {
  return (
    <Card className="bg-card shadow-sm">
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
      </CardContent>
    </Card>
  );
}

export function CompanyDashboardView({
  activeWorkspace,
  displayName,
  stats,
  statsLoading,
}: CompanyDashboardViewProps) {
  const { t } = useI18n();
  const { canManage, isOwner } = useWorkspaceProduct();
  const comingSoonLabel = t("dashboard.comingSoon");

  const stepInput = {
    activeJobsCount: stats.activeJobsCount,
    draftJobsCount: stats.draftJobsCount,
    waitingCustomerCount: stats.waitingCustomerCount,
    quotesAwaitingCount: stats.quotesAwaitingCount,
    delayedJobsCount: stats.delayedJobsCount,
  };

  const nextStep = getDashboardNextStep(stepInput, true);
  const attentionAlerts = buildAttentionAlerts(stepInput, true).map((a) => ({
    id: a.id,
    label: t(a.labelKey),
    count: a.count,
    href: a.href,
  }));

  const quoteStatusLabel = (status: QuoteStatus) => t(`quotes.status.${status}`);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <DashboardWorkspaceHero
        activeWorkspace={activeWorkspace}
        firstName={displayName}
        projectsCount={stats.activeJobsCount}
        estimatesCount={stats.quotesCount}
        statsLoading={statsLoading}
      />

      <DashboardSection title={t("dashboard.today.companyTitle")}>
        <p className="mb-3 text-sm text-muted-foreground">{t("dashboard.today.companyBrief")}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TodayMiniCard
            title={t("dashboard.today.activeJobs")}
            message={
              statsLoading
                ? "…"
                : t("dashboard.today.activeJobsCount", {
                    count: stats.activeJobsCount,
                  })
            }
          />
          <TodayMiniCard
            title={t("dashboard.today.draftRequests")}
            message={
              statsLoading
                ? "…"
                : t("dashboard.today.draftRequestsCount", {
                    count: stats.draftJobsCount,
                  })
            }
          />
          <TodayMiniCard
            title={t("dashboard.today.quotesAction")}
            message={
              statsLoading
                ? "…"
                : t("dashboard.today.quotesActionCount", {
                    count: stats.quotesAwaitingCount,
                  })
            }
          />
          <TodayMiniCard
            title={t("dashboard.today.team")}
            message={
              statsLoading
                ? "…"
                : stats.teamCount !== null
                  ? t("dashboard.today.teamCount", { count: stats.teamCount })
                  : t("dashboard.empty.noData")
            }
          />
        </div>
      </DashboardSection>

      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
        role="region"
        aria-label={t("dashboard.stats")}
      >
        <CompanyMetricCard
          title={t("dashboard.metric.activeJobs")}
          value={stats.activeJobsCount}
          icon={FolderKanban}
          loading={statsLoading}
        />
        <CompanyMetricCard
          title={t("dashboard.metric.draftJobs")}
          value={stats.draftJobsCount}
          icon={ClipboardList}
          loading={statsLoading}
        />
        <CompanyMetricCard
          title={t("dashboard.metric.quotesAction")}
          value={stats.quotesAwaitingCount}
          icon={FileText}
          loading={statsLoading}
        />
        <CompanyMetricCard
          title={t("dashboard.metric.team")}
          value={stats.teamCount}
          icon={Users}
          loading={statsLoading}
        />
        <CompanyMetricCard
          title={t("dashboard.stat.expensesMonth")}
          value={null}
          icon={Wallet}
          comingSoon
          comingSoonLabel={comingSoonLabel}
        />
        <CompanyMetricCard
          title={t("dashboard.metric.issues")}
          value={null}
          icon={AlertTriangle}
          comingSoon
          comingSoonLabel={comingSoonLabel}
        />
      </div>

      <ActiveJobsList
        title={t("dashboard.activeJobs.title")}
        jobs={stats.activeJobs}
        loading={statsLoading}
        viewAllLabel={t("dashboard.activeJobs.viewAll")}
        viewAllHref="/app/projects?filter=active"
        emptyMessage={t("dashboard.activeJobs.empty")}
        emptyCtaLabel={t("dashboard.activeJobs.createFirst")}
        emptyCtaHref="/app/projects/new"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <ActiveJobsList
          title={t("dashboard.draftJobs.title")}
          jobs={stats.draftJobs}
          loading={statsLoading}
          viewAllLabel={t("dashboard.draftJobs.viewAll")}
          viewAllHref="/app/projects?filter=concepts"
          emptyMessage={t("dashboard.draftJobs.empty")}
          emptyCtaLabel={t("dashboard.draftJobs.createFirst")}
          emptyCtaHref="/app/projects/new"
        />
        <DashboardQuotesList
          title={t("dashboard.quotesAction.title")}
          quotes={stats.quotesAwaiting}
          loading={statsLoading}
          viewAllLabel={t("dashboard.quotesAction.viewAll")}
          viewAllHref="/app/quotes"
          emptyMessage={t("dashboard.quotesAction.empty")}
          statusLabel={quoteStatusLabel}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionPanel
          title={t("dashboard.attention.title")}
          emptyMessage={t("dashboard.attention.emptyCompany")}
          alerts={attentionAlerts}
        />
        <TeamSnapshotCard
          title={t("dashboard.team.title")}
          count={stats.teamCount}
          loading={statsLoading}
          membersLabel={t("dashboard.team.viewMembers")}
          inviteLabel={t("dashboard.quick.inviteMember")}
          membersHref="/app/members"
          emptyHint={t("dashboard.team.soloHint")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {stats.delayedJobsCount > 0 ? (
          <ActiveJobsList
            title={t("dashboard.delayedJobs.title")}
            jobs={stats.delayedJobs}
            loading={statsLoading}
            viewAllLabel={t("dashboard.delayedJobs.viewAll")}
            viewAllHref="/app/projects?filter=active"
            emptyMessage={t("dashboard.delayedJobs.empty")}
            emptyCtaLabel={t("dashboard.activeJobs.viewAll")}
            emptyCtaHref="/app/projects?filter=active"
          />
        ) : (
          <Card className="bg-card shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Clock className="size-4 text-[#1D376A]/80" aria-hidden />
                {t("dashboard.delayedJobs.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 pt-0">
              <EmptyState message={t("dashboard.delayedJobs.none")} className="py-3" />
            </CardContent>
          </Card>
        )}
        <Card className="bg-card shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Calendar className="size-4 text-[#1D376A]/80" aria-hidden />
              {t("dashboard.today.planning")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <EmptyState message={t("dashboard.today.planningEmpty")} className="py-3" />
          </CardContent>
        </Card>
      </div>

      {isOwner ? (
        <Card className="border border-[#1D376A]/10 bg-[#1D376A]/[0.02] shadow-sm">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <TrendingUp className="size-4 text-[#1D376A]/80" aria-hidden />
              {t("dashboard.results.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-0">
            <EmptyState message={t("dashboard.results.comingSoon")} className="py-3" />
          </CardContent>
        </Card>
      ) : null}

      <RecommendedNextStep
        message={t(nextStep.messageKey)}
        ctaLabel={t(nextStep.ctaKey)}
        ctaHref={nextStep.ctaHref}
      />

      {canManage ? (
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
            <CompactActionButton
              label={t("dashboard.quick.inviteMember")}
              icon={UserPlus}
              href="/app/members"
            />
            <CompactActionButton
              label={t("dashboard.metric.draftJobs")}
              icon={ClipboardList}
              href="/app/projects?filter=concepts"
            />
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
      ) : null}

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
