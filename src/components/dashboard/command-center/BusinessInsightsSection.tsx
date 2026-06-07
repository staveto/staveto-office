"use client";

import Link from "next/link";
import { FolderKanban, FileText, Users, Wallet, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import type { DashboardStats } from "@/lib/dashboardStats";
import type { EnabledModulesMap } from "@/lib/enabledModules";
import { isModuleEnabled } from "@/lib/enabledModules";

type BusinessInsightsSectionProps = {
  stats: DashboardStats;
  statsLoading: boolean;
  modules: EnabledModulesMap;
  comingSoonLabel: string;
};

type InsightDef = {
  key: string;
  labelKey: string;
  value: number | null;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export function BusinessInsightsSection({
  stats,
  statsLoading,
  modules,
  comingSoonLabel,
}: BusinessInsightsSectionProps) {
  const { t } = useI18n();

  const insights: InsightDef[] = [];

  if (stats.activeJobsCount > 0 || stats.draftJobsCount > 0) {
    insights.push({
      key: "jobs",
      labelKey: "dashboard.metric.activeJobs",
      value: stats.activeJobsCount,
      href: "/app/projects?filter=active",
      icon: FolderKanban,
    });
  }

  if (isModuleEnabled(modules, "quotes") && (stats.quotesCount ?? 0) > 0) {
    insights.push({
      key: "offers",
      labelKey: "dashboard.metric.quotesAction",
      value: stats.quotesAwaitingCount,
      href: "/app/quotes",
      icon: FileText,
    });
  }

  if (isModuleEnabled(modules, "team") && stats.teamCount !== null && stats.teamCount > 0) {
    insights.push({
      key: "team",
      labelKey: "dashboard.metric.team",
      value: stats.teamCount,
      href: "/app/members",
      icon: Users,
    });
  }

  if (isModuleEnabled(modules, "expenses")) {
    insights.push({
      key: "expenses",
      labelKey: "dashboard.stat.expensesMonth",
      value: null,
      href: "/app/projects",
      icon: Wallet,
      comingSoon: true,
    });
  }

  const visibleInsights = insights.filter(
    (i) => !i.comingSoon || i.value !== null
  );

  if (visibleInsights.length === 0 || statsLoading) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {t("dashboard.command.insights.title")}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {visibleInsights.map((insight) => {
          const Icon = insight.icon;
          if (insight.comingSoon) {
            return (
              <div
                key={insight.key}
                className="rounded-xl px-4 py-3 ring-1 ring-border/40 bg-muted/20"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                  <span className="text-xs">{t(insight.labelKey)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{comingSoonLabel}</p>
              </div>
            );
          }

          return (
            <Link
              key={insight.key}
              href={insight.href}
              className={cn(
                "group rounded-xl px-4 py-3 ring-1 ring-border/40 bg-background",
                "transition-colors hover:bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                  <span className="text-xs">{t(insight.labelKey)}</span>
                </div>
                <ArrowRight
                  className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60"
                  aria-hidden
                />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{insight.value}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
